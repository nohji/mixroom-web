import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type DeviceType = "controller" | "turntable";
type ClassType = "1month" | "3month";

const LESSON_COUNT_BY_CLASS: Record<ClassType, number> = {
  "1month": 4,
  "3month": 12,
};

function toMin(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function addDaysYMD(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}
function addWeeksYMD(ymd: string, weeks: number) {
  return addDaysYMD(ymd, weeks * 7);
}
function weekdayOf(ymd: string) {
  return new Date(`${ymd}T00:00:00`).getDay();
}

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(req.url);

    const studentId = url.searchParams.get("studentId") ?? "";
    const type = (url.searchParams.get("type") ?? "") as ClassType;
    const deviceType = (url.searchParams.get("deviceType") ?? "") as DeviceType;
    const startDate = url.searchParams.get("startDate") ?? "";
    const weekday = Number(url.searchParams.get("weekday"));
    const time = url.searchParams.get("time") ?? "";

    if (!studentId || !type || !deviceType || !startDate || Number.isNaN(weekday) || !time) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }
    if (!["1month", "3month"].includes(type)) return NextResponse.json({ error: "type 오류" }, { status: 400 });
    if (!["controller", "turntable"].includes(deviceType)) return NextResponse.json({ error: "deviceType 오류" }, { status: 400 });
    if (weekday < 0 || weekday > 6) return NextResponse.json({ error: "weekday 오류" }, { status: 400 });

    const lessonCount = LESSON_COUNT_BY_CLASS[type];

    // 1) startDate의 요일이 weekday와 다르면, 다음 weekday로 보정
    let firstDate = startDate;
    {
      const wd = weekdayOf(firstDate);
      const delta = (weekday - wd + 7) % 7;
      if (delta !== 0) firstDate = addDaysYMD(firstDate, delta);
    }

    // 2) 전체 레슨 날짜 생성 (firstDate + i주)
    const lessonDates: string[] = [];
    for (let i = 0; i < lessonCount; i++) {
      lessonDates.push(addWeeksYMD(firstDate, i));
    }

    // ✅ 핵심 수정: both 포함하도록 device_type 필터 변경
    const availDeviceTypes =
      deviceType === "controller"
        ? (["controller", "both"] as const)
        : (["turntable", "both"] as const);

    // 3) 가능한 강사 근무(availability) 후보 가져오기
    const { data: avails, error: aErr } = await supabaseServer
      .from("teacher_availabilities")
      .select(`
        id,
        teacher_id,
        weekday,
        start_time,
        end_time,
        slot_minutes,
        device_type,
        is_active,
        teacher:profiles!teacher_availabilities_teacher_id_fkey ( id, name )
      `)
      .eq("is_active", true)
      .eq("weekday", weekday)
      // ❌ .eq("device_type", deviceType)
      .in("device_type", [...availDeviceTypes]); // ✅ both 포함

    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

    console.log("[class-candidates] deviceType:", deviceType);
    console.log("[class-candidates] availDeviceTypes:", availDeviceTypes);
    console.log("[class-candidates] avails count:", avails?.length ?? 0);

    const timeMin = toMin(time);

    // 4) time이 근무 범위에 들어가는 availability만
    const timeMatched = (avails ?? []).filter((a: any) => {
      const s = toMin(a.start_time);
      const e = toMin(a.end_time);
      const step = Number(a.slot_minutes ?? 60);

      if (!(timeMin >= s && timeMin + step <= e)) return false;
      return ((timeMin - s) % step) === 0;
    });

    if (timeMatched.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const teacherIds = Array.from(new Set(timeMatched.map((a: any) => a.teacher_id)));

    // 5) 룸 후보(활성 + 기기 허용)
    const roomFilterCol = deviceType === "controller" ? "allow_controller" : "allow_turntable";
    const { data: rooms, error: rErr } = await supabaseServer
      .from("practice_rooms")
      .select("id, name, allow_controller, allow_turntable, is_active")
      .eq("is_active", true)
      .eq(roomFilterCol, true);

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    if (!rooms || rooms.length === 0) return NextResponse.json({ rows: [] });

    // 6) 전체 회차 날짜들에 대해 같은 시간에 이미 잡힌 레슨 조회
    const { data: busyLessons, error: lErr } = await supabaseServer
      .from("lessons")
      .select(`
        id,
        lesson_date,
        lesson_time,
        room_id,
        class:classes!inner ( teacher_id )
      `)
      .in("lesson_date", lessonDates)
      .eq("lesson_time", time);

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

    // 7) 날짜별로 "바쁜 teacher" / "바쁜 room" 맵 만들기
    const busyTeacherByDate = new Map<string, Set<string>>();
    const busyRoomByDate = new Map<string, Set<string>>();

    function getSet(map: Map<string, Set<string>>, key: string) {
      const v = map.get(key);
      if (v) return v;
      const n = new Set<string>();
      map.set(key, n);
      return n;
    }

    (busyLessons ?? []).forEach((x: any) => {
      const date = x.lesson_date as string;
      const tId = Array.isArray(x.class) ? x.class?.[0]?.teacher_id : x.class?.teacher_id;
      if (tId) getSet(busyTeacherByDate, date).add(tId);
      if (x.room_id) getSet(busyRoomByDate, date).add(x.room_id);
    });

    // 8) 후보 생성: (teacher, room) 조합이 "모든 회차"에서 충돌 없으면 통과
    const candidates: any[] = [];
    const MAX = 30;

    for (const a of timeMatched as any[]) {
      const teacherId = a.teacher_id as string;
      const teacherName =
        (Array.isArray(a.teacher) ? a.teacher?.[0]?.name : a.teacher?.name) ?? "강사";

      const teacherOk = lessonDates.every((d) => {
        const busySet = busyTeacherByDate.get(d);
        return busySet ? !busySet.has(teacherId) : true;
      });
      if (!teacherOk) continue;

      for (const room of rooms) {
        const roomOk = lessonDates.every((d) => {
          const busySet = busyRoomByDate.get(d);
          return busySet ? !busySet.has(room.id) : true;
        });
        if (!roomOk) continue;

        candidates.push({
          teacher_id: teacherId,
          teacher_name: teacherName,
          room_id: room.id,
          room_name: room.name,
          start_date: firstDate,
          time,
          weekday,
          lesson_dates: lessonDates,
          reason: `전체 ${lessonCount}회 충돌 검사 통과`,
        });

        if (candidates.length >= MAX) break;
      }

      if (candidates.length >= MAX) break;
    }

    return NextResponse.json({ rows: candidates });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
