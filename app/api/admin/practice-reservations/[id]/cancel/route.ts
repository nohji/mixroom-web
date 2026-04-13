import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

function toHours(startTime: string | null | undefined, endTime: string | null | undefined) {
  const s = String(startTime ?? "").slice(0, 5);
  const e = String(endTime ?? "").slice(0, 5);

  if (!s || !e) return 0;

  const [sh, sm] = s.split(":").map(Number);
  const [eh, em] = e.split(":").map(Number);

  const start = (sh ?? 0) * 60 + (sm ?? 0);
  const end = (eh ?? 0) * 60 + (em ?? 0);

  const diffMinutes = Math.max(0, end - start);
  return diffMinutes / 60;
}

function normStatus(v: string | null | undefined) {
  return String(v ?? "").trim().toUpperCase();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body?.reason ?? null;

    const sb = supabaseServer;

    const { data: reservation, error: reservationErr } = await sb
      .from("practice_reservations")
      .select(`
        id,
        voucher_id,
        status,
        start_time,
        end_time,
        rejected_reason,
        canceled_at
      `)
      .eq("id", id)
      .single();

    if (reservationErr || !reservation) {
      return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
    }

    const currentStatus = normStatus(reservation.status);

    // 이미 취소된 건은 중복 복구 방지
    if (currentStatus === "CANCELED" || currentStatus === "CANCELLED") {
      return NextResponse.json({
        ok: true,
        already_canceled: true,
        refunded: false,
      });
    }

    // 거절 상태면 잔여 복구 없이 상태만 그대로 두거나 막는 게 안전
    if (currentStatus === "REJECTED") {
      return NextResponse.json(
        { error: "거절된 예약은 취소 처리할 수 없습니다." },
        { status: 400 }
      );
    }

    const hours = toHours(reservation.start_time, reservation.end_time);

    // APPROVED인 경우만 voucher 잔여 복구
    if (currentStatus === "APPROVED") {
      if (!reservation.voucher_id) {
        return NextResponse.json(
          { error: "voucher_id가 없어 잔여시간 복구를 할 수 없습니다." },
          { status: 400 }
        );
      }

      const { data: voucher, error: voucherErr } = await sb
        .from("practice_vouchers")
        .select("id, quantity")
        .eq("id", reservation.voucher_id)
        .single();

      if (voucherErr || !voucher) {
        return NextResponse.json(
          { error: "복구 대상 이용권을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const nextQty = Number(voucher.quantity ?? 0) + Number(hours ?? 0);

      const { error: voucherUpdateErr } = await sb
        .from("practice_vouchers")
        .update({
          quantity: nextQty,
        })
        .eq("id", reservation.voucher_id);

      if (voucherUpdateErr) {
        return NextResponse.json({ error: voucherUpdateErr.message }, { status: 500 });
      }
    }

    const { error: cancelErr } = await sb
      .from("practice_reservations")
      .update({
        status: "CANCELED",
        rejected_reason: reason,
        canceled_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (cancelErr) {
      return NextResponse.json({ error: cancelErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      refunded: currentStatus === "APPROVED",
      refunded_hours: currentStatus === "APPROVED" ? hours : 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}