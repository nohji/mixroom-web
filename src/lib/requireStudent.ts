import { getSupabaseServer } from "@/lib/supabaseServer";

type StudentGuardResult =
  | { ok: true; studentUserId: string }
  | { ok: false; status: 401 | 403; error: string };

export async function requireStudent(): Promise<StudentGuardResult> {
  const supabase = await getSupabaseServer();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { ok: false, status: 401, error: "로그인이 필요합니다." };
  }
 
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return { ok: false, status: 403, error: "권한 확인 실패 (profile 없음)" };
  }


  // 🔴 휴면 계정 차단
  if (!profile.is_active) {
    return {
      ok: false,
      status: 403,
      error: "휴면 계정입니다. 관리자에게 문의하세요.",
    };
  }

  const role = String(profile.role ?? "").toUpperCase();

  if (role !== "STUDENT") {
    return { ok: false, status: 403, error: "수강생만 접근 가능합니다." };
  }

  return { ok: true, studentUserId: user.id };
}