import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: "Unauthorized (no token)" };

  // ✅ 토큰으로 유저 확인
  const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);
  const user = userData?.user;

  if (userErr || !user) {
    return { ok: false as const, status: 401, error: "Unauthorized (invalid token)" };
  }

  // ✅ role 확인 (service role로 profiles 조회)
  const { data: me, error: meErr } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (meErr || !me) return { ok: false as const, status: 403, error: "Forbidden (no profile)" };
  if (me.role !== "admin") return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, userId: user.id };
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data, error } = await supabaseServer
      .from("profiles")
      .select("id, name")
      .eq("role", "teacher")
      .order("name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
