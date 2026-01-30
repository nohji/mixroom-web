"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LogoutButton() {
  const router = useRouter();

  const onLogout = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem("skip_pw_change_once");
    router.replace("/login");
    router.refresh();
  };

  return (
    <button onClick={onLogout}>
      로그아웃
    </button>
  );
}
