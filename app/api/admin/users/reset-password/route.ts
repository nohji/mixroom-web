import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
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
    const newPassword = (body.newPassword as string | undefined) ?? "0000";

    if (!userId) {
      return NextResponse.json(
        { error: "userId required" },
        { status: 400 }
      );
    }

    if (!newPassword || String(newPassword).trim().length < 4) {
      return NextResponse.json(
        { error: "newPassword must be at least 4 characters" },
        { status: 400 }
      );
    }

    // 1) Supabase Auth 비밀번호 재설정
    const { error: authErr } =
      await supabaseServer.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

    if (authErr) {
      return NextResponse.json(
        { error: authErr.message },
        { status: 500 }
      );
    }

    // 2) 다음 로그인 시 비밀번호 다시 설정하도록 플래그 변경
    const { error: profileErr } = await supabaseServer
      .from("profiles")
      .update({
        must_change_password: true,
      })
      .eq("id", userId);

    if (profileErr) {
      return NextResponse.json(
        { error: profileErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      userId,
      resetPassword: true,
      temporaryPassword: newPassword,
      must_change_password: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}