import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim(); // name/phone
    const role = (url.searchParams.get("role") ?? "").trim(); // student/teacher/all

    let query = supabaseServer
      .from("profiles")
      .select("id, role, name, phone, must_change_password, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (role && role !== "all") query = query.eq("role", role);

    // 간단 검색(이름/phone)
    if (q) {
      // ilike OR 쓰려면 `or()` 사용
      query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
