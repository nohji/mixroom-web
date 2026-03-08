import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function PATCH(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.status }
      );
    }

    const body = await req.json().catch(() => ({}));

    const userId = body.userId as string | undefined;
    const isActive = body.isActive as boolean | undefined;

    if (!userId) {
      return NextResponse.json(
        { error: "userId required" },
        { status: 400 }
      );
    }

    if (typeof isActive !== "boolean") {
      return NextResponse.json(
        { error: "isActive must be boolean" },
        { status: 400 }
      );
    }

    const updateData: any = {
      is_active: isActive,
    };

    if (!isActive) {
      updateData.deactivated_at = new Date().toISOString();
    } else {
      updateData.deactivated_at = null;
      updateData.deactivated_reason = null;
    }

    const { error } = await supabaseServer
      .from("profiles")
      .update(updateData)
      .eq("id", userId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      userId,
      isActive,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}