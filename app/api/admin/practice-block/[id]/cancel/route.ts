import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return json({ error: guard.error }, guard.status);

    const { id } = await ctx.params;
    const reservationId = String(id ?? "").trim();

    if (!reservationId) {
      return json({ error: "INVALID_ID" }, 400);
    }

    const { data: row, error: findErr } = await supabaseServer
      .from("practice_reservations")
      .select("id, status, reservation_kind")
      .eq("id", reservationId)
      .single();

    if (findErr) return json({ error: findErr.message }, 500);
    if (!row) return json({ error: "NOT_FOUND" }, 404);

    if (String(row.reservation_kind ?? "") !== "ADMIN_BLOCK") {
      return json({ error: "NOT_ADMIN_BLOCK" }, 400);
    }

    const status = String(row.status ?? "").toUpperCase();

    // 멱등 처리
    if (status === "CANCELED") {
      return json({ ok: true, already: true });
    }

    const { data, error } = await supabaseServer
      .from("practice_reservations")
      .update({
        status: "CANCELED",
        canceled_at: new Date().toISOString(),
      })
      .eq("id", reservationId)
      .select(
        `
        id,
        room_id,
        date,
        start_time,
        end_time,
        status,
        reservation_kind,
        admin_block_reason
        `
      )
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, row: data });
  } catch (e: any) {
    return json({ error: e?.message ?? "SERVER_ERROR" }, 500);
  }
}