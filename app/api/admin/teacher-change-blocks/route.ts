import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Unauthorized (no token)" };
  }

  const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);
  const user = userData?.user;

  if (userErr || !user) {
    return { ok: false as const, status: 401, error: "Unauthorized (invalid token)" };
  }

  const { data: me, error: meErr } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (meErr || !me) {
    return { ok: false as const, status: 403, error: "Forbidden (no profile)" };
  }
  if (me.role !== "admin") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, userId: user.id };
}

function toMin(t: string) {
  const [hh, mm] = String(t ?? "").slice(0, 5).split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const url = new URL(req.url);
    const teacherId = url.searchParams.get("teacherId");

    let q = supabaseServer
      .from("teacher_change_blocks")
      .select("id, teacher_id, weekday, start_time, end_time, reason, is_active, created_at, updated_at")
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (teacherId) {
      q = q.eq("teacher_id", teacherId);
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));

    const teacherId = String(body.teacherId ?? "");
    const weekday = Number(body.weekday);
    const startTime = String(body.startTime ?? "").slice(0, 8);
    const endTime = String(body.endTime ?? "").slice(0, 8);
    const reason = body.reason ? String(body.reason) : null;
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

    if (!teacherId || Number.isNaN(weekday) || !startTime || !endTime) {
      return NextResponse.json({ error: "필수값 누락" }, { status: 400 });
    }

    if (weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: "weekday 오류" }, { status: 400 });
    }

    if (toMin(startTime) >= toMin(endTime)) {
      return NextResponse.json({ error: "시간 오류: 시작시간은 종료시간보다 빨라야 해요." }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("teacher_change_blocks")
      .insert({
        teacher_id: teacherId,
        weekday,
        start_time: startTime,
        end_time: endTime,
        reason,
        is_active: isActive,
        created_by: auth.userId,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id) {
      return NextResponse.json({ error: "id 누락" }, { status: 400 });
    }

    const patch: any = {};

    if (body.weekday !== undefined) {
      const weekday = Number(body.weekday);
      if (Number.isNaN(weekday) || weekday < 0 || weekday > 6) {
        return NextResponse.json({ error: "weekday 오류" }, { status: 400 });
      }
      patch.weekday = weekday;
    }

    if (body.startTime !== undefined) {
      patch.start_time = String(body.startTime).slice(0, 8);
    }

    if (body.endTime !== undefined) {
      patch.end_time = String(body.endTime).slice(0, 8);
    }

    if (body.reason !== undefined) {
      patch.reason = body.reason ? String(body.reason) : null;
    }

    if (body.isActive !== undefined) {
      patch.is_active = Boolean(body.isActive);
    }

    if (patch.start_time && patch.end_time) {
      if (toMin(patch.start_time) >= toMin(patch.end_time)) {
        return NextResponse.json({ error: "시간 오류: 시작시간은 종료시간보다 빨라야 해요." }, { status: 400 });
      }
    }

    const { error } = await supabaseServer
      .from("teacher_change_blocks")
      .update(patch)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id) {
      return NextResponse.json({ error: "id 누락" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("teacher_change_blocks")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}