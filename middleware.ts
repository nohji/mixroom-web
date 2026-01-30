import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // ✅ 중요: 이 호출이 있어야 세션이 쿠키 기반으로 유지/갱신됨
  await supabase.auth.getUser();

  return res;
}

// app 라우팅 + api 라우트에서만 동작시키기
export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
