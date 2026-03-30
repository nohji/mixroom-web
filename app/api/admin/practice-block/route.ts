import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  date?: string;
  time?: string;      // "HH:mm" or "HH:mm:ss"
  room_id?: string;
  reason?: string | null;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}

function toHHMM(t: string) {
  const s = String(t ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  return "";
}

function addOneHour(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h ?? 0, m ?? 0, 0);
  d.setHours(d.getHours() + 1);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return json({ error: guard.error }, guard.status);

    const body = (await req.json().catch(() => ({}))) as Body;

    const date = String(body.date ?? "").trim();
    const time = toHHMM(String(body.time ?? ""));
    const room_id = String(body.room_id ?? "").trim();
    const reason = body.reason ? String(body.reason).trim() : null;

    if (!date || !isYmd(date)) {
      return json({ error: "INVALID_DATE" }, 400);
    }
    if (!time) {
      return json({ error: "INVALID_TIME" }, 400);
    }
    if (!room_id) {
      return json({ error: "ROOM_REQUIRED" }, 400);
    }

    const end_time = addOneHour(time);

    // 룸 존재 확인
    const { data: room, error: roomErr } = await supabaseServer
      .from("practice_rooms")
      .select("id, name")
      .eq("id", room_id)
      .single();

    if (roomErr) return json({ error: roomErr.message }, 500);
    if (!room) return json({ error: "ROOM_NOT_FOUND" }, 404);

    // 같은 시간대 레슨 충돌 체크
    const { data: lessonHit, error: lessonErr } = await supabaseServer
      .from("lessons")
      .select("id")
      .eq("lesson_date", date)
      .eq("room_id", room_id)
      .eq("lesson_time", `${time}:00`)
      .neq("status", "canceled")
      .limit(1);

    if (lessonErr) return json({ error: lessonErr.message }, 500);
    if ((lessonHit ?? []).length > 0) {
      return json({ error: "CONFLICT_WITH_LESSON" }, 409);
    }

    // 같은 슬롯 예약/운영차단 충돌 체크
    const { data: practiceHit, error: practiceErr } = await supabaseServer
      .from("practice_reservations")
      .select("id, reservation_kind, status")
      .eq("date", date)
      .eq("room_id", room_id)
      .eq("start_time", time)
      .in("status", ["PENDING", "APPROVED"])
      .limit(1);

    if (practiceErr) return json({ error: practiceErr.message }, 500);
    if ((practiceHit ?? []).length > 0) {
      return json({ error: "SLOT_ALREADY_OCCUPIED" }, 409);
    }

    const { data, error } = await supabaseServer
      .from("practice_reservations")
      .insert({
        student_id: null,
        voucher_id: null,
        credit_source: null,
        credit_grant_id: null,

        room_id,
        date,
        start_time: time,
        end_time,
        status: "APPROVED",

        reservation_kind: "ADMIN_BLOCK",
        admin_block_reason: reason,
        created_by_admin: guard.adminUserId ?? null,
      })
      .select(
        `
        id,
        room_id,
        date,
        start_time,
        end_time,
        status,
        reservation_kind,
        admin_block_reason,
        created_by_admin
        `
      )
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, row: data });
  } catch (e: any) {
    return json({ error: e?.message ?? "SERVER_ERROR" }, 500);
  }
}