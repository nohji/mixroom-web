import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/requireStudent";
import { supabaseServer } from "@/lib/supabaseServer";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}

function todayYmdKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toWeekdayKst(dateStr: string) {
  return parseYmd(dateStr).getDay();
}

function datesBetween(from: string, to: string) {
  const start = parseYmd(from);
  const end = parseYmd(to);

  const out: string[] = [];
  const cur = new Date(start);

  while (cur.getTime() <= end.getTime()) {
    out.push(toYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return out;
}

export async function GET(req: Request) {
  const guard = await requireStudent();
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!isYmd(from) || !isYmd(to)) {
    return json({ error: "INVALID_RANGE" }, 400);
  }

  const policy = {
    daily_limit_hours: 2,
  };

  const studentUserId = guard.studentUserId;
  const today = todayYmdKST();

  const [
    { data: rooms, error: roomErr },
    { data: rawLessons, error: lErr },
    { data: rawResv, error: pErr },
    { data: myClasses, error: cErr },
    { data: grantRows, error: grantErr },
    { data: protectedRaw, error: protectedErr },
  ] = await Promise.all([
    supabaseServer
      .from("practice_rooms")
      .select("id, name")
      .order("name", { ascending: true }),

    supabaseServer
      .from("lessons")
      .select("id, lesson_date, lesson_time, status, room_id")
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .neq("status", "canceled"),

    supabaseServer
      .from("practice_reservations")
      .select(
        "id, student_id, room_id, date, start_time, end_time, status, created_at, voucher_id, rejected_reason, approved_at"
      )
      .gte("date", from)
      .lte("date", to),

    supabaseServer
      .from("classes")
      .select("id")
      .eq("student_id", studentUserId),

    supabaseServer
      .from("practice_credit_grants")
      .select("grant_type, hours")
      .eq("student_id", studentUserId),

    supabaseServer
      .from("fixed_schedule_slots")
      .select("id, room_id, weekday, lesson_time, hold_for_renewal, memo")
      .eq("hold_for_renewal", true),
  ]);

  if (roomErr) return json({ error: roomErr.message }, 500);
  if (lErr) return json({ error: lErr.message }, 500);
  if (pErr) return json({ error: pErr.message }, 500);
  if (cErr) return json({ error: cErr.message }, 500);
  if (grantErr) return json({ error: grantErr.message }, 500);
  if (protectedErr) return json({ error: protectedErr.message }, 500);

  const roomNameById = new Map<string, string>();
  (rooms ?? []).forEach((r: any) => {
    roomNameById.set(String(r.id), String(r.name));
  });

  const lessons = (rawLessons ?? []).map((l: any) => ({
    ...l,
    room_name: l.room_id ? roomNameById.get(String(l.room_id)) ?? null : null,
  }));

  const reservations = (rawResv ?? []).map((r: any) => {
    const isMine = String(r.student_id) === studentUserId;
    return {
      id: r.id,
      student_id: isMine ? r.student_id : null,
      is_mine: isMine,
      room_id: r.room_id,
      room_name: r.room_id ? roomNameById.get(String(r.room_id)) ?? null : null,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      status: r.status,
      voucher_id: isMine ? r.voucher_id : null,
      rejected_reason: isMine ? r.rejected_reason ?? null : null,
      approved_at: isMine ? r.approved_at ?? null : null,
      created_at: r.created_at,
    };
  });

  const protected_slots: Array<{
    id: string;
    date: string;
    weekday: number;
    lesson_time: string;
    room_id: string | null;
    room_name: string | null;
    memo: string | null;
  }> = [];

  const allDates = datesBetween(from, to);

  for (const dateStr of allDates) {
    const weekday = toWeekdayKst(dateStr);

    for (const slot of protectedRaw ?? []) {
      if (Number(slot.weekday) !== weekday) continue;

      const roomId = slot.room_id ? String(slot.room_id) : null;

      protected_slots.push({
        id: String(slot.id),
        date: dateStr,
        weekday,
        lesson_time: String(slot.lesson_time),
        room_id: roomId,
        room_name: roomId ? roomNameById.get(roomId) ?? null : null,
        memo: slot.memo ?? null,
      });
    }
  }

  const classIds = (myClasses ?? []).map((x: any) => String(x.id)).filter(Boolean);

  const freeHours = (grantRows ?? [])
    .filter((x: any) => String(x.grant_type) === "ADMIN_ADD")
    .reduce((sum: number, x: any) => sum + Number(x.hours ?? 0), 0);

  const paidHours = (grantRows ?? [])
    .filter((x: any) => String(x.grant_type) === "PURCHASE")
    .reduce((sum: number, x: any) => sum + Number(x.hours ?? 0), 0);

  const myReservationsInRange = (rawResv ?? [])
    .filter(
      (r: any) =>
        String(r.student_id) === studentUserId &&
        String(r.status).toUpperCase() !== "CANCELED"
    )
    .map((r: any) => ({
      id: r.id,
      student_id: r.student_id,
      room_id: r.room_id,
      room_name: r.room_id ? roomNameById.get(String(r.room_id)) ?? null : null,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      status: r.status,
      voucher_id: r.voucher_id,
      rejected_reason: r.rejected_reason ?? null,
      approved_at: r.approved_at ?? null,
      created_at: r.created_at,
    }));

  if (classIds.length === 0) {
    const initialHours = 0;
    const remainingHours = Math.max(0, freeHours + paidHours);
    const usedHours = Math.max(0, initialHours + freeHours + paidHours - remainingHours);

    return json({
      ok: true,
      me: { student_id: studentUserId },
      policy,
      rooms: rooms ?? [],
      lessons,
      reservations,
      protected_slots,
      my_reservations_in_voucher: myReservationsInRange,
      voucher_summary: {
        today,
        remaining_hours: remainingHours,
        initial_hours: initialHours,
        free_hours: freeHours,
        paid_hours: paidHours,
        usable_until: null,
        usable_from: null,
        has_voucher: remainingHours > 0,
        active_voucher_ids: [],
      },
      debug: {
        classIdsCount: 0,
        initialHours,
        freeHours,
        paidHours,
        usedHours,
        remainingHours,
      },
    });
  }

  const { data: vouchers, error: vErr } = await supabaseServer
    .from("practice_vouchers")
    .select("id, class_id, quantity, initial_hours, valid_from, valid_until")
    .in("class_id", classIds)
    .order("valid_from", { ascending: true });

  if (vErr) return json({ error: vErr.message }, 500);

  const vv = (vouchers ?? []).map((v: any) => ({
    id: String(v.id),
    class_id: String(v.class_id),
    quantity: Number(v.quantity ?? 0),
    initial_hours: Number(v.initial_hours ?? 0),
    valid_from: v.valid_from ? String(v.valid_from) : null,
    valid_until: v.valid_until ? String(v.valid_until) : null,
  }));

  const isActive = (v: any) => {
    if (!v.valid_until) return false;
    const fromOk = !v.valid_from || v.valid_from <= today;
    const untilOk = v.valid_until >= today;
    return fromOk && untilOk;
  };

  const activeOnes = vv.filter(isActive);

  let picked: any | null = null;

  if (activeOnes.length > 0) {
    picked = activeOnes.sort((a, b) =>
      String(a.valid_until).localeCompare(String(b.valid_until))
    )[0];
  } else {
    const upcoming = vv
      .filter((v) => v.valid_from && v.valid_from > today)
      .sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)));

    picked = upcoming.length > 0 ? upcoming[0] : null;
  }

  const initialHours = picked ? Number(picked.initial_hours ?? 0) : 0;
  const remainingHours = picked
    ? Number(picked.quantity ?? 0)
    : Math.max(0, freeHours + paidHours);

  const usedHours = Math.max(
    0,
    initialHours + freeHours + paidHours - remainingHours
  );

  const voucher_summary = picked
    ? {
        today,
        remaining_hours: remainingHours,
        initial_hours: initialHours,
        free_hours: freeHours,
        paid_hours: paidHours,
        usable_from: picked.valid_from,
        usable_until: picked.valid_until,
        has_voucher: remainingHours > 0,
        active_voucher_ids: [picked.id],
      }
    : {
        today,
        remaining_hours: Math.max(0, freeHours + paidHours),
        initial_hours: 0,
        free_hours: freeHours,
        paid_hours: paidHours,
        usable_until: null,
        usable_from: null,
        has_voucher: Math.max(0, freeHours + paidHours) > 0,
        active_voucher_ids: [],
      };

  let my_reservations_in_voucher: any[] = [];

  if (voucher_summary.usable_until) {
    const listFrom = voucher_summary.usable_from ?? voucher_summary.usable_until;
    const listTo = voucher_summary.usable_until;

    my_reservations_in_voucher = myReservationsInRange
      .filter((r) => r.date >= listFrom && r.date <= listTo)
      .sort((a, b) => {
        if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
        return String(a.start_time).localeCompare(String(b.start_time));
      });
  }

  return json({
    ok: true,
    me: { student_id: studentUserId },
    policy,
    rooms: rooms ?? [],
    lessons,
    reservations,
    protected_slots,
    my_reservations_in_voucher,
    voucher_summary,
    debug: {
      classIdsCount: classIds.length,
      vouchersCount: (vouchers ?? []).length,
      pickedVoucherId: picked?.id ?? null,
      initialHours,
      freeHours,
      paidHours,
      usedHours,
      remainingHours,
    },
  });
}