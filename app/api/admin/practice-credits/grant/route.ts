import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => ({}));

    const student_id = body?.student_id;
    const grant_type = body?.grant_type;
    const hours = Number(body?.hours);
    const memo = body?.memo ?? null;

    if (!student_id) {
      return NextResponse.json({ error: "student_id required" }, { status: 400 });
    }

    if (!["ADMIN_ADD", "PURCHASE"].includes(grant_type)) {
      return NextResponse.json({ error: "invalid grant_type" }, { status: 400 });
    }

    if (!Number.isFinite(hours) || hours <= 0) {
      return NextResponse.json({ error: "invalid minutes" }, { status: 400 });
    }

    const sb = supabaseServer;

    const { data, error } = await sb.rpc("admin_grant_practice_credit", {
      p_student_id: student_id,
      p_grant_type: grant_type,
      p_hours: hours,
      p_memo: memo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      row: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}