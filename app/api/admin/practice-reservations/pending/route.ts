import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from"); // "YYYY-MM-DD"
    const to = searchParams.get("to");     // "YYYY-MM-DD"
    const roomId = searchParams.get("room_id"); // optional

    let q = supabaseServer
      .from("practice_reservations")
      .select(
        "id, student_id, room_id, voucher_id, date, start_time, end_time, status, created_at, approved_at, approved_by, rejected_reason, canceled_at"
      )
      .eq("status", "PENDING")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (roomId) q = q.eq("room_id", roomId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}