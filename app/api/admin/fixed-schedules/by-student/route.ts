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
    const studentId = searchParams.get("studentId");

    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("fixed_schedule_slots")
      .select(`
        id,
        student_id,
        teacher_id,
        room_id,
        weekday,
        lesson_time,
        hold_for_renewal,
        memo,
        teacher:profiles!fixed_schedule_slots_teacher_id_fkey (
          id,
          name
        ),
        room:practice_rooms!fixed_schedule_slots_room_id_fkey (
          id,
          name
        )
      `)
      .eq("student_id", studentId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}