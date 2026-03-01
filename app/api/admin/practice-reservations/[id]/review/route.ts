import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = { approve: boolean; reason?: string };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Body;
    if (typeof body.approve !== "boolean") {
      return NextResponse.json({ error: "approve(boolean) 필수" }, { status: 400 });
    }

    const { data, error } = await supabaseServer.rpc("admin_review_practice_reservation", {
      p_reservation_id: id,
      p_approve: body.approve,
      p_reason: body.reason ?? null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}