import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

/** yyyy-mm-dd */
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** base(yyyy-mm-dd) + days => yyyy-mm-dd */
function addDaysStr(base: string, days: number) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toDateStart(str: string) {
  return new Date(`${str}T00:00:00`);
}
function toDateEnd(str: string) {
  return new Date(`${str}T23:59:59`);
}
function fmtYmd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function weekday0Sun(d: Date) {
  return d.getDay(); // 0=Sun..6=Sat
}

type DeviceType = "controller" | "turntable" | "both";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? todayStr();
    const to = url.searchParams.get("to") ?? addDaysStr(from, 7);
    const teacherId = url.searchParams.get("teacherId");
    const roomId = url.searchParams.get("roomId");

    /* ---------------------------------
     * 1) Lessons + Classes
     * --------------------------------- */
    let lessonQ = supabaseServer
      .from("lessons")
      .select(
        `
        id,
        lesson_date,
        lesson_time,
        status,
        allow_change_override,
        room_id,
        class:classes!inner (
          id,
          student_id,
          teacher_id,
          room_id,
          device_type
        )
      `
      )
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (teacherId) lessonQ = lessonQ.eq("class.teacher_id", teacherId);
    if (roomId) lessonQ = lessonQ.eq("room_id", roomId);

    const { data: lessonData, error: lessonErr } = await lessonQ;
    if (lessonErr) {
      return NextResponse.json({ error: lessonErr.message }, { status: 500 });
    }

    const lessonRowsRaw: any[] = lessonData ?? [];

    /* ---------------------------------
     * 2) Collect IDs
     * --------------------------------- */
    const teacherIds = new Set<string>();
    const studentIds = new Set<string>();
    const roomIds = new Set<string>();

    lessonRowsRaw.forEach((r) => {
      const c = Array.isArray(r.class) ? r.class?.[0] : r.class;
      if (c?.teacher_id) teacherIds.add(c.teacher_id);
      if (c?.student_id) studentIds.add(c.student_id);

      const rid = r.room_id ?? c?.room_id;
      if (rid) roomIds.add(rid);
    });

    /* ---------------------------------
     * 3) Profiles name map
     * --------------------------------- */
    const nameMap = new Map<string, string>();
    const allProfileIds = Array.from(new Set([...teacherIds, ...studentIds]));

    if (allProfileIds.length > 0) {
      const { data: profs, error: pErr } = await supabaseServer
        .from("profiles")
        .select("id, name")
        .in("id", allProfileIds);

      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.name ?? "알 수 없음"));
    }

    /* ---------------------------------
     * 4) Room name map
     * --------------------------------- */
    const roomMap = new Map<string, string>();
    const roomIdList = Array.from(roomIds);

    if (roomIdList.length > 0) {
      const { data: rooms, error: rErr } = await supabaseServer
        .from("practice_rooms")
        .select("id, name")
        .in("id", roomIdList);

      if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
      (rooms ?? []).forEach((rm: any) => roomMap.set(rm.id, rm.name ?? rm.id));
    }

    /* ---------------------------------
     * 5) Lessons (frontend-friendly)
     * --------------------------------- */
    const lessons = lessonRowsRaw.map((r) => {
      const c = Array.isArray(r.class) ? r.class?.[0] : r.class;
      const tId = c?.teacher_id ?? null;
      const sId = c?.student_id ?? null;
      const rid = (r.room_id ?? c?.room_id) ?? null;

      return {
        id: r.id,
        lesson_date: r.lesson_date,
        lesson_time: r.lesson_time,
        status: r.status,
        allow_change_override: r.allow_change_override,
        teacher_id: tId,
        teacher_name: tId ? nameMap.get(tId) ?? "알 수 없음" : "미지정",
        student_id: sId,
        student_name: sId ? nameMap.get(sId) ?? "알 수 없음" : "알 수 없음",
        room_id: rid,
        room_name: rid ? roomMap.get(rid) ?? rid : "미지정",
        device_type: (c?.device_type ?? null) as DeviceType | null,
        class_id: c?.id ?? null,
      };
    });

    /* ---------------------------------
     * 6) Availability (통합 화면용)
     * --------------------------------- */
    const fromD = toDateStart(from);
    const toD = toDateEnd(to);

    const targetTeacherIds = teacherId
      ? [teacherId]
      : Array.from(teacherIds);

    let availability: Array<{
      teacher_id: string;
      teacher_name: string;
      date: string;
      weekday: number;
      start_time: string;
      end_time: string;
      device_type: DeviceType;
    }> = [];

    if (targetTeacherIds.length > 0) {
      const { data: avData, error: avErr } = await supabaseServer
        .from("teacher_availabilities")
        .select(
          `
          teacher_id,
          weekday,
          start_time,
          end_time,
          device_type,
          is_active,
          effective_from,
          effective_until
        `
        )
        .in("teacher_id", targetTeacherIds)
        .eq("is_active", true);

      if (avErr) return NextResponse.json({ error: avErr.message }, { status: 500 });

      const avRows: any[] = avData ?? [];

      for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
        const ymd = fmtYmd(d);
        const wd = weekday0Sun(d);

        for (const av of avRows) {
          if (Number(av.weekday) !== wd) continue;

          const avStart = av.effective_from
            ? toDateStart(String(av.effective_from))
            : null;
          const avEnd = av.effective_until
            ? toDateEnd(String(av.effective_until))
            : null;

          if (avStart && d < avStart) continue;
          if (avEnd && d > avEnd) continue;

          availability.push({
            teacher_id: av.teacher_id,
            teacher_name: nameMap.get(av.teacher_id) ?? "알 수 없음",
            date: ymd,
            weekday: wd,
            start_time: String(av.start_time),
            end_time: String(av.end_time),
            device_type: (av.device_type ?? "both") as DeviceType,
          });
        }
      }
    }

    /* ---------------------------------
     * 7) Summary
     * --------------------------------- */
    const summary = {
      total: lessons.length,
      today: lessons.filter((r) => r.lesson_date === todayStr()).length,
      overrideOn: lessons.filter((r) => r.allow_change_override === true).length,
      availability_events: availability.length,
    };

    return NextResponse.json({
      summary,
      lessons,
      availability,
      range: { from, to },
      filters: { teacherId: teacherId ?? null, roomId: roomId ?? null },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "서버 오류" },
      { status: 500 }
    );
  }
}
