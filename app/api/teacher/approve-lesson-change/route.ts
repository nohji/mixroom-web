// app/api/teacher/approve-lesson-change/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireTeacher } from "@/lib/requireTeacher";

export async function POST(req: Request) {
  try {
    // 1) teacher 가드
    const guard = await requireTeacher(req);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const teacherId = guard.teacherId;

    // 2) body
    const body = await req.json().catch(() => ({}));
    const requestId = body.requestId as string | undefined;
    if (!requestId) {
      return NextResponse.json({ error: "requestId 누락" }, { status: 400 });
    }

    // 3) 요청 조회 (pending만)
    const { data: reqRow, error: reqErr } = await supabaseServer
      .from("lesson_change_requests")
      .select("id, status, lesson_id, to_date, to_time")
      .eq("id", requestId)
      .single();

    if (reqErr || !reqRow) {
      return NextResponse.json({ error: "요청 없음" }, { status: 404 });
    }
    if (reqRow.status !== "pending") {
      return NextResponse.json({ error: "이미 처리된 요청" }, { status: 400 });
    }

    // 4) lesson + class.teacher_id가 내 것인지 확인
    const { data: lessonRow, error: lErr } = await supabaseServer
      .from("lessons")
      .select(
        `
        id,
        lesson_date,
        lesson_time,
        class:classes!inner ( id, teacher_id )
      `
      )
      .eq("id", reqRow.lesson_id)
      .single();

    if (lErr || !lessonRow) {
      return NextResponse.json({ error: "레슨 없음" }, { status: 404 });
    }

    const classRow = Array.isArray((lessonRow as any).class)
      ? (lessonRow as any).class?.[0]
      : (lessonRow as any).class;

    if (!classRow?.teacher_id) {
      return NextResponse.json({ error: "레슨 담당 강사 정보 없음" }, { status: 400 });
    }
    if (classRow.teacher_id !== teacherId) {
      return NextResponse.json({ error: "내 수강생 요청이 아님" }, { status: 403 });
    }

    // 5) 충돌 체크 (같은 teacher, 같은 to_date+to_time에 다른 레슨 있으면 불가)
    const { data: conflict, error: cErr } = await supabaseServer
      .from("lessons")
      .select(
        `
        id,
        class:classes!inner ( teacher_id )
      `
      )
      .eq("lesson_date", reqRow.to_date)
      .eq("lesson_time", reqRow.to_time)
      .eq("class.teacher_id", teacherId)
      .neq("id", reqRow.lesson_id) // 본인 레슨 제외
      .limit(1);

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }
    if ((conflict ?? []).length > 0) {
      return NextResponse.json({ error: "해당 시간에 이미 레슨이 있습니다." }, { status: 400 });
    }

    // 6) lessons 업데이트 (즉시 반영)
    const { error: updLessonErr } = await supabaseServer
      .from("lessons")
      .update({
        lesson_date: reqRow.to_date,
        lesson_time: reqRow.to_time,
      })
      .eq("id", reqRow.lesson_id);

    if (updLessonErr) {
      return NextResponse.json({ error: updLessonErr.message }, { status: 500 });
    }

    // 7) request 승인 처리 (teacher가 handled)
    const { error: updReqErr } = await supabaseServer
      .from("lesson_change_requests")
      .update({
        status: "approved",
        handled_by_role: "teacher",
        handled_by_id: teacherId,
        handled_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updReqErr) {
      return NextResponse.json({ error: updReqErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
