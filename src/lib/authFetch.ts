import { supabase } from "@/lib/supabaseClient";

/**
 * supabase session의 access_token을 Authorization 헤더에 붙여서 fetch
 * - requireAdmin/requireTeacher 같은 서버 가드가 이 토큰을 읽음
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    // 로그인 안 된 상태
    return new Response(
      JSON.stringify({ error: "Unauthorized (no access token)" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  // JSON body를 보내는 경우 content-type 자동 보강
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: "include", // ✅ 쿠키(세션) 포함
  });
}
