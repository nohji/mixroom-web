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
    const lessonId = body.lessonId as string | undefined;
    const value = body.value as boolean | undefined;

    if (!lessonId || typeof value !== "boolean") {
      return NextResponse.json({ error: "lessonId/value 누락" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("lessons")
      .update({ allow_change_override: value })
      .eq("id", lessonId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
