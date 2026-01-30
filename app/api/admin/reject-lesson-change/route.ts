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
    const reason = body.reason as string | undefined;

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId 누락" },
        { status: 400 }
      );
    }

    /* ------------------------------
     * 3) 요청 상태 확인
     * ------------------------------ */
    const { data: reqRow, error: reqErr } = await supabaseServer
      .from("lesson_change_requests")
      .select("id, status")
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
        { error: "처리 불가능한 요청" },
        { status: 400 }
      );
    }

    /* ------------------------------
     * 4) 거절 처리 (로그 포함)
     * ------------------------------ */
    const { error: updErr } = await supabaseServer
      .from("lesson_change_requests")
      .update({
        status: "rejected",
        handled_by_role: "admin",
        handled_by_id: adminUserId,
        handled_at: new Date().toISOString(),
        reject_reason: reason ?? null,
      })
      .eq("id", requestId);

    if (updErr) {
      return NextResponse.json(
        { error: updErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "서버 오류" },
      { status: 500 }
    );
  }
}
