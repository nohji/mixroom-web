"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  boxStyle,
  inputStyle,
  primaryButton,
  disabledButton,
  pageTitle,
  colors,
} from "@/styles/ui";

function normalizePhone(input: string) {
  return input.replace(/\D/g, "");
}
function phoneToEmail(phoneDigits: string) {
  return `${phoneDigits}@mixroom.local`;
}

export default function LoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("0000");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const onLogin = async () => {
    setMsg("");
    setLoading(true);

    try {
      const phoneDigits = normalizePhone(phone);
      if (!phoneDigits) return setMsg("휴대폰 번호를 입력해줘!");
      if (phoneDigits.length < 10 || phoneDigits.length > 11) {
        return setMsg("휴대폰 번호 형식이 이상해요. (10~11자리)");
      }

      const email = phoneToEmail(phoneDigits);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.session) return setMsg(error?.message ?? "로그인 실패");

      router.replace("/app"); // ✅ 루비 언니가 확인한 루트
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 20, color: "#111" }}>
      <div style={{ ...boxStyle }}>
        <h1 style={{ ...pageTitle, marginTop: 0 }}>Mixroom 로그인</h1>
        <p style={{ color: colors.textSub, marginTop: 6 }}>
          휴대폰 번호로 로그인해요. (하이픈 없이 입력해도 OK)
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            휴대폰 번호
            <input
              style={inputStyle}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
              inputMode="numeric"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            비밀번호
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="0000"
            />
            <span style={{ color: colors.textMuted, fontSize: 12 }}>
              초기 비밀번호는 0000 (로그인 후 변경 권장)
            </span>
          </label>

          <button
            onClick={onLogin}
            disabled={loading}
            style={loading ? disabledButton : primaryButton}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          {msg && (
            <div
              style={{
                border: `1px solid #f1c1c1`,
                background: "#fff5f5",
                color: colors.danger,
                borderRadius: 10,
                padding: 10,
              }}
            >
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
