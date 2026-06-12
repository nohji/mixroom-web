import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  teacher_id?: string | null;
  memo?: string | null;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
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

export async function PATCH(
  req: Request,
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

    const body = (await req.json().catch(() => ({}))) as Body;

    const teacher_id =
      body.teacher_id === null || body.teacher_id === ""
        ? null
        : String(body.teacher_id ?? "").trim();

    const memo =
      body.memo === undefined
        ? undefined
        : body.memo === null
          ? null
          : String(body.memo).trim();

    const { data: oneDay, error: findErr } = await supabaseServer
      .from("oneday_lessons")
      .select("id, lesson_date, lesson_time, room_id, teacher_id, memo, status")
      .eq("id", oneDayId)
      .single();

    if (findErr) return json({ error: findErr.message }, 500);
    if (!oneDay) return json({ error: "NOT_FOUND" }, 404);

    const status = String(oneDay.status ?? "").toLowerCase();
    if (status === "canceled" || status === "cancelled") {
      return json({ error: "ALREADY_CANCELED" }, 400);
    }

    const lessonDate = String(oneDay.lesson_date);
    const lessonTime = toHHMM(String(oneDay.lesson_time));
    const roomId = String(oneDay.room_id ?? "");
    const weekday = weekdayOfYmd(lessonDate);

    const { data: adminBlockHit, error: adminBlockErr } = await supabaseServer
      .from("practice_reservations")
      .select("id")
      .eq("date", lessonDate)
      .eq("room_id", roomId)
      .eq("start_time", lessonTime)
      .eq("reservation_kind", "ADMIN_BLOCK")
      .eq("status", "APPROVED")
      .limit(1);

    if (adminBlockErr) return json({ error: adminBlockErr.message }, 500);

    if ((adminBlockHit ?? []).length > 0) {
      return json({ error: "CONFLICT_WITH_ADMIN_BLOCK" }, 409);
    }

    if (teacher_id) {
      const { data: teacher, error: teacherErr } = await supabaseServer
        .from("profiles")
        .select("id, name, role")
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
        .lte("start_time", lessonTime)
        .gt("end_time", lessonTime)
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
        .lte("start_time", lessonTime)
        .gt("end_time", lessonTime)
        .limit(1);

      if (blockErr) return json({ error: blockErr.message }, 500);

      if ((blockRows ?? []).length > 0) {
        return json({ error: "TEACHER_CHANGE_BLOCKED" }, 409);
      }

      const { data: lessonHit, error: lessonErr } = await supabaseServer
        .from("lessons")
        .select("id")
        .eq("teacher_id", teacher_id)
        .eq("lesson_date", lessonDate)
        .eq("lesson_time", `${lessonTime}:00`)
        .neq("status", "canceled")
        .limit(1);

      if (lessonErr) return json({ error: lessonErr.message }, 500);

      if ((lessonHit ?? []).length > 0) {
        return json({ error: "CONFLICT_WITH_TEACHER_LESSON" }, 409);
      }

      const { data: oneDayHit, error: oneDayErr } = await supabaseServer
        .from("oneday_lessons")
        .select("id")
        .eq("teacher_id", teacher_id)
        .eq("lesson_date", lessonDate)
        .eq("lesson_time", `${lessonTime}:00`)
        .neq("id", oneDayId)
        .neq("status", "canceled")
        .limit(1);

      if (oneDayErr) return json({ error: oneDayErr.message }, 500);

      if ((oneDayHit ?? []).length > 0) {
        return json({ error: "CONFLICT_WITH_TEACHER_ONEDAY" }, 409);
      }
    }

    const updatePayload: any = {
      teacher_id,
      updated_at: new Date().toISOString(),
    };

    if (memo !== undefined) {
      updatePayload.memo = memo;
    }

    const { data, error } = await supabaseServer
      .from("oneday_lessons")
      .update(updatePayload)
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