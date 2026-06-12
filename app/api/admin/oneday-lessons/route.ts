import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  lesson_date?: string;
  lesson_time?: string;
  room_id?: string;
  teacher_id?: string | null;
  memo?: string | null;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}

function toHHMM(t: string) {
  const s = String(t ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  return "";
}

function weekdayOfYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return json({ error: guard.error }, guard.status);

    const body = (await req.json().catch(() => ({}))) as Body;

    const lesson_date = String(body.lesson_date ?? "").trim();
    const lesson_time = toHHMM(String(body.lesson_time ?? ""));
    const room_id = String(body.room_id ?? "").trim();
    const teacher_id = body.teacher_id ? String(body.teacher_id).trim() : null;
    const memo = body.memo ? String(body.memo).trim() : null;

    if (!lesson_date || !isYmd(lesson_date)) return json({ error: "INVALID_DATE" }, 400);
    if (!lesson_time) return json({ error: "INVALID_TIME" }, 400);
    if (!room_id) return json({ error: "ROOM_REQUIRED" }, 400);
    if (!memo) return json({ error: "MEMO_REQUIRED" }, 400);

    const { data: room, error: roomErr } = await supabaseServer
      .from("practice_rooms")
      .select("id, name")
      .eq("id", room_id)
      .single();

    if (roomErr) return json({ error: roomErr.message }, 500);
    if (!room) return json({ error: "ROOM_NOT_FOUND" }, 404);

    const { data: lessonHit, error: lessonErr } = await supabaseServer
      .from("lessons")
      .select("id")
      .eq("lesson_date", lesson_date)
      .eq("room_id", room_id)
      .eq("lesson_time", `${lesson_time}:00`)
      .neq("status", "canceled")
      .limit(1);

    if (lessonErr) return json({ error: lessonErr.message }, 500);
    if ((lessonHit ?? []).length > 0) return json({ error: "CONFLICT_WITH_LESSON" }, 409);

    const { data: practiceHit, error: practiceErr } = await supabaseServer
      .from("practice_reservations")
      .select("id")
      .eq("date", lesson_date)
      .eq("room_id", room_id)
      .eq("start_time", lesson_time)
      .in("status", ["PENDING", "APPROVED"])
      .limit(1);

    if (practiceErr) return json({ error: practiceErr.message }, 500);
    if ((practiceHit ?? []).length > 0) return json({ error: "SLOT_ALREADY_OCCUPIED" }, 409);

    const { data: oneDayHit, error: oneDayErr } = await supabaseServer
      .from("oneday_lessons")
      .select("id")
      .eq("lesson_date", lesson_date)
      .eq("room_id", room_id)
      .eq("lesson_time", `${lesson_time}:00`)
      .neq("status", "canceled")
      .limit(1);

    if (oneDayErr) return json({ error: oneDayErr.message }, 500);
    if ((oneDayHit ?? []).length > 0) {
      return json({ error: "CONFLICT_WITH_ONEDAY_LESSON" }, 409);
    }

    if (teacher_id) {
      const weekday = weekdayOfYmd(lesson_date);

      const { data: teacher, error: teacherErr } = await supabaseServer
        .from("profiles")
        .select("id, role")
        .eq("id", teacher_id)
        .eq("role", "teacher")
        .single();

      if (teacherErr) return json({ error: teacherErr.message }, 500);
      if (!teacher) return json({ error: "TEACHER_NOT_FOUND" }, 404);

      const { data: availableRows, error: availErr } = await supabaseServer
        .from("teacher_availabilities")
        .select("id")
        .eq("teacher_id", teacher_id)
        .eq("weekday", weekday)
        .lte("start_time", lesson_time)
        .gt("end_time", lesson_time)
        .limit(1);

      if (availErr) return json({ error: availErr.message }, 500);
      if ((availableRows ?? []).length === 0) {
        return json({ error: "TEACHER_NOT_AVAILABLE" }, 409);
      }

      const { data: blockRows, error: blockErr } = await supabaseServer
        .from("teacher_change_blocks")
        .select("id")
        .eq("teacher_id", teacher_id)
        .eq("weekday", weekday)
        .eq("is_active", true)
        .lte("start_time", lesson_time)
        .gt("end_time", lesson_time)
        .limit(1);

      if (blockErr) return json({ error: blockErr.message }, 500);
      if ((blockRows ?? []).length > 0) {
        return json({ error: "TEACHER_CHANGE_BLOCKED" }, 409);
      }

      const { data: teacherLessonHit, error: teacherLessonErr } = await supabaseServer
        .from("lessons")
        .select("id")
        .eq("teacher_id", teacher_id)
        .eq("lesson_date", lesson_date)
        .eq("lesson_time", `${lesson_time}:00`)
        .neq("status", "canceled")
        .limit(1);

      if (teacherLessonErr) return json({ error: teacherLessonErr.message }, 500);
      if ((teacherLessonHit ?? []).length > 0) {
        return json({ error: "CONFLICT_WITH_TEACHER_LESSON" }, 409);
      }
    }

    const { data, error } = await supabaseServer
      .from("oneday_lessons")
      .insert({
        lesson_date,
        lesson_time,
        room_id,
        teacher_id,
        memo,
        status: "ACTIVE",
      })
      .select(`
        id,
        lesson_date,
        lesson_time,
        room_id,
        teacher_id,
        memo,
        status,
        created_at,
        updated_at
      `)
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, row: data });
  } catch (e: any) {
    return json({ error: e?.message ?? "SERVER_ERROR" }, 500);
  }
}