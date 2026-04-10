import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function PATCH(req: Request) {
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

    const { data: voucher, error: fetchErr } = await sb
      .from("practice_vouchers")
      .select("id, initial_hours, quantity")
      .eq("id", voucher_id)
      .single();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!voucher) {
      return NextResponse.json({ error: "voucher not found" }, { status: 404 });
    }

    const currentInitial = Number(voucher.initial_hours ?? 0);
    const currentQuantity = Number(voucher.quantity ?? 0);

    const diff = target_hours - currentInitial;

    if (diff === 0) {
      return NextResponse.json({ ok: true, changed: false });
    }

    const newQuantity = Math.max(0, currentQuantity + diff);

    const { error: updateErr } = await sb
      .from("practice_vouchers")
      .update({
        initial_hours: target_hours,
        quantity: newQuantity,
      })
      .eq("id", voucher_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      changed: true,
      diff,
      quantity: newQuantity,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}