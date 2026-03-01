import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  lesson_date?: string; // "YYYY-MM-DD"
  lesson_time?: string; // "HH:mm" or "HH:mm:ss"
  teacher_id?: string | null;
  room_id?: string | null;
  status?: string; // scheduled | student_changed | admin_changed | canceled
  allow_change_override?: boolean;
  reason?: string;
  force?: boolean; // true면 충돌 있어도 진행
};

function normalizeStatus(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;

  const low = s.toLowerCase();

  if (s === "취소" || low === "cancel" || low === "canceled") return "canceled";
  if (s === "관리자변경" || low === "admin_changed" || low === "admin_change") return "admin_changed";
  if (s === "수강생변경" || low === "student_changed" || low === "student_change") return "student_changed";
  if (low === "scheduled") return "scheduled";

  const allowed = new Set(["scheduled", "student_changed", "admin_changed", "canceled"]);
  if (allowed.has(low)) return low;

  return undefined;
}

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return json({ error: guard.error }, guard.status);

    // ✅ Next 환경에서 params가 Promise라서 반드시 await
    const { id: lessonId } = await ctx.params;
    if (!lessonId) return json({ error: "missing_lesson_id" }, 400);

    const body = (await req.json().catch(() => ({}))) as Body;

    // ✅ status normalize + validation
    const normalizedStatus = body.status !== undefined ? normalizeStatus(body.status) : undefined;
    if (body.status !== undefined && !normalizedStatus) {
      return json(
        {
          error: "INVALID_STATUS",
          message: "status 값이 유효하지 않습니다.",
          received: body.status,
          allowed: ["scheduled", "student_changed", "admin_changed", "canceled"],
        },
        400
      );
    }

    // 1) 기존 레슨 로드
    const { data: before, error: beforeErr } = await supabaseServer
      .from("lessons")
      .select("*")
      .eq("id", lessonId)
      .single();

    if (beforeErr) return json({ error: beforeErr.message }, 500);
    if (!before) return json({ error: "lesson_not_found" }, 404);

    // 2) 적용될 최종 값 merge (충돌체크용)
    const effective = {
      lesson_date: body.lesson_date ?? before.lesson_date,
      lesson_time: body.lesson_time ?? before.lesson_time,
      teacher_id: body.teacher_id ?? before.teacher_id,
      room_id: body.room_id ?? before.room_id,
      status: normalizedStatus ?? before.status,
      allow_change_override:
        typeof body.allow_change_override === "boolean"
          ? body.allow_change_override
          : before.allow_change_override,
    };

    const isCancelling = effective.status === "canceled";

    // 3) 충돌 체크 (취소면 스킵)
    if (!isCancelling && effective.room_id && effective.lesson_date && effective.lesson_time) {
      const { data: conflicts, error: cErr } = await supabaseServer
        .from("lessons")
        .select("id, lesson_date, lesson_time, room_id, status")
        .eq("lesson_date", effective.lesson_date)
        .eq("lesson_time", effective.lesson_time)
        .eq("room_id", effective.room_id)
        .neq("id", lessonId)
        .neq("status", "canceled");

      if (cErr) return json({ error: cErr.message }, 500);

      const conflictList = conflicts ?? [];
      if (conflictList.length > 0 && body.force !== true) {
        return json(
          {
            error: "CONFLICT",
            message: "같은 시간/같은 룸에 다른 레슨이 존재합니다. 그래도 변경할까요?",
            conflicts: conflictList,
            effective,
          },
          409
        );
      }
    }

    // 4) patch 구성
    const patch: Record<string, any> = {};
    if (body.lesson_date !== undefined) patch.lesson_date = body.lesson_date;
    if (body.lesson_time !== undefined) patch.lesson_time = body.lesson_time;
    if (body.teacher_id !== undefined) patch.teacher_id = body.teacher_id;
    if (body.room_id !== undefined) patch.room_id = body.room_id;
    if (body.allow_change_override !== undefined) patch.allow_change_override = body.allow_change_override;
    if (body.status !== undefined) patch.status = normalizedStatus;

    if (Object.keys(patch).length === 0) {
      return json({ ok: true, lesson: before, note: "no_changes" });
    }

    const { data: after, error: upErr } = await supabaseServer
      .from("lessons")
      .update(patch)
      .eq("id", lessonId)
      .select("*")
      .single();

    if (upErr) return json({ error: upErr.message }, 500);

    // 5) audit (있다 했으니 기록)
    const adminId =
      // @ts-ignore
      guard.user?.id ?? guard.admin_id ?? null;

    try {
      await supabaseServer.from("lesson_admin_audits").insert({
        lesson_id: lessonId,
        admin_id: adminId,
        action: "FORCE_UPDATE",
        reason: body.reason ?? null,
        before,
        after,
      });
    } catch (e) {
      console.warn("[lesson_admin_audits] insert failed:", e);
    }

    return json({ ok: true, lesson: after });
  } catch (e: any) {
    console.error("[force-update] error:", e);
    return json({ error: "internal_error", message: e?.message ?? String(e) }, 500);
  }
}