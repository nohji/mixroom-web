"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AppHome() {
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, must_change_password")
        .eq("id", user.id)
        .single();

      if (error || !profile) {
        router.replace("/login");
        return;
      }

      // ✅ "다음에 변경하기"를 누른 이번 세션만 스킵
      const skipOnce = sessionStorage.getItem("skip_pw_change_once") === "1";

      // ✅ 1) 첫 로그인 비번 변경 강제 (단, 이번 세션 스킵이면 통과)
      if (profile.must_change_password && !skipOnce) {
        router.replace("/change-password");
        return;
      }

      // ✅ 2) 역할 라우팅
      if (profile.role === "student") router.replace("/student");
      else if (profile.role === "teacher") router.replace("/teacher");
      else if (profile.role === "admin") router.replace("/admin");
      else router.replace("/login");
    };

    load();
  }, [router]);

  return <p style={{ padding: 24, color: "#111" }}>역할 확인 중...</p>;
}
