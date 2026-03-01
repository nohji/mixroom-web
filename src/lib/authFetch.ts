/**
 * 쿠키 기반 세션을 포함해서 fetch
 * - 서버는 getSupabaseServer().auth.getUser()로 유저 확인
 * - Authorization Bearer 토큰 사용 안 함
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

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
