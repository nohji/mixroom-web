import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: "Unauthorized (no token)" };

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

  if (meErr || !me) return { ok: false as const, status: 403, error: "Forbidden (no profile)" };
  if (me.role !== "admin") return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, userId: user.id };
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * GET /api/admin/teacher-availabilities?teacherId=...
 */
export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(req.url);
    const teacherId = url.searchParams.get("teacherId");
    if (!teacherId) return NextResponse.json({ error: "teacherId 누락" }, { status: 400 });

    const { data, error } = await supabaseServer
      .from("teacher_availabilities")
      .select(
        "id, teacher_id, weekday, start_time, end_time, slot_minutes, device_type, is_active, effective_from, effective_until, created_at"
      )
      .eq("teacher_id", teacherId)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}

/**
 * POST 생성
 * body: {
 *  teacherId, weekday, startTime, endTime, slotMinutes, isActive, deviceType,
 *  effectiveFrom, effectiveUntil
 * }
 */
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));

    const teacherId = body.teacherId as string;
    const weekday = Number(body.weekday);
    const startTime = body.startTime as string;
    const endTime = body.endTime as string;
    const slotMinutes = Number(body.slotMinutes ?? 60);
    const isActive = Boolean(body.isActive ?? true);

    const deviceType = (body.deviceType ?? "both") as string;

    // ✅ 기간 추가
    const effectiveFrom = body.effectiveFrom as string | undefined; // YYYY-MM-DD
    const effectiveUntil = body.effectiveUntil as string | undefined; // YYYY-MM-DD

    if (!teacherId || Number.isNaN(weekday) || !startTime || !endTime) {
      return NextResponse.json({ error: "필수값 누락" }, { status: 400 });
    }
    if (weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: "weekday 오류" }, { status: 400 });
    }
    if (![30, 60].includes(slotMinutes)) {
      return NextResponse.json({ error: "slotMinutes는 30/60만" }, { status: 400 });
    }

    if (!["controller", "turntable", "both"].includes(deviceType)) {
      return NextResponse.json({ error: "deviceType 오류" }, { status: 400 });
    }

    // ✅ 기간 검증 (UI에서 강제로 넣게 만들 거라면 필수로 두는게 깔끔)
    if (!effectiveFrom || !effectiveUntil) {
      return NextResponse.json({ error: "effectiveFrom/effectiveUntil 누락" }, { status: 400 });
    }
    if (!isYmd(effectiveFrom) || !isYmd(effectiveUntil)) {
      return NextResponse.json({ error: "기간 형식 오류(YYYY-MM-DD)" }, { status: 400 });
    }
    if (effectiveFrom > effectiveUntil) {
      return NextResponse.json({ error: "기간 오류: 시작일 > 종료일" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("teacher_availabilities")
      .insert({
        teacher_id: teacherId,
        weekday,
        start_time: startTime,
        end_time: endTime,
        slot_minutes: slotMinutes,
        is_active: isActive,
        device_type: deviceType,

        // ✅ 기간 저장
        effective_from: effectiveFrom,
        effective_until: effectiveUntil,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}

/**
 * PATCH 수정/토글
 * body: {
 *  id,
 *  weekday?, startTime?, endTime?, slotMinutes?, isActive?,
 *  deviceType?,
 *  effectiveFrom?, effectiveUntil?
 * }
 */
export async function PATCH(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const id = body.id as string;
    if (!id) return NextResponse.json({ error: "id 누락" }, { status: 400 });

    const patch: any = {};

    if (body.weekday !== undefined) patch.weekday = Number(body.weekday);
    if (body.startTime !== undefined) patch.start_time = body.startTime;
    if (body.endTime !== undefined) patch.end_time = body.endTime;
    if (body.slotMinutes !== undefined) patch.slot_minutes = Number(body.slotMinutes);
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);

    if (body.deviceType !== undefined) {
      const deviceType = body.deviceType as string;
      if (!["controller", "turntable", "both"].includes(deviceType)) {
        return NextResponse.json({ error: "deviceType 오류" }, { status: 400 });
      }
      patch.device_type = deviceType;
    }

    // ✅ 기간 수정(부분 수정 가능)
    const ef = body.effectiveFrom as string | undefined;
    const eu = body.effectiveUntil as string | undefined;

    if (ef !== undefined) {
      if (!isYmd(ef)) return NextResponse.json({ error: "effectiveFrom 형식 오류" }, { status: 400 });
      patch.effective_from = ef;
    }
    if (eu !== undefined) {
      if (!isYmd(eu)) return NextResponse.json({ error: "effectiveUntil 형식 오류" }, { status: 400 });
      patch.effective_until = eu;
    }

    // 둘 다 들어온 경우는 순서 검증
    if (patch.effective_from && patch.effective_until) {
      if (patch.effective_from > patch.effective_until) {
        return NextResponse.json({ error: "기간 오류: 시작일 > 종료일" }, { status: 400 });
      }
    }

    const { error } = await supabaseServer.from("teacher_availabilities").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}

/**
 * DELETE 삭제
 * body: { id }
 */
export async function DELETE(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const id = body.id as string;
    if (!id) return NextResponse.json({ error: "id 누락" }, { status: 400 });

    const { error } = await supabaseServer.from("teacher_availabilities").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
