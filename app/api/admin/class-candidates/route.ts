import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type DeviceType = "controller" | "turntable";
type ClassType = "1month" | "3month";

const LESSON_COUNT_BY_CLASS: Record<ClassType, number> = {
  "1month": 4,
  "3month": 12,
};

const STEP_MIN = 30;

/* utils */
function toMin(t: string) {
  const [hh, mm] = String(t).slice(0, 5).split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toHHMM(min: number) {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}
function addDaysYMD(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addWeeksYMD(ymd: string, weeks: number) {
  return addDaysYMD(ymd, weeks * 7);
}
function weekdayOf(ymd: string) {
  return new Date(`${ymd}T00:00:00`).getDay();
}

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(req.url);

    const type = (url.searchParams.get("type") ?? "") as ClassType;
    const deviceType = (url.searchParams.get("deviceType") ?? "") as DeviceType;
    const startDate = url.searchParams.get("startDate") ?? "";
    const weekday = Number(url.searchParams.get("weekday"));

    const preferredTime = url.searchParams.get("preferredTime") ?? "";
    const timeFlexMin = Number(url.searchParams.get("timeFlexMin") ?? 0);
    const timeFlexMax = Number(url.searchParams.get("timeFlexMax") ?? 0);

    if (!type || !deviceType || !startDate || Number.isNaN(weekday) || !preferredTime) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }
    if (!["1month", "3month"].includes(type)) return NextResponse.json({ error: "type 오류" }, { status: 400 });
    if (!["controller", "turntable"].includes(deviceType)) return NextResponse.json({ error: "deviceType 오류" }, { status: 400 });
    if (weekday < 0 || weekday > 6) return NextResponse.json({ error: "weekday 오류" }, { status: 400 });
    if (!/^\d{2}:\d{2}/.test(preferredTime)) return NextResponse.json({ error: "preferredTime 형식 오류(HH:mm)" }, { status: 400 });
    if (timeFlexMin > 0 || timeFlexMax < 0) return NextResponse.json({ error: "timeFlexMin/Max 값 오류" }, { status: 400 });

    const lessonCount = LESSON_COUNT_BY_CLASS[type];

    // 1) startDate → firstDate 보정
    let firstDate = startDate;
    {
      const wd = weekdayOf(firstDate);
      const delta = (weekday - wd + 7) % 7;
      if (delta !== 0) firstDate = addDaysYMD(firstDate, delta);
    }

    // 2) 전체 회차 날짜
    const lessonDates = Array.from({ length: lessonCount }).map((_, i) => addWeeksYMD(firstDate, i));

    // 3) 시간 후보
    const baseMin = toMin(preferredTime);
    const timeCandidatesMin: number[] = [];
    for (let m = baseMin + timeFlexMin; m <= baseMin + timeFlexMax; m += STEP_MIN) timeCandidatesMin.push(m);
    const timeCandidatesStr = timeCandidatesMin.map(toHHMM);
    if (timeCandidatesStr.length === 0) return NextResponse.json({ rows: [] });

    // 4) availability
    const availDeviceTypes =
      deviceType === "controller" ? ["controller", "both"] : ["turntable", "both"];

    const { data: avails, error: avErr } = await supabaseServer
      .from("teacher_availabilities")
      .select(
        `
        teacher_id,
        weekday,
        start_time,
        end_time,
        slot_minutes,
        effective_from,
        effective_until,
        teacher:profiles!teacher_availabilities_teacher_id_fkey ( id, name )
      `
      )
      .eq("is_active", true)
      .eq("weekday", weekday)
      .in("device_type", availDeviceTypes);

    if (avErr) return NextResponse.json({ error: avErr.message }, { status: 500 });
    if (!avails || avails.length === 0) return NextResponse.json({ rows: [] });

    // 5) usable rooms
    const roomFilterCol = deviceType === "controller" ? "allow_controller" : "allow_turntable";
    const { data: rooms, error: rErr } = await supabaseServer
      .from("practice_rooms")
      .select("id, name")
      .eq("is_active", true)
      .eq(roomFilterCol, true);

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    if (!rooms || rooms.length === 0) return NextResponse.json({ rows: [] });

    // 6) busy lessons (전체 날짜 × 후보 시간)
    const { data: busyLessons, error: lErr } = await supabaseServer
      .from("lessons")
      .select(
        `
        lesson_date,
        lesson_time,
        room_id,
        class:classes!inner ( teacher_id )
      `
      )
      .in("lesson_date", lessonDates)
      .in("lesson_time", timeCandidatesStr);

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

    // key = date|time -> busy sets
    const busyTeacher = new Map<string, Set<string>>();
    const busyRoom = new Map<string, Set<string>>();

    const addBusy = (map: Map<string, Set<string>>, key: string, id: string) => {
      const s = map.get(key) ?? new Set<string>();
      s.add(id);
      map.set(key, s);
    };

    (busyLessons ?? []).forEach((x: any) => {
      const key = `${x.lesson_date}|${x.lesson_time}`;
      const tId = Array.isArray(x.class) ? x.class?.[0]?.teacher_id : x.class?.teacher_id;
      if (tId) addBusy(busyTeacher, key, tId);
      if (x.room_id) addBusy(busyRoom, key, x.room_id);
    });

    // 7) 후보 = teacher 단위로 "전체 회차에 대해 배정 가능"이면 통과
    const rows: any[] = [];
    const MAX = 30;

    for (const a of avails as any[]) {
      const teacherId = a.teacher_id as string;
      const teacherName = (Array.isArray(a.teacher) ? a.teacher?.[0]?.name : a.teacher?.name) ?? "강사";

      let okAll = true;

      for (const date of lessonDates) {
        let okDate = false;

        // 근무기간 체크(있으면 적용)
        const ef = a.effective_from ? String(a.effective_from) : null;
        const eu = a.effective_until ? String(a.effective_until) : null;
        if (ef && date < ef) { okAll = false; break; }
        if (eu && date > eu) { okAll = false; break; }

        for (const m of timeCandidatesMin) {
          const timeStr = toHHMM(m);

          // 근무시간/슬롯 체크
          const s = toMin(a.start_time);
          const e = toMin(a.end_time);
          const step = Number(a.slot_minutes ?? 60);
          if (!(m >= s && m + step <= e)) continue;
          if ((m - s) % step !== 0) continue;

          const key = `${date}|${timeStr}`;

          if (busyTeacher.get(key)?.has(teacherId)) continue;

          const hasFreeRoom = rooms.some((r) => !busyRoom.get(key)?.has(r.id));
          if (hasFreeRoom) {
            okDate = true;
            break;
          }
        }

        if (!okDate) { okAll = false; break; }
      }

      if (!okAll) continue;

      rows.push({
        teacher_id: teacherId,
        teacher_name: teacherName,
        start_date: firstDate,
        weekday,
        preferred_time: preferredTime,
        time_flex_min: timeFlexMin,
        time_flex_max: timeFlexMax,
        lesson_count: lessonCount,
        reason: "전체 회차에서 시간/룸 가능",
      });

      if (rows.length >= MAX) break;
    }

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
