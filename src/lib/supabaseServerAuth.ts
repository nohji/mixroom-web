import { createServerClient } from "@supabase/ssr";
import { headers } from "next/headers";

/**
 * Next App Router용 Supabase 서버 클라이언트
 * - 쿠키 기반 세션 읽기 전용
 * - redirect 판단, role 체크용
 */
export async function supabaseServerAuth() {
  // ⚠️ headers()는 Promise임
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie");

  const cookies = cookieHeader
    ? cookieHeader.split(";").map((c) => {
        const [name, ...rest] = c.trim().split("=");
        return {
          name,
          value: rest.join("="),
        };
      })
    : [];

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies;
        },
        // 서버 컴포넌트에서는 set 필요 없음
        setAll() {},
      },
    }
  );
}
