import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/requireStudent";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  room_id?: string;
  date?: string; // YYYY-MM-DD
  times?: string[]; // ["13:00","14:00"]
  device_type?: string;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function isValidTimeFormat(t: string) {
  return /^\d{2}:\d{2}$/.test(String(t ?? ""));
}
function isValidYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}

function todayYmdKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function addDaysYmd(baseYmd: string, days: number) {
  const [y, m, d] = baseYmd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const guard = await requireStudent();
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  const body = (await req.json().catch(() => ({}))) as Body;

  const room_id = String(body.room_id ?? "").trim();
  const date = String(body.date ?? "").trim();
  const times = Array.isArray(body.times) ? body.times.map((x) => String(x).trim()) : [];
  const device_type = String(body.device_type ?? "controller").trim();

  if (!room_id) return json({ error: "ROOM_REQUIRED" }, 400);
  if (!date || !isValidYmd(date)) return json({ error: "DATE_REQUIRED" }, 400);
  if (times.length === 0) return json({ error: "TIME_REQUIRED" }, 400);

  const today = todayYmdKST();
  const minDate = addDaysYmd(today, 2);
  const maxDate = addDaysYmd(today, 30);

  if (date < minDate) {
    return json({ error: "TOO_SOON" }, 400);
  }

  if (date > maxDate) {
    return json({ error: "TOO_FAR" }, 400);
  }

  if (times.length > 2) return json({ error: "MAX_2_HOURS" }, 400);

  const uniqueTimes = Array.from(new Set(times));
  if (uniqueTimes.length !== times.length) return json({ error: "DUPLICATE_TIME" }, 400);

  for (const t of times) {
    if (!isValidTimeFormat(t)) return json({ error: "INVALID_TIME_FORMAT" }, 400);
  }

  const { data: existing, error: exErr } = await supabaseServer
    .from("practice_reservations")
    .select("id")
    .eq("student_id", guard.studentUserId)
    .eq("date", date)
    .in("status", ["PENDING", "APPROVED"]);

  if (exErr) return json({ error: exErr.message }, 500);

  const reservedCount = existing?.length ?? 0;
  if (reservedCount + times.length > 2) {
    return json({ error: "DAILY_LIMIT_EXCEEDED" }, 400);
  }

  const { data, error } = await supabaseServer.rpc("practice_create_reservations", {
    p_student_id: guard.studentUserId,
    p_room_id: room_id,
    p_date: date,
    p_times: times,
    p_device_type: device_type,
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ ok: true, rows: data ?? [] });
}