import { getSupabaseServer } from "@/lib/supabaseServer";

type AdminGuardResult =
  | { ok: true; adminUserId: string }
  | { ok: false; status: 401 | 403; error: string };

export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await getSupabaseServer();

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { ok: false, status: 401, error: "로그인이 필요합니다." };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return { ok: false, status: 403, error: "권한 확인 실패 (profile 없음)" };
  }

 const role = String(profile.role ?? "").toUpperCase();
if (role !== "ADMIN") {
  return { ok: false, status: 403, error: "관리자만 접근 가능합니다." };
}


  return { ok: true, adminUserId: user.id };
}
