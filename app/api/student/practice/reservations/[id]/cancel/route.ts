import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/requireStudent";
import { supabaseServer } from "@/lib/supabaseServer";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStudent();
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  const { id } = await ctx.params;
  const reservationId = String(id ?? "").trim();
  if (!reservationId) return json({ error: "INVALID_ID" }, 400);

  // ✅ 1차 방어: 본인 예약인지 확인 (상태는 여기서 "reserved" 기준으로 막지 말 것)
  const { data: row, error: rErr } = await supabaseServer
    .from("practice_reservations")
    .select("id, student_id, status")
    .eq("id", reservationId)
    .single();

  if (rErr) return json({ error: rErr.message }, 500);
  if (!row) return json({ error: "NOT_FOUND" }, 404);

  if (String(row.student_id) !== guard.studentUserId) return json({ error: "FORBIDDEN" }, 403);

  const S = String(row.status ?? "").toUpperCase();

  // ✅ 멱등: 이미 취소면 성공 처리
  if (S === "CANCELED") {
    return json({ ok: true, already: true });
  }

  // ✅ 취소 가능한 상태는 PENDING/APPROVED만
  if (S !== "PENDING" && S !== "APPROVED") {
    return json({ error: "NOT_CANCELLABLE_STATUS" }, 400);
  }

  // ✅ DB에서 48시간 체크 + 취소 + 환불
  const { data, error } = await supabaseServer.rpc("practice_cancel_reservation", {
    p_reservation_id: reservationId,
    p_by_admin: false,
  });

  if (error) {
    // 예: CANCEL_DEADLINE_PASSED / NOT_CANCELLABLE_STATUS 등
    const msg = String(error.message ?? "");
    // 멱등 보강(혹시 DB에서 던지더라도)
    if (msg.includes("ALREADY_CANCELED")) return json({ ok: true, already: true });
    return json({ error: msg }, 400);
  }

  return json({ ok: true, reservation: data });
}