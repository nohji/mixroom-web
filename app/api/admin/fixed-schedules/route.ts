import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
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
        created_at,
        updated_at,
        student:profiles!fixed_schedule_slots_student_id_fkey (
          id,
          name
        ),
        teacher:profiles!fixed_schedule_slots_teacher_id_fkey (
          id,
          name
        ),
        room:practice_rooms!fixed_schedule_slots_room_id_fkey (
          id,
          name
        )
      `)
      .order("weekday", { ascending: true })
      .order("lesson_time", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await req.json().catch(() => ({}));

    const student_id = String(body.student_id ?? "").trim();
    const teacher_id = String(body.teacher_id ?? "").trim();
    const room_id = body.room_id ? String(body.room_id).trim() : null;
    const weekday = Number(body.weekday);
    const lesson_time = String(body.lesson_time ?? "").trim();
    const hold_for_renewal = body.hold_for_renewal ?? true;
    const memo = body.memo ? String(body.memo) : null;

    if (!student_id || !teacher_id || !lesson_time || Number.isNaN(weekday)) {
      return NextResponse.json(
        { error: "student_id, teacher_id, weekday, lesson_time are required" },
        { status: 400 }
      );
    }

    if (weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: "weekday must be 0~6" }, { status: 400 });
    }

    const normalizedTime =
      lesson_time.length === 5 ? `${lesson_time}:00` : lesson_time;

    // room_id가 있으면 실제 존재하는 홀인지 확인
    if (room_id) {
      const { data: room, error: roomErr } = await supabaseServer
        .from("practice_rooms")
        .select("id")
        .eq("id", room_id)
        .single();

      if (roomErr || !room) {
        return NextResponse.json({ error: "invalid room_id" }, { status: 400 });
      }
    }

    const { data, error } = await supabaseServer
      .from("fixed_schedule_slots")
      .insert({
        student_id,
        teacher_id,
        room_id,
        weekday,
        lesson_time: normalizedTime,
        hold_for_renewal,
        memo,
      })
      .select(`
        id,
        student_id,
        teacher_id,
        room_id,
        weekday,
        lesson_time,
        hold_for_renewal,
        memo,
        created_at,
        updated_at,
        student:profiles!fixed_schedule_slots_student_id_fkey (
          id,
          name
        ),
        teacher:profiles!fixed_schedule_slots_teacher_id_fkey (
          id,
          name
        ),
        room:practice_rooms!fixed_schedule_slots_room_id_fkey (
          id,
          name
        )
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}