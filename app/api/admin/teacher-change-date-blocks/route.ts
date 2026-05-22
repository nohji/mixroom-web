import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);

  if (!token) {
    return { ok: false as const, status: 401, error: "Unauthorized (no token)" };
  }

  const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);
  const user = userData?.user;

  if (userErr || !user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const { data: profile, error: profileErr } = await supabaseServer
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile || String(profile.role).toUpperCase() !== "ADMIN") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user };
}

function normalizeTime(t: string) {
  if (!t) return "";
  return t.length === 5 ? `${t}:00` : t;
}

function isValidYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function toMin(t: string) {
  const [hh, mm] = t.slice(0, 5).split(":").map(Number);
  return hh * 60 + mm;
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get("teacherId");

    if (!teacherId) {
      return NextResponse.json({ error: "teacherId is required" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("teacher_change_date_blocks")
      .select("id, teacher_id, block_date, start_time, end_time, reason, is_active, created_at")
      .eq("teacher_id", teacherId)
      .order("block_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load date blocks" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const body = await req.json();

    const teacherId = body.teacherId;
    const blockDate = body.blockDate;
    const startTime = normalizeTime(body.startTime);
    const endTime = normalizeTime(body.endTime);
    const reason = body.reason ?? null;
    const isActive = body.isActive ?? true;

    if (!teacherId) {
      return NextResponse.json({ error: "teacherId is required" }, { status: 400 });
    }

    if (!blockDate || !isValidYmd(blockDate)) {
      return NextResponse.json({ error: "blockDate is invalid" }, { status: 400 });
    }

    if (!startTime || !endTime || toMin(startTime) >= toMin(endTime)) {
      return NextResponse.json({ error: "time range is invalid" }, { status: 400 });
    }

    const { data: overlapRows, error: overlapErr } = await supabaseServer
      .from("teacher_change_date_blocks")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("block_date", blockDate)
      .eq("is_active", true)
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .limit(1);

    if (overlapErr) throw overlapErr;

    if ((overlapRows ?? []).length > 0 && isActive) {
      return NextResponse.json(
        { error: "이미 겹치는 하루 차단 시간이 있습니다." },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseServer
      .from("teacher_change_date_blocks")
      .insert({
        teacher_id: teacherId,
        block_date: blockDate,
        start_time: startTime,
        end_time: endTime,
        reason,
        is_active: isActive,
      })
      .select("id, teacher_id, block_date, start_time, end_time, reason, is_active, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to create date block" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const body = await req.json();
    const id = body.id;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const patch: Record<string, any> = {};

    if (typeof body.isActive === "boolean") {
      patch.is_active = body.isActive;
    }

    if (body.reason !== undefined) {
      patch.reason = body.reason;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("teacher_change_date_blocks")
      .update(patch)
      .eq("id", id)
      .select("id, teacher_id, block_date, start_time, end_time, reason, is_active, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to update date block" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const body = await req.json();
    const id = body.id;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("teacher_change_date_blocks")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to delete date block" },
      { status: 500 }
    );
  }
}