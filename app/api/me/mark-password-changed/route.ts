import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return token ?? null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized (no token)" }, { status: 401 });
    }

    const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabaseServer
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
