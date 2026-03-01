import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { data, error } = await supabaseServer
      .from("lessons")
      .select("id, lesson_date, lesson_time, status, allow_change_override")
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "서버 오류" },
      { status: 500 }
    );
  }
}
