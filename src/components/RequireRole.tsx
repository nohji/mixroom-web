"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "admin" | "teacher" | "student";

export default function RequireRole({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const run = async () => {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (!profile || profile.role !== role) {
        router.replace("/login");
        return;
      }

      setOk(true);
    };

    run();
  }, [router, role]);

  if (!ok) return <div style={{ padding: 24 }}>접근 확인 중...</div>;

  return <>{children}</>;
}
