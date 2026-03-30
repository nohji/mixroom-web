import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

/** yyyy-mm-dd (local) */
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
  return d.getDay();
}
function hhmm(t: any) {
  const s = String(t ?? "");
  return s.length >= 5 ? s.slice(0, 5) : s;
}
function cmpLesson(
  a: { lesson_date: string; lesson_time: string },
  b: { lesson_date: string; lesson_time: string }
) {
  if (a.lesson_date !== b.lesson_date) return a.lesson_date.localeCompare(b.lesson_date);
  return a.lesson_time.localeCompare(b.lesson_time);
}

function normalizeReservationKind(v: any): "STUDENT" | "ADMIN_BLOCK" {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "ADMIN_BLOCK" || s === "ADMIN-BLOCK" || s === "BLOCK") {
    return "ADMIN_BLOCK";
  }
  return "STUDENT";
}

type DeviceType = "controller" | "turntable" | "both";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? todayStr();
    const to = url.searchParams.get("to") ?? addDaysStr(from, 6);

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
        class_id,
        lesson_date,
        lesson_time,
        status,
        allow_change_override,
        room_id,
        teacher_id,
        class:classes!inner (
          id,
          student_id,
          device_type,
          type,
          total_lessons
        )
      `
      )
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (teacherId) lessonQ = lessonQ.eq("teacher_id", teacherId);

    const { data: lessonData, error: lessonErr } = await lessonQ;
    if (lessonErr) return NextResponse.json({ error: lessonErr.message }, { status: 500 });

    const lessonRowsRaw: any[] = lessonData ?? [];

    /* ---------------------------------
     * 2) collect IDs + classIds
     * --------------------------------- */
    const teacherIdsFromLessons = new Set<string>();
    const studentIds = new Set<string>();
    const roomIds = new Set<string>();
    const classIds = new Set<string>();

    lessonRowsRaw.forEach((r) => {
      const c = Array.isArray(r.class) ? r.class?.[0] : r.class;

      if (r.teacher_id) teacherIdsFromLessons.add(String(r.teacher_id));
      if (c?.student_id) studentIds.add(String(c.student_id));
      if (r.class_id) classIds.add(String(r.class_id));
      if (r.room_id) roomIds.add(String(r.room_id));
    });

    /* ---------------------------------
     * 2.1) Practice reservations (admin weekly)
     *  - 운영차단도 포함
     *  - voucher 없는 row도 보이도록 inner join 제거
     * --------------------------------- */
    let practiceQ = supabaseServer
      .from("practice_reservations")
      .select(
        `
        id,
        voucher_id,
        room_id,
        date,
        start_time,
        end_time,
        status,
        reservation_kind,
        admin_block_reason,
        voucher:practice_vouchers (
          id,
          class_id,
          class:classes (
            id,
            student_id
          )
        )
      `
      )
      .gte("date", from)
      .lte("date", to)
      .in("status", ["APPROVED"])
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (roomId) practiceQ = practiceQ.eq("room_id", roomId);

    const { data: practiceData, error: practiceErr } = await practiceQ;
    if (practiceErr) return NextResponse.json({ error: practiceErr.message }, { status: 500 });

    const practiceRowsRaw: any[] = practiceData ?? [];

    // practice에서 나온 student/room도 맵 구성에 포함
    practiceRowsRaw.forEach((r) => {
      if (r.room_id) roomIds.add(String(r.room_id));

      const v = Array.isArray(r.voucher) ? r.voucher?.[0] : r.voucher;
      const c = v?.class ? (Array.isArray(v.class) ? v.class?.[0] : v.class) : null;
      if (c?.student_id) studentIds.add(String(c.student_id));
    });

    /* ---------------------------------
     * 2.5) availability 대상 teacher ids
     * --------------------------------- */
    let targetTeacherIds: string[] = [];
    if (teacherId) {
      targetTeacherIds = [teacherId];
    } else {
      const { data: tRows, error: tErr } = await supabaseServer
        .from("teacher_availabilities")
        .select("teacher_id")
        .eq("is_active", true);

      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

      targetTeacherIds = Array.from(new Set((tRows ?? []).map((x: any) => String(x.teacher_id))));
    }

    /* ---------------------------------
     * 3) profiles name map
     * --------------------------------- */
    const nameMap = new Map<string, string>();
    const allProfileIds = Array.from(
      new Set([...teacherIdsFromLessons, ...studentIds, ...targetTeacherIds])
    );

    if (allProfileIds.length > 0) {
      const { data: profs, error: pErr } = await supabaseServer
        .from("profiles")
        .select("id, name")
        .in("id", allProfileIds);

      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      (profs ?? []).forEach((p: any) => nameMap.set(String(p.id), p.name ?? "알 수 없음"));
    }

    /* ---------------------------------
     * 4) room map
     * --------------------------------- */
    const roomMap = new Map<string, string>();
    const roomIdList = Array.from(roomIds);
    if (roomIdList.length > 0) {
      const { data: rooms, error: rErr } = await supabaseServer
        .from("practice_rooms")
        .select("id, name")
        .in("id", roomIdList);

      if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
      (rooms ?? []).forEach((rm: any) => roomMap.set(String(rm.id), rm.name ?? String(rm.id)));
    }

    /* ---------------------------------
     * 5) 진행회차 계산
     * --------------------------------- */
    const classLessonIndex = new Map<string, Map<string, number>>();
    const classIdList = Array.from(classIds);

    if (classIdList.length > 0) {
      const { data: allLessons, error: allErr } = await supabaseServer
        .from("lessons")
        .select("id, class_id, lesson_date, lesson_time")
        .in("class_id", classIdList)
        .order("lesson_date", { ascending: true })
        .order("lesson_time", { ascending: true });

      if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 });

      const byClass = new Map<string, any[]>();
      (allLessons ?? []).forEach((r: any) => {
        const cid = String(r.class_id);
        if (!byClass.has(cid)) byClass.set(cid, []);
        byClass.get(cid)!.push({
          id: String(r.id),
          lesson_date: String(r.lesson_date),
          lesson_time: hhmm(r.lesson_time),
        });
      });

      for (const [cid, arr] of byClass.entries()) {
        arr.sort(cmpLesson);
        const idxMap = new Map<string, number>();
        arr.forEach((x, i) => idxMap.set(x.id, i + 1));
        classLessonIndex.set(cid, idxMap);
      }
    }

    /* ---------------------------------
     * 6) Lessons (frontend-friendly)
     * --------------------------------- */
    let lessons = lessonRowsRaw.map((r) => {
      const c = Array.isArray(r.class) ? r.class?.[0] : r.class;

      const tId = r.teacher_id ? String(r.teacher_id) : null;
      const sId = c?.student_id ? String(c.student_id) : null;
      const classId = r.class_id ? String(r.class_id) : c?.id ? String(c.id) : null;

      const rid = r.room_id ? String(r.room_id) : null;
      const roomName = rid ? roomMap.get(rid) ?? rid : "미지정";

      const nth = classId ? classLessonIndex.get(classId)?.get(String(r.id)) ?? null : null;

      return {
        id: String(r.id),
        lesson_date: String(r.lesson_date),
        lesson_time: hhmm(r.lesson_time),
        status: String(r.status ?? ""),
        allow_change_override: Boolean(r.allow_change_override),

        teacher_id: tId,
        teacher_name: tId ? nameMap.get(tId) ?? "알 수 없음" : "미지정",

        student_id: sId,
        student_name: sId ? nameMap.get(sId) ?? "알 수 없음" : "알 수 없음",

        room_id: rid,
        room_name: roomName,

        device_type: (c?.device_type ?? null) as DeviceType | null,

        class_id: classId,
        class_type: c?.type ? String(c.type) : null,
        total_lessons:
          typeof c?.total_lessons === "number"
            ? c.total_lessons
            : Number(c?.total_lessons ?? 0) || null,
        lesson_nth: nth,
      };
    });

    if (roomId) lessons = lessons.filter((l) => l.room_id === roomId);

    /* ---------------------------------
     * 6.1) Practice reservations (frontend-friendly)
     * --------------------------------- */
    const practice_reservations = practiceRowsRaw.map((r) => {
      const rid = r.room_id ? String(r.room_id) : null;
      const roomName = rid ? roomMap.get(rid) ?? rid : "미지정";

      const v = Array.isArray(r.voucher) ? r.voucher?.[0] : r.voucher;
      const c = v?.class ? (Array.isArray(v.class) ? v.class?.[0] : v.class) : null;

      const studentId = c?.student_id ? String(c.student_id) : null;

      const ymd = String(r.date ?? "");
      const st = String(r.start_time ?? "");
      const et = String(r.end_time ?? "");

      const start_ts = ymd && st ? `${ymd}T${st}:00` : null;
      const end_ts = ymd && et ? `${ymd}T${et}:00` : null;

      const reservationKind = normalizeReservationKind(r.reservation_kind);
      const isAdminBlock = reservationKind === "ADMIN_BLOCK";

      return {
        id: String(r.id),
        room_id: rid,
        room_name: roomName,

        date: ymd,
        start_time: st || null,
        end_time: et || null,

        start_ts,
        end_ts,

        status: String(r.status ?? ""),
        reservation_kind: reservationKind,
        admin_block_reason: r.admin_block_reason ?? null,

        student_id: studentId,
        student_name: isAdminBlock
          ? "운영차단"
          : studentId
          ? nameMap.get(studentId) ?? "알 수 없음"
          : "알 수 없음",

        voucher_id: v?.id ? String(v.id) : r.voucher_id ? String(r.voucher_id) : null,
        class_id: v?.class_id ? String(v.class_id) : null,
      };
    });

    /* ---------------------------------
     * 7) Availability
     * --------------------------------- */
    const fromD = toDateStart(from);
    const toD = toDateStart(to);

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

      for (
        let cur = new Date(fromD);
        cur <= toD;
        cur = new Date(addDaysStr(fmtYmd(cur), 1) + "T00:00:00")
      ) {
        const ymdStr = fmtYmd(cur);
        const wd = weekday0Sun(cur);

        for (const av of avRows) {
          if (Number(av.weekday) !== wd) continue;

          const avStart = av.effective_from ? toDateStart(String(av.effective_from)) : null;
          const avEnd = av.effective_until ? toDateEnd(String(av.effective_until)) : null;

          if (avStart && cur < avStart) continue;
          if (avEnd && cur > avEnd) continue;

          const tid = String(av.teacher_id);

          availability.push({
            teacher_id: tid,
            teacher_name: nameMap.get(tid) ?? "알 수 없음",
            date: ymdStr,
            weekday: wd,
            start_time: String(av.start_time),
            end_time: String(av.end_time),
            device_type: (av.device_type ?? "both") as DeviceType,
          });
        }
      }
    }

    const summary = {
      total: lessons.length,
      today: lessons.filter((r) => r.lesson_date === todayStr()).length,
      overrideOn: lessons.filter((r) => r.allow_change_override === true).length,
      availability_events: availability.length,
      practice_total: practice_reservations.length,
    };

    return NextResponse.json({
      summary,
      lessons,
      availability,
      practice_reservations,
      range: { from, to },
      filters: { teacherId: teacherId ?? null, roomId: roomId ?? null },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}