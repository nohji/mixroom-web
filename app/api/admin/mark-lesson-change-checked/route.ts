// app/api/admin/mark-lesson-change-checked/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await req.json().catch(() => ({}));
    const requestId = body.requestId as string | undefined;

    if (!requestId) {
      return NextResponse.json({ error: "requestId 누락" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("lesson_change_requests")
      .update({ admin_checked_at: new Date().toISOString() })
      .eq("id", requestId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
