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

  // 1) room 목록
  const { data: rooms, error: roomErr } = await supabaseServer
    .from("practice_rooms")
    .select("id, name")
    .order("name", { ascending: true });

  if (roomErr) return json({ error: roomErr.message }, 500);

  const roomNameById = new Map<string, string>();
  (rooms ?? []).forEach((r: any) => {
    roomNameById.set(String(r.id), String(r.name));
  });

  // 2) lessons (그리드 점유 체크용: 요청 범위만)
  const { data: lessons, error: lErr } = await supabaseServer
    .from("lessons")
    .select("id, lesson_date, lesson_time, status, room_id")
    .gte("lesson_date", from)
    .lte("lesson_date", to)
    .neq("status", "canceled");

  if (lErr) return json({ error: lErr.message }, 500);

  // 3) reservations (그리드용: 요청 범위만)
  const { data: rawResv, error: pErr } = await supabaseServer
    .from("practice_reservations")
    .select("id, student_id, room_id, date, start_time, end_time, status, created_at, voucher_id, rejected_reason, approved_at")
    .gte("date", from)
    .lte("date", to);

  if (pErr) return json({ error: pErr.message }, 500);

  const reservations = (rawResv ?? []).map((r: any) => {
    const isMine = String(r.student_id) === guard.studentUserId;
    return {
      id: r.id,
      student_id: isMine ? r.student_id : null,
      is_mine: isMine,
      room_id: r.room_id,
      room_name: roomNameById.get(String(r.room_id)) ?? null,
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

  // 4) 내 class 목록
  const { data: myClasses, error: cErr } = await supabaseServer
    .from("classes")
    .select("id")
    .eq("student_id", guard.studentUserId);

  if (cErr) return json({ error: cErr.message }, 500);

  const classIds = (myClasses ?? []).map((x: any) => String(x.id)).filter(Boolean);

  const today = todayYmdKST();

  if (classIds.length === 0) {
    return json({
      ok: true,
      me: { student_id: guard.studentUserId },
      policy,
      rooms: rooms ?? [],
      lessons: lessons ?? [],
      reservations,
      my_reservations_in_voucher: [],
      voucher_summary: {
        today,
        remaining_hours: 0,
        usable_until: null,
        usable_from: null,
        has_voucher: false,
        active_voucher_ids: [],
      },
      debug: { classIdsCount: 0 },
    });
  }

  // 5) voucher 조회
  const { data: vouchers, error: vErr } = await supabaseServer
    .from("practice_vouchers")
    .select("id, class_id, quantity, valid_from, valid_until")
    .in("class_id", classIds)
    .order("valid_from", { ascending: true });

  if (vErr) return json({ error: vErr.message }, 500);

  const vv = (vouchers ?? []).map((v: any) => ({
    id: String(v.id),
    class_id: String(v.class_id),
    quantity: Number(v.quantity ?? 0),
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

  const voucher_summary = picked
    ? {
        today,
        remaining_hours: picked.quantity,
        usable_from: picked.valid_from,
        usable_until: picked.valid_until,
        has_voucher: picked.quantity > 0,
        active_voucher_ids: [picked.id],
      }
    : {
        today,
        remaining_hours: 0,
        usable_until: null,
        usable_from: null,
        has_voucher: false,
        active_voucher_ids: [],
      };

  // 6) 상단 예약내역용: 현재 선택된 voucher 기준으로 "내 예약" 전체 조회
  let my_reservations_in_voucher: any[] = [];

  if (
    voucher_summary.active_voucher_ids.length > 0 &&
    voucher_summary.usable_until
  ) {
    const listFrom = voucher_summary.usable_from ?? voucher_summary.usable_until;
    const listTo = voucher_summary.usable_until;

    const { data: myRawList, error: myListErr } = await supabaseServer
      .from("practice_reservations")
      .select("id, student_id, room_id, date, start_time, end_time, status, created_at, voucher_id, rejected_reason, approved_at")
      .eq("student_id", guard.studentUserId)
      .in("voucher_id", voucher_summary.active_voucher_ids)
      .gte("date", listFrom)
      .lte("date", listTo)
      .neq("status", "CANCELED")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (myListErr) return json({ error: myListErr.message }, 500);

    my_reservations_in_voucher = (myRawList ?? []).map((r: any) => ({
      id: r.id,
      student_id: r.student_id,
      room_id: r.room_id,
      room_name: roomNameById.get(String(r.room_id)) ?? null,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      status: r.status,
      voucher_id: r.voucher_id,
      rejected_reason: r.rejected_reason ?? null,
      approved_at: r.approved_at ?? null,
      created_at: r.created_at,
    }));
  }

  return json({
    ok: true,
    me: { student_id: guard.studentUserId },
    policy,
    rooms: rooms ?? [],
    lessons: lessons ?? [],
    reservations, // ✅ 그리드용
    my_reservations_in_voucher, // ✅ 상단 예약내역용
    voucher_summary,
    debug: {
      classIdsCount: classIds.length,
      vouchersCount: (vouchers ?? []).length,
      pickedVoucherId: picked?.id ?? null,
    },
  });
}