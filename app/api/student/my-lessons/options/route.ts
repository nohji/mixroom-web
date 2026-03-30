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

function normalizeDow(dbWeekday: number) {
  if (dbWeekday >= 0 && dbWeekday <= 6) return dbWeekday;
  if (dbWeekday >= 1 && dbWeekday <= 7) return dbWeekday === 7 ? 0 : dbWeekday - 1;
  return dbWeekday;
}

function normalizeReservationKind(v: any): "STUDENT" | "ADMIN_BLOCK" {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "ADMIN_BLOCK" || s === "ADMIN-BLOCK" || s === "BLOCK") {
    return "ADMIN_BLOCK";
  }
  return "STUDENT";
}

function addBlockedRangeToSet(
  target: Set<string>,
  dateStr: string,
  roomId: string,
  startTime: string,
  endTime: string
) {
  const s = timeToMin(clampHHMM(startTime));
  const e = timeToMin(clampHHMM(endTime));

  if (!dateStr || !roomId) return;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return;
  if (e <= s) return;

  for (let m = s; m < e; m += 60) {
    const t = minToTime(m);
    target.add(`${dateStr}|${t}|${roomId}`);
  }
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

  // 🚀 병렬 실행
  const [
    { data: rooms, error: roomErr },
    { data: avails, error: aErr },
    { data: lessonsAll, error: lErrAll },
    { data: adminBlocks, error: bErr },
    { data: lessonsTeacher, error: lErrTeacher },
  ] = await Promise.all([
    supabaseServer
      .from("practice_rooms")
      .select("id, name")
      .order("name", { ascending: true }),

    supabaseServer
      .from("teacher_availabilities")
      .select("weekday, start_time, end_time, is_active")
      .eq("teacher_id", teacher_id)
      .eq("is_active", true),

    supabaseServer
      .from("lessons")
      .select("lesson_date, lesson_time, room_id, status")
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .neq("status", "canceled"),

    supabaseServer
      .from("practice_reservations")
      .select("date, start_time, end_time, room_id, status, reservation_kind")
      .gte("date", from)
      .lte("date", to)
      .in("status", ["APPROVED"]),

    supabaseServer
      .from("lessons")
      .select("lesson_date, lesson_time, status")
      .eq("teacher_id", teacher_id)
      .eq("status", "scheduled")
      .gte("lesson_date", from)
      .lte("lesson_date", to),
  ]);

  if (roomErr) return json({ error: roomErr.message }, 500);
  if (aErr) return json({ error: aErr.message }, 500);
  if (lErrAll) return json({ error: lErrAll.message }, 500);
  if (bErr) return json({ error: bErr.message }, 500);
  if (lErrTeacher) return json({ error: lErrTeacher.message }, 500);

  const roomIds = (rooms ?? []).map((r: any) => String(r.id));

  // availability
  const availByDow = new Map<number, { s: number; e: number }[]>();
  (avails ?? []).forEach((a: any) => {
    const dow = normalizeDow(Number(a.weekday));
    const s = timeToMin(clampHHMM(a.start_time));
    const e = timeToMin(clampHHMM(a.end_time));
    const arr = availByDow.get(dow) ?? [];
    arr.push({ s, e });
    availByDow.set(dow, arr);
  });

  // lesson blocked
  const lessonBlocked = new Set<string>();
  (lessonsAll ?? []).forEach((l: any) => {
    const d = String(l.lesson_date ?? "").slice(0, 10);
    const t = clampHHMM(String(l.lesson_time ?? ""));
    const rid = String(l.room_id ?? "");
    if (d && t && rid) lessonBlocked.add(`${d}|${t}|${rid}`);
  });

  // admin block
  const adminBlockBlocked = new Set<string>();
  (adminBlocks ?? []).forEach((r: any) => {
    const kind = normalizeReservationKind(r.reservation_kind);
    if (kind !== "ADMIN_BLOCK") return;

    addBlockedRangeToSet(
      adminBlockBlocked,
      String(r.date),
      String(r.room_id),
      r.start_time,
      r.end_time
    );
  });

  const roomBlocked = new Set([...lessonBlocked, ...adminBlockBlocked]);

  // teacher busy
  const teacherBusy = new Set<string>();
  (lessonsTeacher ?? []).forEach((l: any) => {
    const d = String(l.lesson_date ?? "").slice(0, 10);
    const t = clampHHMM(String(l.lesson_time ?? ""));
    if (d && t) teacherBusy.add(`${d}|${t}`);
  });

  const start = parseYmdLocal(from);
  const end = parseYmdLocal(to);

  const by_date: any = {};

  for (let cur = new Date(start); cur <= end; cur = addDays(cur, 1)) {
    const dateStr = ymd(cur);
    const dow = cur.getDay();
    const windows = availByDow.get(dow) ?? [];
    if (windows.length === 0) continue;

    const times: string[] = [];
    const rooms_by_time: any = {};

    for (const w of windows) {
      for (let m = Math.ceil(w.s / 60) * 60; m + 60 <= w.e; m += 60) {
        const t = minToTime(m);

        if (teacherBusy.has(`${dateStr}|${t}`)) continue;

        const okRooms: string[] = [];
        for (const rid of roomIds) {
          if (!roomBlocked.has(`${dateStr}|${t}|${rid}`)) {
            okRooms.push(rid);
          }
        }

        if (okRooms.length > 0) {
          times.push(t);
          rooms_by_time[t] = okRooms;
        }
      }
    }

    if (times.length > 0) {
      by_date[dateStr] = { times, rooms_by_time };
    }
  }

  return json({
    ok: true,
    teacher_id,
    range: { from, to },
    rooms: rooms ?? [],
    by_date,
  });
}