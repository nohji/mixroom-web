import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const { voucher_id, target_hours, memo } = await req.json();

    if (!voucher_id) {
      return NextResponse.json({ error: "voucher_id required" }, { status: 400 });
    }

    if (typeof target_hours !== "number" || target_hours < 0) {
      return NextResponse.json({ error: "invalid target_hours" }, { status: 400 });
    }

    const sb = supabaseServer;

    // 바우처 조회
    const { data: voucher, error: voucherErr } = await sb
      .from("practice_vouchers")
      .select("id, student_id, quantity")
      .eq("id", voucher_id)
      .single();

    if (voucherErr) {
      return NextResponse.json({ error: voucherErr.message }, { status: 500 });
    }

    if (!voucher) {
      return NextResponse.json({ error: "voucher not found" }, { status: 404 });
    }

    // 현재 유료 합계
    const { data: currentData, error: currentErr } = await sb
      .from("practice_credit_grants")
      .select("hours")
      .eq("voucher_id", voucher_id)
      .eq("grant_type", "PURCHASE");

    if (currentErr) {
      return NextResponse.json({ error: currentErr.message }, { status: 500 });
    }

    const current = (currentData ?? []).reduce(
      (sum, row) => sum + Number(row.hours ?? 0),
      0
    );

    const diff = target_hours - current;

    if (diff === 0) {
      return NextResponse.json({ ok: true, changed: false });
    }

    // 🔥 grant 이력
    const { error: grantErr } = await sb.from("practice_credit_grants").insert({
      student_id: voucher.student_id,
      voucher_id,
      grant_type: "PURCHASE",
      hours: diff,
      remaining_hours: diff, // 🔥 에러 방지 핵심
      memo: memo || "유료 시간 보정",
    });

    if (grantErr) {
      return NextResponse.json({ error: grantErr.message }, { status: 500 });
    }

    // 🔥 quantity 반영
    const nextQty = Math.max(0, Number(voucher.quantity ?? 0) + diff);

    const { error: qtyErr } = await sb
      .from("practice_vouchers")
      .update({ quantity: nextQty })
      .eq("id", voucher_id);

    if (qtyErr) {
      return NextResponse.json({ error: qtyErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      changed: true,
      diff,
      quantity: nextQty,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}