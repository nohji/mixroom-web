// /app/api/admin/list-rooms/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type DeviceType = "controller" | "turntable";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const url = new URL(req.url);
    const deviceType = (url.searchParams.get("deviceType") ?? "controller") as DeviceType;

    if (!["controller", "turntable"].includes(deviceType)) {
      return NextResponse.json({ error: "deviceType 오류" }, { status: 400 });
    }

    const filterCol = deviceType === "controller" ? "allow_controller" : "allow_turntable";

    const { data, error } = await supabaseServer
      .from("practice_rooms")
      .select("id,name")
      .eq("is_active", true)
      .eq(filterCol, true)
      .order("name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
