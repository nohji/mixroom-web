import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireTeacher } from "@/lib/requireTeacher";

function hhmm(v: string | null | undefined) {
  return String(v ?? "").slice(0, 5);
}

export async function GET() {
  try {
    const t = await requireTeacher();

    if (!t.ok) {
      return NextResponse.json(
        { error: t.error ?? "Unauthorized" },
        { status: t.status ?? 401 }
      );
    }

    const teacherId = t.teacherUserId;

    const { data: teacherProfile } = await supabaseServer
      .from("profiles")
      .select("id, name")
      .eq("id", teacherId)
      .maybeSingle();

    const { data: rows, error } = await supabaseServer
      .from("fixed_schedule_slots")
      .select(`
        id,
        student_id,
        teacher_id,
        weekday,
        lesson_time,
        room_id,
        hold_for_renewal,
        memo
      `)
      .eq("teacher_id", teacherId)
      .order("weekday", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const studentIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.student_id).filter(Boolean))
    ) as string[];

    const roomIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.room_id).filter(Boolean))
    ) as string[];

    let students: any[] = [];
    if (studentIds.length > 0) {
      const { data, error } = await supabaseServer
        .from("profiles")
        .select("id, name")
        .in("id", studentIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      students = data ?? [];
    }

    let rooms: any[] = [];
    if (roomIds.length > 0) {
      const { data, error } = await supabaseServer
        .from("practice_rooms")
        .select("id, name")
        .in("id", roomIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      rooms = data ?? [];
    }

    const studentMap = new Map(students.map((s: any) => [s.id, s]));
    const roomMap = new Map(rooms.map((r: any) => [r.id, r]));

    const schedules = (rows ?? []).map((row: any) => {
      const student = row.student_id ? studentMap.get(row.student_id) : null;
      const room = row.room_id ? roomMap.get(row.room_id) : null;

      return {
        id: row.id,
        weekday: Number(row.weekday),
        lesson_time: hhmm(row.lesson_time),
        student_id: row.student_id ?? null,
        student_name: student?.name ?? "이름 없음",
        room_id: row.room_id ?? null,
        room_name: room?.name ?? "",
        hold_for_renewal: !!row.hold_for_renewal,
        memo: row.memo ?? null,
      };
    });

    return NextResponse.json({
      teacher: {
        id: teacherId,
        name: teacherProfile?.name ?? "강사",
      },
      schedules,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}