import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/requireAdmin";

type Body = {
  admin_note?: string | null;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json(
        { error: admin.error ?? "admin only" },
        { status: admin.status ?? 403 }
      );
    }

    const { studentId } = await params;
    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const admin_note =
      typeof body.admin_note === "string" ? body.admin_note.trim() : "";

    const { data, error } = await supabaseServer
      .from("profiles")
      .update({ admin_note })
      .eq("id", studentId)
      .select("id, admin_note")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      student_id: data.id,
      admin_note: data.admin_note ?? "",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}
