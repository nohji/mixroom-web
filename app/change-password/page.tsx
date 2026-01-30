"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    // 로그인 안 되어 있으면 로그인으로
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) router.replace("/login");
    })();
  }, [router]);

  const onSubmit = async () => {
    setMsg("");

    if (!pw1 || pw1.length < 6) {
      setMsg("비밀번호는 최소 6자리 이상으로 해줘!");
      return;
    }
    if (pw1 !== pw2) {
      setMsg("비밀번호 확인이 일치하지 않아!");
      return;
    }

    setLoading(true);
    try {
      // 1) Supabase Auth 비밀번호 변경
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) {
        setMsg(error.message ?? "비밀번호 변경 실패");
        return;
      }

      // 2) profiles.must_change_password = false 처리 (API로)
      const res = await authFetch("/api/me/mark-password-changed", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "프로필 업데이트 실패");
        return;
      }

      // 3) 다시 /app으로 보내서 역할 분기
      router.replace("/app");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const onSkip = async () => {
    // ✅ must_change_password는 그대로 둠 (다음 로그인 때 다시 변경 화면으로 유도)
    // 그냥 역할 라우팅(/app)으로 보내기만 한다.
    sessionStorage.setItem("skip_pw_change_once", "1");
    router.replace("/app");
    router.refresh();
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 20 }}>
      <h1 style={{ margin: "0 0 10px 0", color: "#111" }}>비밀번호 변경</h1>
      <p style={{ margin: "0 0 16px 0", color: "#444", lineHeight: 1.5 }}>
        최초 로그인이라 비밀번호 변경이 필요해요.
        <br />
        지금은 넘어갈 수 있지만, 다음 로그인 때 다시 안내돼요.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#111" }}>
          새 비밀번호
          <input
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            placeholder="최소 6자리"
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              color: "#111",
              background: "#fff",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "#111" }}>
          새 비밀번호 확인
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="한번 더 입력"
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              color: "#111",
              background: "#fff",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            onClick={onSubmit}
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: loading ? "#f3f3f3" : "#111",
              color: loading ? "#777" : "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "변경 중..." : "변경 완료"}
          </button>

          <button
            onClick={onSkip}
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#fff",
              color: "#111",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            다음에 변경하기
          </button>
        </div>

        {msg && (
          <div
            style={{
              marginTop: 6,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #f1c1c1",
              background: "#fff5f5",
              color: "#b00020",
            }}
          >
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
