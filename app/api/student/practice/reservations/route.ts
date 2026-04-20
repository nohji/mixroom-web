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

function toWeekdayKst(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.getDay(); // 0=일 ... 6=토
}

function hhmmss(t: string | null | undefined) {
  const s = String(t ?? "").trim();
  if (!s) return "";
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
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

  if (date > maxDate) {
    return json({ error: "TOO_FAR" }, 400);
  }

  if (times.length > 2) return json({ error: "MAX_2_HOURS" }, 400);

  const uniqueTimes = Array.from(new Set(times));
  if (uniqueTimes.length !== times.length) return json({ error: "DUPLICATE_TIME" }, 400);

  for (const t of uniqueTimes) {
    if (!isValidTimeFormat(t)) return json({ error: "INVALID_TIME_FORMAT" }, 400);
  }

  // voucher 조회
  const { data: vouchers, error: voucherErr } = await supabaseServer
    .from("practice_vouchers")
    .select("id, valid_from, valid_until, practice_open_from")
    .eq("student_id", guard.studentUserId)
    .order("valid_from", { ascending: true });

  if (voucherErr) return json({ error: voucherErr.message }, 500);

  // 해당 날짜에 사용 가능한 voucher 찾기
  const usableVoucher = (vouchers ?? []).find((v: any) => {
    const openFrom = String(v.practice_open_from ?? v.valid_from ?? "");
    const validUntil = String(v.valid_until ?? "");
    if (!openFrom || !validUntil) return false;
    return date >= openFrom && date <= validUntil;
  });

  if (!usableVoucher) {
    return json(
      {
        error: "OUTSIDE_VOUCHER_RANGE",
        message: "이 수강권의 연습실 예약 가능 기간이 아닙니다.",
      },
      400
    );
  }

  const voucherOpenFrom = String(
    usableVoucher.practice_open_from ?? usableVoucher.valid_from ?? ""
  );

  const effectiveMinDate =
    voucherOpenFrom && voucherOpenFrom > minDate ? voucherOpenFrom : minDate;

  if (date < effectiveMinDate) {
    return json(
      {
        error: "TOO_SOON",
        message: `예약 가능 시작일은 ${effectiveMinDate} 입니다.`,
      },
      400
    );
  }

  const { data: existing, error: exErr } = await supabaseServer
    .from("practice_reservations")
    .select("id")
    .eq("student_id", guard.studentUserId)
    .eq("date", date)
    .in("status", ["PENDING", "APPROVED"]);

  if (exErr) return json({ error: exErr.message }, 500);

  const reservedCount = existing?.length ?? 0;
  if (reservedCount + uniqueTimes.length > 2) {
    return json({ error: "DAILY_LIMIT_EXCEEDED" }, 400);
  }

  // 보호 슬롯 체크
  const weekday = toWeekdayKst(date);
  const normalizedTimes = uniqueTimes.map(hhmmss);

  const { data: protectedSlots, error: protectedErr } = await supabaseServer
    .from("fixed_schedule_slots")
    .select("id, room_id, weekday, lesson_time, hold_for_renewal, memo")
    .eq("weekday", weekday)
    .eq("hold_for_renewal", true)
    .in("lesson_time", normalizedTimes)
    .or(`room_id.is.null,room_id.eq.${room_id}`);

  if (protectedErr) {
    return json({ error: protectedErr.message }, 500);
  }

  if ((protectedSlots ?? []).length > 0) {
    return json(
      {
        error: "PROTECTED_SLOT",
        message: "해당 시간/홀은 보호된 고정 스케줄이 있어 예약할 수 없습니다.",
      },
      409
    );
  }

  const { data, error } = await supabaseServer.rpc("practice_create_reservations", {
    p_student_id: guard.studentUserId,
    p_room_id: room_id,
    p_date: date,
    p_times: uniqueTimes,
    p_device_type: device_type,
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ ok: true, rows: data ?? [] });
}