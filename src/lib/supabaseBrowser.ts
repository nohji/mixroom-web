// lib/supabaseBrowser.ts
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(url, key, {
    cookies: {
      get(name) {
        if (typeof document === "undefined") return undefined;
        const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
        return m ? decodeURIComponent(m[2]) : undefined;
      },
      set(name, value, options) {
        if (typeof document === "undefined") return;
        let cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
        if (options?.maxAge) cookie += `; Max-Age=${options.maxAge}`;
        document.cookie = cookie;
      },
      remove(name) {
        if (typeof document === "undefined") return;
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
      },
    },
  });
}
