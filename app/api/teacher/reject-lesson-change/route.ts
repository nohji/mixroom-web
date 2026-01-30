import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function pickOne<T>(x: any): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] as T) : (x as T);
}

async function requireTeacher(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: "Unauthorized (no token)" };

  const { data: userData } = await supabaseServer.auth.getUser(token);
  const user = userData?.user;
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized (invalid token)" };

  const { data: me } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!me || me.role !== "teacher") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, userId: user.id };
}

export async function POST(req: Request) {
  try {
    const auth = await requireTeacher(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const requestId = body.requestId as string | undefined;
    const reason = body.reason as string | undefined;

    if (!requestId) {
      return NextResponse.json({ error: "requestId 누락" }, { status: 400 });
    }

    // 요청 소유 검증
    const { data: row, error: rErr } = await supabaseServer
      .from("lesson_change_requests")
      .select(
        `
        id,
        status,
        lesson:lessons!inner (
          id,
          class:classes!inner ( teacher_id )
        )
      `
      )
      .eq("id", requestId)
      .single();

    if (rErr || !row) return NextResponse.json({ error: "요청 없음" }, { status: 404 });
    if (row.status !== "pending") {
      return NextResponse.json({ error: "이미 처리된 요청" }, { status: 400 });
    }

    const lesson = pickOne<any>(row.lesson);
    const cls = pickOne<any>(lesson?.class);
    const teacherId = cls?.teacher_id ?? null;

    if (!teacherId) return NextResponse.json({ error: "담당 강사 정보 없음" }, { status: 400 });
    if (teacherId !== auth.userId) {
      return NextResponse.json({ error: "내 요청이 아님(권한 없음)" }, { status: 403 });
    }

    const { error: uErr } = await supabaseServer
      .from("lesson_change_requests")
      .update({
        status: "rejected",
        handled_by_role: "teacher",
        handled_by_id: auth.userId,
        handled_at: new Date().toISOString(),
        reject_reason: reason ?? null,
      })
      .eq("id", requestId);

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
