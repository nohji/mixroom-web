import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Unauthorized (no token)" };
  }

  // 토큰으로 유저 확인
  const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);
  const user = userData?.user;

  if (userErr || !user) {
    return { ok: false as const, status: 401, error: "Unauthorized (invalid token)" };
  }

  // role 확인
  const { data: me, error: meErr } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (meErr || !me) {
    return { ok: false as const, status: 403, error: "Forbidden (no profile)" };
  }

  if (me.role !== "admin") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, userId: user.id };
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // 병렬 조회
    const [
      { data: teachers, error: teachersErr },
      { data: availability, error: availErr },
      { data: changeBlocks, error: blockErr },
    ] = await Promise.all([
      supabaseServer
        .from("profiles")
        .select("id, name")
        .eq("role", "teacher")
        .eq("is_active", true)
        .order("name", { ascending: true }),

      supabaseServer
        .from("teacher_availabilities")
        .select("id, teacher_id, weekday, start_time, end_time")
        .order("weekday", { ascending: true })
        .order("start_time", { ascending: true }),

      supabaseServer
        .from("teacher_change_blocks")
        .select("id, teacher_id, weekday, start_time, end_time, reason, is_active")
        .order("teacher_id", { ascending: true })
        .order("weekday", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);

    if (teachersErr) {
      return NextResponse.json({ error: teachersErr.message }, { status: 500 });
    }

    if (availErr) {
      return NextResponse.json({ error: availErr.message }, { status: 500 });
    }

    if (blockErr) {
      return NextResponse.json({ error: blockErr.message }, { status: 500 });
    }

    const teacherNameMap = new Map(
      (teachers ?? []).map((t: any) => [String(t.id), t.name ?? "이름없음"])
    );

    const rows = (availability ?? []).map((row: any) => ({
      id: String(row.id),
      teacher_id: String(row.teacher_id),
      teacher_name: teacherNameMap.get(String(row.teacher_id)) ?? "이름없음",
      weekday: Number(row.weekday),
      start_time: row.start_time,
      end_time: row.end_time,
    }));

    const change_blocks = (changeBlocks ?? []).map((row: any) => ({
      id: String(row.id),
      teacher_id: String(row.teacher_id),
      weekday: Number(row.weekday),
      start_time: row.start_time,
      end_time: row.end_time,
      reason: row.reason ?? null,
      is_active: Boolean(row.is_active),
    }));

    return NextResponse.json({
      rows,
      teachers: (teachers ?? []).map((t: any) => ({
        id: String(t.id),
        name: t.name ?? "이름없음",
      })),
      change_blocks,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "서버 오류" },
      { status: 500 }
    );
  }
}