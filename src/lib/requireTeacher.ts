// src/lib/requireTeacher.ts
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function requireTeacher(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Unauthorized (no token)" };
  }

  const { data: userData } = await supabaseServer.auth.getUser(token);
  const user = userData?.user;
  if (!user) {
    return { ok: false as const, status: 401, error: "Unauthorized (invalid token)" };
  }

  const { data: me, error: meErr } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (meErr || !me) {
    return { ok: false as const, status: 403, error: "Profile not found" };
  }

  if (me.role !== "teacher") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, teacherId: user.id };
}
