import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { data: teachers, error: tErr } = await supabaseServer
    .from("profiles")
    .select("id, name, role")
    .eq("role", "teacher")
    .order("name", { ascending: true });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const { data: rooms, error: rErr } = await supabaseServer
    .from("practice_rooms")
    .select("id, name")
    .order("name", { ascending: true });

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  return NextResponse.json({
    teachers: (teachers ?? []).map((x: any) => ({ id: String(x.id), name: String(x.name ?? "알 수 없음") })),
    rooms: (rooms ?? []).map((x: any) => ({ id: String(x.id), name: String(x.name ?? x.id) })),
  });
}
