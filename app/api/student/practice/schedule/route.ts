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
  return kst.toISOString().slice(0, 10); // "YYYY-MM-DD"
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

  // ✅ 정책(가볍게)
  const policy = {
    daily_limit_hours: 2,
  };

  // practice_rooms
  const { data: rooms, error: roomErr } = await supabaseServer
    .from("practice_rooms")
    .select("id, name")
    .order("name", { ascending: true });

  if (roomErr) return json({ error: roomErr.message }, 500);

  const roomNameById = new Map<string, string>();
  (rooms ?? []).forEach((r: any) =>
    roomNameById.set(String(r.id), String(r.name))
  );

  // lessons (슬롯 점유 체크용)
  const { data: lessons, error: lErr } = await supabaseServer
    .from("lessons")
    .select("id, lesson_date, lesson_time, status, room_id")
    .gte("lesson_date", from)
    .lte("lesson_date", to)
    .neq("status", "canceled");

  if (lErr) return json({ error: lErr.message }, 500);

  // practice reservations (이번주)
  const { data: rawResv, error: pErr } = await supabaseServer
    .from("practice_reservations")
    .select(
      "id, student_id, room_id, date, start_time, end_time, status, created_at, voucher_id"
    )
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
      created_at: r.created_at,
    };
  });

  // ✅ voucher_summary
  const today = todayYmdKST();

  // (1) 내 class_id 목록 먼저 구하기
  const { data: myClasses, error: cErr } = await supabaseServer
    .from("classes")
    .select("id")
    .eq("student_id", guard.studentUserId);

  if (cErr) return json({ error: cErr.message }, 500);

  const classIds = (myClasses ?? [])
    .map((x: any) => String(x.id))
    .filter(Boolean);

  // class가 없으면 voucher도 당연히 없음
  if (classIds.length === 0) {
    return json({
      ok: true,
      me: { student_id: guard.studentUserId },
      policy,
      rooms: rooms ?? [],
      lessons: lessons ?? [],
      reservations,
      voucher_summary: {
        today,
        remaining_hours: 0,
        usable_until: null,
        usable_from: null,
        has_voucher: false,
      },
      debug: { classIdsCount: 0 },
    });
  }

  // (2) practice_vouchers를 class_id 기준으로 조회
  // ✅ "이용권이 생기면 보여준다" 정책: 날짜 필터 제거, quantity>0만 유지
  const { data: vouchers, error: vErr } = await supabaseServer
    .from("practice_vouchers")
    .select("id, class_id, quantity, valid_from, valid_until")
    .in("class_id", classIds)
    .gt("quantity", 0)
    .order("valid_until", { ascending: true });

  if (vErr) return json({ error: vErr.message }, 500);

  const totalRemaining = (vouchers ?? []).reduce(
    (sum: number, v: any) => sum + Number(v.quantity ?? 0),
    0
  );

  const soonestExpire =
    vouchers && vouchers.length > 0
      ? String(vouchers[0].valid_until ?? "")
      : null;

  const soonestStart =
    vouchers && vouchers.length > 0
      ? String(
          (vouchers as any[])
            .map((x) => String(x.valid_from ?? ""))
            .filter(Boolean)
            .sort()[0] ?? ""
        )
      : null;

  const voucher_summary = {
    today,
    remaining_hours: totalRemaining, // ✅ 1=1시간
    usable_until: soonestExpire, // ✅ 가장 빠른 만료일
    usable_from: soonestStart, // ✅ 가장 빠른 시작일(표시용)
    has_voucher: totalRemaining > 0,
  };

  return json({
    ok: true,
    me: { student_id: guard.studentUserId },
    policy,
    rooms: rooms ?? [],
    lessons: lessons ?? [],
    reservations,
    voucher_summary,
    debug: {
      classIdsCount: classIds.length,
      vouchersCount: (vouchers ?? []).length,
      // 필요하면 아래도 임시로 켜서 데이터 확인 가능
      // vouchers,
    },
  });
}