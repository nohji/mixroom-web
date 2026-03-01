// app/api/student/my-lessons/options/route.ts
import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/requireStudent";
import { supabaseServer } from "@/lib/supabaseServer";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}

function clampHHMM(t: string) {
  return String(t ?? "").slice(0, 5);
}

function parseYmdLocal(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function timeToMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minToTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * ✅ weekday normalize
 * - DB가 0~6이면 그대로 OK
 * - DB가 1~7이면 7->0, 나머지 -1
 */
function normalizeDow(dbWeekday: number) {
  if (dbWeekday >= 0 && dbWeekday <= 6) return dbWeekday;
  if (dbWeekday >= 1 && dbWeekday <= 7) return dbWeekday === 7 ? 0 : dbWeekday - 1;
  return dbWeekday; // 이상값이면 그대로(디버그용)
}

export async function GET(req: Request) {
  const guard = await requireStudent();
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  const url = new URL(req.url);
  const teacher_id = url.searchParams.get("teacher_id") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!teacher_id) return json({ error: "TEACHER_ID_REQUIRED" }, 400);
  if (!isYmd(from) || !isYmd(to)) return json({ error: "INVALID_RANGE" }, 400);

  // 1) 룸 목록
  const { data: rooms, error: roomErr } = await supabaseServer
    .from("practice_rooms")
    .select("id, name")
    .order("name", { ascending: true });

  if (roomErr) return json({ error: roomErr.message }, 500);

  const roomIds = (rooms ?? []).map((r: any) => String(r.id));

  // 2) ✅ 강사 근무시간(teacher_availabilities)
  const { data: avails, error: aErr } = await supabaseServer
    .from("teacher_availabilities")
    .select("weekday, start_time, end_time")
    .eq("teacher_id", teacher_id);

  if (aErr) return json({ error: aErr.message }, 500);

  // weekday(0~6) -> windows
  const availByDow = new Map<number, { s: number; e: number }[]>();
  (avails ?? []).forEach((a: any) => {
    const dow = normalizeDow(Number(a.weekday));
    const s = timeToMin(clampHHMM(a.start_time));
    const e = timeToMin(clampHHMM(a.end_time));
    const arr = availByDow.get(dow) ?? [];
    arr.push({ s, e });
    availByDow.set(dow, arr);
  });

  // 3) ✅ 기간 내 레슨 조회
  // (A) 룸 점유 계산용: 전체 lessons(취소 제외) -> room_id 기준 block
  const { data: lessonsAll, error: lErrAll } = await supabaseServer
    .from("lessons")
    .select("lesson_date, lesson_time, room_id, status")
    .gte("lesson_date", from)
    .lte("lesson_date", to)
    .neq("status", "canceled");

  if (lErrAll) return json({ error: lErrAll.message }, 500);

  const lessonBlocked = new Set<string>(); // `${date}|${time}|${roomId}`
  (lessonsAll ?? []).forEach((l: any) => {
    const d = String(l.lesson_date).slice(0, 10);
    const t = clampHHMM(l.lesson_time);
    const rid = String(l.room_id ?? "");
    if (d && t && rid) lessonBlocked.add(`${d}|${t}|${rid}`);
  });

  // (B) ✅ 강사 충돌 계산용: 해당 teacher의 scheduled만 -> date+time 기준 block
  // 룸이 비어있어도 강사가 같은 시간에 레슨이 있으면 "무조건 불가" 정책
  const { data: lessonsTeacher, error: lErrTeacher } = await supabaseServer
    .from("lessons")
    .select("lesson_date, lesson_time, status")
    .eq("teacher_id", teacher_id)
    .eq("status", "scheduled")
    .gte("lesson_date", from)
    .lte("lesson_date", to);

  if (lErrTeacher) return json({ error: lErrTeacher.message }, 500);

  const teacherBusy = new Set<string>(); // `${date}|${time}`
  (lessonsTeacher ?? []).forEach((l: any) => {
    const d = String(l.lesson_date).slice(0, 10);
    const t = clampHHMM(l.lesson_time);
    if (d && t) teacherBusy.add(`${d}|${t}`);
  });

  // 4) 날짜별 옵션 생성 (1시간 단위)
  const start = parseYmdLocal(from);
  const end = parseYmdLocal(to);

  const by_date: Record<
    string,
    {
      times: string[];
      rooms_by_time: Record<string, string[]>;
    }
  > = {};

  for (let cur = new Date(start); cur <= end; cur = addDays(cur, 1)) {
    const dateStr = ymd(cur);
    const dow = cur.getDay(); // 0~6
    const windows = availByDow.get(dow) ?? [];
    if (windows.length === 0) continue;

    // 근무윈도우를 60분 단위 슬롯으로 생성
    const timeSet = new Set<string>();

    for (const w of windows) {
      // 1시간 단위 정책:
      // start가 13:30이면 14:00부터
      const first = Math.ceil(w.s / 60) * 60;

      // end 미포함: m+60 <= end 일때만 슬롯 OK
      for (let m = first; m + 60 <= w.e; m += 60) {
        timeSet.add(minToTime(m));
      }
    }

    const times = Array.from(timeSet).sort();

    const rooms_by_time: Record<string, string[]> = {};
    const validTimes: string[] = [];

    for (const t of times) {
      // ✅ 핵심: 강사가 같은 날짜/시간에 레슨이 있으면 룸 상관없이 그 시간 자체가 불가
      if (teacherBusy.has(`${dateStr}|${t}`)) continue;

      const okRooms: string[] = [];
      for (const rid of roomIds) {
        const key = `${dateStr}|${t}|${rid}`;
        if (lessonBlocked.has(key)) continue;
        okRooms.push(rid);
      }

      if (okRooms.length > 0) {
        rooms_by_time[t] = okRooms;
        validTimes.push(t);
      }
    }

    if (validTimes.length === 0) continue;

    by_date[dateStr] = {
      times: validTimes,
      rooms_by_time,
    };
  }

  return json({
    ok: true,
    teacher_id,
    range: { from, to },
    rooms: rooms ?? [],
    by_date,
    debug: {
      availCount: (avails ?? []).length,
      teacherBusyCount: teacherBusy.size,
      roomBlockedCount: lessonBlocked.size,
      activeDates: Object.keys(by_date).length,
      weekdayValuesExample: (avails ?? []).slice(0, 5).map((a: any) => a.weekday),
    },
  });
}