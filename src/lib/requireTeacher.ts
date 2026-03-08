// src/lib/requireTeacher.ts
import { getSupabaseServer } from "@/lib/supabaseServer";

type TeacherGuardResult =
  | { ok: true; teacherUserId: string }
  | { ok: false; status: 401 | 403; error: string };

export async function requireTeacher(): Promise<TeacherGuardResult> {
  const supabase = await getSupabaseServer();

  // 1️⃣ 로그인 확인
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { ok: false, status: 401, error: "로그인이 필요합니다." };
  }

  // 2️⃣ role + 활성 상태 확인
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

  if (role !== "TEACHER") {
    return { ok: false, status: 403, error: "강사만 접근 가능합니다." };
  }

  // 3️⃣ 성공
  return { ok: true, teacherUserId: user.id };
}