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
    const oneDayId = String(id ?? "").trim();

    if (!oneDayId) {
      return json({ error: "INVALID_ID" }, 400);
    }

    const { data: row, error: findErr } = await supabaseServer
      .from("oneday_lessons")
      .select("id, status")
      .eq("id", oneDayId)
      .single();

    if (findErr) return json({ error: findErr.message }, 500);
    if (!row) return json({ error: "NOT_FOUND" }, 404);

    const status = String(row.status ?? "").toUpperCase();

    if (status === "CANCELED" || status === "CANCELLED") {
      return json({ ok: true, already: true });
    }

    const { data, error } = await supabaseServer
      .from("oneday_lessons")
      .update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", oneDayId)
      .select(
        `
        id,
        lesson_date,
        lesson_time,
        room_id,
        teacher_id,
        memo,
        status,
        updated_at
        `
      )
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, row: data });
  } catch (e: any) {
    return json({ error: e?.message ?? "SERVER_ERROR" }, 500);
  }
}