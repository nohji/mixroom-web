import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

function hhmmss(t: string | null | undefined) {
  const s = String(t ?? "").trim();
  if (!s) return "";
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? "").trim().toUpperCase();
}

function normalizeReservationKind(v: string | null | undefined) {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "ADMIN_BLOCK" || s === "ADMIN-BLOCK" || s === "BLOCK") return "ADMIN_BLOCK";
  return "STUDENT";
}

function toWeekdayKst(dateStr: string) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.getDay();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const newRoomId = String(body?.room_id ?? "").trim();
    const reason = body?.reason ? String(body.reason).trim() : null;
    const force = body?.force === true;

    if (!newRoomId) {
      return NextResponse.json({ error: "room_id is required" }, { status: 400 });
    }

    const sb = supabaseServer;

    const { data: reservation, error: reservationErr } = await sb
      .from("practice_reservations")
      .select(`
        id,
        room_id,
        date,
        start_time,
        end_time,
        status,
        reservation_kind,
        student_id,
        admin_note
      `)
      .eq("id", id)
      .single();

    if (reservationErr || !reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    if (normalizeReservationKind(reservation.reservation_kind) === "ADMIN_BLOCK") {
      return NextResponse.json(
        { error: "운영 차단 건은 홀 변경할 수 없습니다." },
        { status: 400 }
      );
    }

    const statusNorm = normalizeStatus(reservation.status);
    if (!["PENDING", "APPROVED"].includes(statusNorm)) {
      return NextResponse.json(
        { error: `현재 상태(${reservation.status})에서는 홀 변경이 불가능합니다.` },
        { status: 400 }
      );
    }

    if (reservation.room_id === newRoomId) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    const { data: room, error: roomErr } = await sb
      .from("practice_rooms")
      .select("id, name")
      .eq("id", newRoomId)
      .single();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Target room not found" }, { status: 404 });
    }

    const date = String(reservation.date ?? "");
    const startTime = hhmmss(reservation.start_time);
    const endTime = hhmmss(reservation.end_time);

    if (!date || !startTime || !endTime) {
      return NextResponse.json(
        { error: "예약 시간 정보가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 0) 보호 슬롯 체크
    // room_id = null 이면 전체 보호
    // room_id = 특정홀 이면 해당 홀만 보호
    const weekday = toWeekdayKst(date);

    const { data: protectedSlots, error: protectedErr } = await sb
      .from("fixed_schedule_slots")
      .select(`
        id,
        room_id,
        weekday,
        lesson_time,
        hold_for_renewal,
        memo
      `)
      .eq("weekday", weekday)
      .eq("lesson_time", startTime)
      .eq("hold_for_renewal", true)
      .or(`room_id.is.null,room_id.eq.${newRoomId}`)
      .limit(10);

    if (protectedErr) {
      return NextResponse.json({ error: protectedErr.message }, { status: 500 });
    }

    if ((protectedSlots ?? []).length > 0 && !force) {
      return NextResponse.json(
        {
          error: "해당 시간/홀에는 보호된 고정 스케줄이 있습니다. 그래도 변경할지 확인해주세요.",
          code: "PROTECTED_FIXED_SLOT_CONFLICT",
          conflicts: protectedSlots,
        },
        { status: 409 }
      );
    }

    // 1) 같은 시간대 동일 홀에 다른 연습실 예약/운영차단 있는지 검사
    const { data: practiceConflicts, error: practiceConflictErr } = await sb
      .from("practice_reservations")
      .select(`
        id,
        room_id,
        date,
        start_time,
        end_time,
        status,
        reservation_kind
      `)
      .eq("date", date)
      .eq("room_id", newRoomId)
      .neq("id", id)
      .in("status", ["PENDING", "APPROVED"])
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .limit(10);

    if (practiceConflictErr) {
      return NextResponse.json({ error: practiceConflictErr.message }, { status: 500 });
    }

    if ((practiceConflicts ?? []).length > 0) {
      const hasAdminBlock = practiceConflicts.some(
        (row) => normalizeReservationKind(row.reservation_kind) === "ADMIN_BLOCK"
      );

      return NextResponse.json(
        {
          error: hasAdminBlock
            ? "해당 홀은 같은 시간에 운영 차단이 있습니다."
            : "해당 홀은 같은 시간에 이미 연습실 예약이 있습니다.",
        },
        { status: 409 }
      );
    }

    // 2) 같은 시간대 동일 홀에 레슨 있는지 검사
    const { data: lessons, error: lessonErr } = await sb
      .from("lessons")
      .select("id, lesson_date, lesson_time, room_id, status")
      .eq("lesson_date", date)
      .eq("room_id", newRoomId)
      .limit(50);

    if (lessonErr) {
      return NextResponse.json({ error: lessonErr.message }, { status: 500 });
    }

    const lessonConflict = (lessons ?? []).find((l) => {
      const lessonStatus = normalizeStatus(l.status);
      if (["CANCELED", "CANCELLED"].includes(lessonStatus)) return false;

      const lessonTime = hhmmss(l.lesson_time);
      if (!lessonTime) return false;

      return lessonTime < endTime && lessonTime >= startTime;
    });

    if (lessonConflict) {
      return NextResponse.json(
        { error: "해당 홀에 같은 시간 레슨이 있어 변경할 수 없습니다." },
        { status: 409 }
      );
    }

    const updatePayload: Record<string, any> = {
      room_id: newRoomId,
    };

    if (reason) {
      updatePayload.admin_note = reason;
    }

    const { data: updated, error: updateErr } = await sb
      .from("practice_reservations")
      .update(updatePayload)
      .eq("id", id)
      .select(`
        id,
        room_id,
        date,
        start_time,
        end_time,
        status,
        reservation_kind,
        student_id,
        admin_note
      `)
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reservation: updated,
      room,
      forced: force,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}