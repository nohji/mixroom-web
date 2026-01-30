import { supabaseServer } from "@/lib/supabaseServer";

type AdminGuardResult =
  | { ok: true; adminUserId: string }
  | { ok: false; status: 401 | 403; error: string };

export async function requireAdmin(req: Request): Promise<AdminGuardResult> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, error: "로그인이 필요합니다. (token 없음)" };
  }

  const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);

  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "세션이 유효하지 않습니다." };
  }

  const userId = userData.user.id;

  const { data: profile, error: profileErr } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    return { ok: false, status: 403, error: "권한 확인 실패 (profile 없음)" };
  }

  if (profile.role !== "admin") {
    return { ok: false, status: 403, error: "관리자만 접근 가능합니다." };
  }

  return { ok: true, adminUserId: userId };
}
