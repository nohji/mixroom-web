import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const url = new URL(req.url);

    const q = (url.searchParams.get("q") ?? "").trim(); // 이름 / 전화
    const role = (url.searchParams.get("role") ?? "").trim(); // student / teacher / admin
    const active = (url.searchParams.get("active") ?? "").trim(); // active / inactive

    let query = supabaseServer
      .from("profiles")
      .select(
        `
        id,
        role,
        name,
        phone,
        must_change_password,
        created_at,
        is_active,
        deactivated_at
      `
      )
      .order("created_at", { ascending: false })
      .limit(200);

    // 역할 필터
    if (role && role !== "all") {
      query = query.eq("role", role);
    }

    // 활성 / 휴면 필터
    if (active === "active") {
      query = query.eq("is_active", true);
    }

    if (active === "inactive") {
      query = query.eq("is_active", false);
    }

    // 이름 / 전화 검색
    if (q) {
      query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rows: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "서버 오류" },
      { status: 500 }
    );
  }
}