import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/requireAdmin";

export async function POST(req: Request) {
  try {
    /* ------------------------------
     * 1) 관리자 권한 체크 (401 / 403)
     * ------------------------------ */
    const guard = await requireAdmin(req);
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.status }
      );
    }

    const adminUserId = guard.adminUserId;

    /* ------------------------------
     * 2) body 파싱
     * ------------------------------ */
    const body = await req.json().catch(() => ({}));
    const requestId = body.requestId as string | undefined;

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId 누락" },
        { status: 400 }
      );
    }

    /* ------------------------------
     * 3) 변경 요청 조회
     * ------------------------------ */
    const { data: reqRow, error: reqErr } = await supabaseServer
      .from("lesson_change_requests")
      .select(`
        id,
        status,
        lesson_id,
        to_date,
        to_time
      `)
      .eq("id", requestId)
      .single();

    if (reqErr || !reqRow) {
      return NextResponse.json(
        { error: "요청 없음" },
        { status: 404 }
      );
    }

    if (reqRow.status !== "pending") {
      return NextResponse.json(
        { error: "이미 처리된 요청" },
        { status: 400 }
      );
    }

    /* ------------------------------
     * 4) 레슨 날짜/시간 변경
     * ------------------------------ */
    const { error: lessonErr } = await supabaseServer
      .from("lessons")
      .update({
        lesson_date: reqRow.to_date,
        lesson_time: reqRow.to_time,
      })
      .eq("id", reqRow.lesson_id);

    if (lessonErr) {
      return NextResponse.json(
        { error: lessonErr.message },
        { status: 500 }
      );
    }

    /* ------------------------------
     * 5) 요청 승인 처리 (로그 포함)
     * ------------------------------ */
    const { error: updateErr } = await supabaseServer
      .from("lesson_change_requests")
      .update({
        status: "approved",
        handled_by_role: "admin",
        handled_by_id: adminUserId,
        handled_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }

    /* ------------------------------
     * 6) 성공 응답
     * ------------------------------ */
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "서버 오류" },
      { status: 500 }
    );
  }
}
