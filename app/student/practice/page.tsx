"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import StudentTopNav from "@/components/student/StudentTopNav";

/* ==========================
   운영시간 설정 (여기만 수정)
   start 포함, end 미포함
========================== */
const BUSINESS_HOURS = {
  weekday: { start: 13, end: 23 },
  weekend: { start: 12, end: 21 },
};

const ROOMS = ["A", "B", "C"] as const;
const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function clampHHMM(t: string) {
  return String(t ?? "").slice(0, 5);
}
function normalizeRoom(name: string | null | undefined) {
  const s = String(name ?? "").toUpperCase();
  if (s === "A" || s.includes("A")) return "A";
  if (s === "B" || s.includes("B")) return "B";
  if (s === "C" || s.includes("C")) return "C";
  return "A";
}

function mapPracticeError(code: string) {
  if (!code) return "예약에 실패했습니다.";

  if (code.includes("NO_VOUCHER")) {
    return "현재 사용 가능한 연습실 이용권이 없습니다. 추가 이용권이 필요하시면 카카오톡 채널로 문의해 주세요.";
  }
  if (code.includes("DAILY_LIMIT_EXCEEDED")) {
    return "하루 최대 2시간까지만 예약할 수 있어요.";
  }
  if (code.includes("SLOT_ALREADY_RESERVED")) {
    return "이미 예약된 시간입니다.";
  }
  if (code.includes("CONFLICT_WITH_LESSON")) {
    return "해당 시간에는 수업이 있어 예약할 수 없습니다.";
  }
  if (code.includes("CANCEL_DEADLINE_PASSED")) {
    return "취소 가능 기간이 지나 취소할 수 없습니다.";
  }

  return "예약 처리 중 오류가 발생했습니다.";
}

/** ✅ 48시간 전부터 취소 불가 (KST 기준 안내용: 서버가 최종 판단) */
function canCancelBy48Hours(dateStr: string, startHHMM: string) {
  const d = parseYmd(dateStr);
  const [hh, mm] = String(startHHMM ?? "00:00").split(":").map(Number);
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);

  const deadline = new Date(d.getTime() - 48 * 60 * 60 * 1000);
  return new Date() < deadline;
}

type ToastKind = "ok" | "warn" | "err";

type ReservationRow = {
  id: string;
  student_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string; // PENDING/APPROVED/REJECTED/CANCELED/COMPLETED
  room_name?: string | null;
  rejected_reason?: string | null;
  approved_at?: string | null;
};

function isActiveReservationStatus(status: string) {
  const s = String(status ?? "").toUpperCase();
  return s === "PENDING" || s === "APPROVED";
}
function isCanceledStatus(status: string) {
  return String(status ?? "").toUpperCase() === "CANCELED";
}
function isRejectedStatus(status: string) {
  return String(status ?? "").toUpperCase() === "REJECTED";
}
function statusBadge(status: string) {
  const s = String(status ?? "").toUpperCase();
  if (s === "PENDING") return { label: "승인 대기", bg: "#f59e0b", fg: "#111" };
  if (s === "APPROVED") return { label: "예약 확정", bg: "#22c55e", fg: "#111" };
  if (s === "REJECTED") return { label: "거절됨", bg: "#ef4444", fg: "#fff" };
  if (s === "CANCELED") return { label: "취소됨", bg: "#e5e7eb", fg: "#111" };
  if (s === "COMPLETED") return { label: "완료", bg: "#e5e7eb", fg: "#111" };
  return { label: s, bg: "#e5e7eb", fg: "#111" };
}

type VoucherSummary = {
  today?: string;
  remaining_hours: number;
  usable_until: string | null;
  usable_from?: string | null;
  has_voucher?: boolean;
  active_voucher_ids?: string[];
};

function inRangeDate(d: string, from?: string | null, to?: string | null) {
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export default function PracticeStudentPage() {
  const [weekStart, setWeekStart] = useState(() => ymd(startOfWeek(new Date())));
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));
  const [selectedRoom, setSelectedRoom] = useState<(typeof ROOMS)[number]>("A");

  const [rooms, setRooms] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [myVoucherReservations, setMyVoucherReservations] = useState<ReservationRow[]>([]);

  const [listVisibleCount, setListVisibleCount] = useState(10);

  const [me, setMe] = useState<string>("");
  const [pickedTimes, setPickedTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [voucherSummary, setVoucherSummary] = useState<VoucherSummary | null>(null);
  const [policy, setPolicy] = useState<{ daily_limit_hours: number } | null>(null);

  const reservationListRef = useRef<HTMLDivElement | null>(null);

  const [toast, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const showToast = useCallback((msg: string, kind: ToastKind = "ok") => {
    setToast({ msg, kind });
    // @ts-ignore
    if (window.__practiceToastTimer) window.clearTimeout(window.__practiceToastTimer);
    // @ts-ignore
    window.__practiceToastTimer = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const weekDays = useMemo(() => {
    const ws = parseYmd(weekStart);
    return Array.from({ length: 7 }).map((_, i) => addDays(ws, i));
  }, [weekStart]);

  const weekFrom = useMemo(() => ymd(weekDays[0]), [weekDays]);
  const weekTo = useMemo(() => ymd(weekDays[6]), [weekDays]);

  const voucherFrom = useMemo(() => voucherSummary?.usable_from ?? null, [voucherSummary]);
  const voucherTo = useMemo(() => voucherSummary?.usable_until ?? null, [voucherSummary]);

  const isUpcomingVoucher = useMemo(() => {
    const t = voucherSummary?.today;
    const vf = voucherSummary?.usable_from ?? null;
    if (!t || !vf) return false;
    return t < vf;
  }, [voucherSummary]);

  const hasVoucher = useMemo(() => {
    if (typeof voucherSummary?.has_voucher === "boolean") {
      return voucherSummary.has_voucher;
    }
    return !!(voucherSummary?.usable_from || voucherSummary?.usable_until);
  }, [voucherSummary]);
  
  const isVoucherEmpty = useMemo(() => {
    return hasVoucher && (voucherSummary?.remaining_hours ?? 0) <= 0;
  }, [hasVoucher, voucherSummary]);
  
  const canReserveByVoucher = useMemo(() => {
    return !isVoucherEmpty;
  }, [isVoucherEmpty]);

  useEffect(() => {
    const sd = parseYmd(selectedDate);
    const ws = parseYmd(weekFrom);
    const we = parseYmd(weekTo);
    if (sd < ws || sd > we) {
      setSelectedDate(weekFrom);
      setPickedTimes([]);
    }
  }, [selectedDate, weekFrom, weekTo]);

  function getSlots(date: Date) {
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const cfg = isWeekend ? BUSINESS_HOURS.weekend : BUSINESS_HOURS.weekday;
    const arr: string[] = [];
    for (let h = cfg.start; h < cfg.end; h++) arr.push(`${pad(h)}:00`);
    return arr;
  }

  const loadWeek = useCallback(async () => {
    const res = await authFetch(`/api/student/practice/schedule?from=${weekFrom}&to=${weekTo}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      showToast(json.error ?? "연습실 스케줄 조회 실패", "err");
      setRooms([]);
      setLessons([]);
      setReservations([]);
      setMyVoucherReservations([]);
      setMe("");
      setVoucherSummary(null);
      setPolicy(null);
      return { ok: false as const };
    }

    setRooms(json.rooms ?? []);
    setLessons(json.lessons ?? []);
    setReservations((json.reservations ?? []) as ReservationRow[]);
    setMyVoucherReservations((json.my_reservations_in_voucher ?? []) as ReservationRow[]);
    setMe(String(json?.me?.student_id ?? ""));
    setVoucherSummary((json.voucher_summary ?? null) as VoucherSummary | null);
    setPolicy(json.policy ?? null);
    setListVisibleCount(10);

    console.log("json.my_reservations_in_voucher", json.my_reservations_in_voucher);
console.log("json.voucher_summary", json.voucher_summary);

    return { ok: true as const };
  }, [weekFrom, weekTo, showToast]);

  const load = useCallback(async () => {
    setLoading(true);
    await loadWeek();
    setLoading(false);
  }, [loadWeek]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => load(), 10000);
    return () => window.clearInterval(t);
  }, [load]);

  const myActiveCountToday = useMemo(() => {
    return reservations.filter(
      (r) => r.student_id === me && r.date === selectedDate && isActiveReservationStatus(r.status)
    ).length;
  }, [reservations, me, selectedDate]);

  function slotStatus(dateStr: string, time: string, room: string) {
    const lessonBlock = lessons.some(
      (l) =>
        l.lesson_date === dateStr &&
        clampHHMM(l.lesson_time) === time &&
        normalizeRoom(l.room_name) === room &&
        String(l.status).toLowerCase() !== "canceled"
    );
    if (lessonBlock) return { kind: "lesson" as const };

    const resv = reservations.find(
      (r) =>
        r.date === dateStr &&
        clampHHMM(r.start_time) === time &&
        normalizeRoom(r.room_name) === room &&
        isActiveReservationStatus(r.status)
    );

    if (resv) {
      if (resv.student_id === me) return { kind: "mine" as const, resv };
      return { kind: "occupied" as const };
    }

    return { kind: "free" as const };
  }

  const togglePick = (t: string) => {
    const st = slotStatus(selectedDate, t, selectedRoom);
    if (st.kind !== "free") return;

    if (!inRangeDate(selectedDate, voucherFrom, voucherTo)) {
      showToast("수강권(무료 제공 기간) 범위 밖의 날짜는 예약할 수 없어요.", "warn");
      return;
    }

    if (isVoucherEmpty) {
      showToast("무료 제공된 연습실 이용 시간이 모두 사용되었습니다. 추가 이용권은 카카오톡 채널로 문의해 주세요.", "warn");
      return;
    }

    const exists = pickedTimes.includes(t);
    const next = exists ? pickedTimes.filter((x) => x !== t) : [...pickedTimes, t];

    const totalIfApply = myActiveCountToday + next.length;
    if (!exists && totalIfApply > 2) {
      showToast("하루 최대 2시간(연속/비연속)만 예약할 수 있어요.", "warn");
      return;
    }

    setPickedTimes(next.sort());
  };

  async function reserve() {
    if (pickedTimes.length === 0) return;

    if (!inRangeDate(selectedDate, voucherFrom, voucherTo)) {
      showToast("수강권(무료 제공 기간) 범위 밖의 날짜는 예약할 수 없어요.", "warn");
      return;
    }

    if (isVoucherEmpty) {
      showToast("무료 제공된 연습실 이용 시간이 모두 사용되었습니다. 추가 이용권은 카카오톡 채널로 문의해 주세요.", "warn");
      return;
    }

    const roomObj = rooms.find((r) => normalizeRoom(r.name) === selectedRoom);
    if (!roomObj) {
      showToast("룸 정보를 찾을 수 없어요.", "err");
      return;
    }

    const res = await authFetch("/api/student/practice/reservations", {
      method: "POST",
      body: JSON.stringify({
        room_id: roomObj.id,
        date: selectedDate,
        times: pickedTimes,
        device_type: "controller",
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(mapPracticeError(String(data.error ?? "")), "err");
      return;
    }

    showToast("신청 완료! 관리자 승인 후 확정됩니다.", "ok");
    setPickedTimes([]);
    await load();

    setTimeout(() => {
      reservationListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  async function cancel(id: string, dateStr: string, startHHMM: string) {
    const canCancel = canCancelBy48Hours(dateStr, startHHMM);
    if (!canCancel) {
      showToast("48시간 전부터는 취소할 수 없습니다.", "warn");
      return;
    }

    const ok = confirm("예약을 취소할까요?");
    if (!ok) return;

    const res = await authFetch(`/api/student/practice/reservations/${id}/cancel`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      showToast(String(json.message ?? json.error ?? "취소 실패"), "err");
      return;
    }

    showToast("취소되었습니다.", "ok");
    await load();
  }

  const goPrevWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(ymd(startOfWeek(d)));
    setPickedTimes([]);
  };

  const goNextWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(ymd(startOfWeek(d)));
    setPickedTimes([]);
  };

  const goThisWeek = () => {
    setWeekStart(ymd(startOfWeek(new Date())));
    setSelectedDate(ymd(new Date()));
    setPickedTimes([]);
  };

  const sortedVoucherReservations = useMemo(() => {
    return [...myVoucherReservations].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.start_time.localeCompare(b.start_time);
    });
  }, [myVoucherReservations]);

  const visibleVoucherReservations = useMemo(() => {
    return sortedVoucherReservations.slice(0, listVisibleCount);
  }, [sortedVoucherReservations, listVisibleCount]);

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: 16,
        background: "#f6f7f9",
        minHeight: "100vh",
      }}
    >
      <StudentTopNav />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 1000, fontSize: 20, color: "#111" }}>연습실 예약</div>
        <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 900, color: "#111" }}>
          {loading ? "로딩중..." : `오늘 내 예약 ${myActiveCountToday}/2`}
        </div>
      </div>

      {/* 예약 내역 상단 */}
      <div ref={reservationListRef} style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 1100, fontSize: 16, color: "#111", marginBottom: 10 }}>
          📌 현재 수강권 예약 내역 {voucherTo ? "" : ""}
        </div>

        <div
          style={{
            border: "1px solid #d7dbe0",
            borderRadius: 14,
            background: "#fff",
            padding: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 1000, color: "#111" }}>
              기간:{" "}
              <b>
                {voucherFrom && voucherTo ? `${voucherFrom} ~ ${voucherTo}` : voucherTo ? `~ ${voucherTo}` : "수강권 없음"}
              </b>
            </div>

            <button onClick={load} style={btnPrimary()} disabled={loading}>
              새로고침
            </button>
          </div>

          {sortedVoucherReservations.length === 0 ? (
            <div
              style={{
                marginTop: 10,
                padding: 14,
                borderRadius: 12,
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
                color: "#111",
                fontWeight: 900,
              }}
            >
              예약 내역이 없어요 🙂
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {visibleVoucherReservations.map((r) => {
                  const badge = statusBadge(r.status);
                  const active = isActiveReservationStatus(r.status);
                  const canceled = isCanceledStatus(r.status);
                  const rejected = isRejectedStatus(r.status);
                  const canCancel = active && canCancelBy48Hours(r.date, clampHHMM(r.start_time));

                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        border: "1px solid #d7dbe0",
                        background: canceled || rejected ? "#fff" : "#111",
                        color: canceled || rejected ? "#111" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 1100, color: canceled || rejected ? "#111" : "#fff" }}>
                            {r.date} {clampHHMM(r.start_time)}
                            {r.room_name ? (
                              <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.9 }}>
                                · {normalizeRoom(r.room_name)}홀
                              </span>
                            ) : null}
                          </div>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: badge.bg,
                              color: badge.fg,
                              fontWeight: 1100,
                              fontSize: 11,
                            }}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {rejected && r.rejected_reason ? (
                          <div style={{ fontSize: 12, fontWeight: 1000, marginTop: 6, color: "#ef4444" }}>
                            사유: {r.rejected_reason}
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 1000,
                              marginTop: 6,
                              color: canceled || rejected ? "#666" : "#eaeaea",
                            }}
                          >
                            {String(r.status).toUpperCase() === "PENDING"
                              ? "관리자 승인 후 확정됩니다."
                              : active
                              ? canCancel
                                ? "취소 가능(48시간 전까지)"
                                : "취소 마감(48시간 전)"
                              : "—"}
                          </div>
                        )}
                      </div>

                      {active ? (
                        <button
                          disabled={!canCancel}
                          onClick={() => cancel(r.id, r.date, clampHHMM(r.start_time))}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: active ? "1px solid rgba(255,255,255,0.35)" : "1px solid #ddd",
                            background: canCancel ? "#ff4d4f" : active ? "rgba(255,255,255,0.18)" : "#fff",
                            color: active ? "#fff" : "#111",
                            fontWeight: 1100,
                            cursor: canCancel ? "pointer" : "not-allowed",
                            opacity: canCancel ? 1 : 0.65,
                          }}
                          title={!canCancel ? "48시간 전부터는 취소할 수 없어요." : "예약 취소"}
                        >
                          취소
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 1100, color: canceled || rejected ? "#999" : "#fff" }}>
                          —
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {sortedVoucherReservations.length > listVisibleCount ? (
                <button
                  onClick={() => setListVisibleCount((n) => n + 10)}
                  style={{
                    ...btnGhost(),
                    width: "100%",
                    marginTop: 12,
                    padding: "12px 12px",
                    borderRadius: 14,
                    fontWeight: 1100,
                  }}
                >
                  더보기 ({listVisibleCount}/{sortedVoucherReservations.length})
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Voucher summary */}
      <div
        style={{
          marginTop: 12,
          border: "1px solid #d7dbe0",
          borderRadius: 14,
          background: "#fff",
          padding: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 1100, fontSize: 14, color: "#111" }}>연습실 이용권</div>
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #d7dbe0",
              background: !hasVoucher ? "#eef1f4" : isVoucherEmpty ? "#fff7ed" : "#111",
              color: !hasVoucher ? "#111" : isVoucherEmpty ? "#9a3412" : "#fff",
              fontWeight: 1100,
              fontSize: 12,
            }}
          >
            {!hasVoucher ? "이용권 없음" : isVoucherEmpty ? "전부 소진" : "사용 가능"}
          </span>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ color: "#111", fontWeight: 1000 }}>남은 시간</div>
            <div style={{ color: "#111", fontWeight: 1100 }}>{voucherSummary?.remaining_hours ?? 0}시간</div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ color: "#111", fontWeight: 1000 }}>무료 제공 기간</div>
            <div style={{ color: "#111", fontWeight: 1100 }}>
              {voucherSummary?.usable_from && voucherSummary?.usable_until
                ? `${voucherSummary.usable_from} ~ ${voucherSummary.usable_until}`
                : voucherSummary?.usable_until
                ? `~ ${voucherSummary.usable_until}`
                : "없음"}
            </div>
          </div>

          {isUpcomingVoucher && voucherSummary?.usable_from ? (
            <div style={{ fontSize: 12, fontWeight: 1100, color: "#f97316" }}>
              ※ {voucherSummary.usable_from}부터 사용 가능합니다. (미리 신청은 가능 / 승인 후 확정)
            </div>
          ) : null}
        </div>
      </div>

      {/* Week controls */}
      <div
        style={{
          marginTop: 12,
          border: "1px solid #d7dbe0",
          borderRadius: 14,
          background: "#fff",
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button onClick={goPrevWeek} style={btnGhost()}>
          ◀
        </button>
        <div style={{ fontWeight: 1000, fontSize: 13, color: "#111" }}>
          {weekFrom} ~ {weekTo}
        </div>
        <button onClick={goNextWeek} style={btnGhost()}>
          ▶
        </button>

        <button onClick={goThisWeek} style={{ ...btnGhost(), marginLeft: "auto" }}>
          이번주
        </button>

        <button onClick={load} style={btnPrimary()}>
          새로고침
        </button>
      </div>

      {/* Date selector */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 1000, color: "#111", marginBottom: 8 }}>날짜 선택</div>

        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
          {weekDays.map((d) => {
            const dateStr = ymd(d);
            const isSel = selectedDate === dateStr;
            const isToday = dateStr === ymd(new Date());

            const outOfVoucher = !inRangeDate(dateStr, voucherFrom, voucherTo);
            const opacity = outOfVoucher ? 0.55 : 1;

            return (
              <button
                key={dateStr}
                onClick={() => {
                  if (outOfVoucher) {
                    showToast("수강권 기간 밖의 날짜입니다.", "warn");
                    return;
                  }
                  setSelectedDate(dateStr);
                  setPickedTimes([]);
                }}
                style={{
                  minWidth: 92,
                  padding: "10px 10px",
                  borderRadius: 14,
                  border: isSel ? "2px solid #111" : "1px solid #d7dbe0",
                  background: isSel ? "#111" : "#fff",
                  color: isSel ? "#fff" : "#111",
                  fontWeight: 1000,
                  cursor: outOfVoucher ? "not-allowed" : "pointer",
                  textAlign: "left",
                  opacity,
                }}
                title={outOfVoucher ? "수강권(무료 제공 기간) 밖의 날짜입니다." : dateStr}
              >
                <div style={{ fontSize: 12, fontWeight: 1000, color: isSel ? "#fff" : "#111", opacity: isSel ? 1 : 0.85 }}>
                  {DOW[d.getDay()]} {isToday ? "· 오늘" : ""}
                </div>
                <div style={{ fontSize: 15, fontWeight: 1000, marginTop: 2 }}>
                  {d.getMonth() + 1}/{d.getDate()}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Room tabs */}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        {ROOMS.map((r) => {
          const isSel = selectedRoom === r;
          return (
            <button
              key={r}
              onClick={() => {
                setSelectedRoom(r);
                setPickedTimes([]);
              }}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 14,
                border: isSel ? "2px solid #111" : "1px solid #d7dbe0",
                background: isSel ? "#111" : "#fff",
                color: isSel ? "#fff" : "#111",
                fontWeight: 1000,
                cursor: "pointer",
              }}
            >
              {r}홀
            </button>
          );
        })}
      </div>

      {/* Time list */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 1000, color: "#111", marginBottom: 8 }}>
          시간 선택 (하루 최대 2시간 · 연속/비연속 가능)
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {getSlots(parseYmd(selectedDate)).map((t) => {
            const st = slotStatus(selectedDate, t, selectedRoom);
            const picked = pickedTimes.includes(t);

            if (st.kind === "mine" && String(st.resv.status).toUpperCase() === "APPROVED") {
              return null;
            }

            const baseCard: React.CSSProperties = {
              padding: 12,
              borderRadius: 16,
              border: "1px solid #d7dbe0",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            };

            if (st.kind === "lesson") {
              return (
                <div key={t} style={{ ...baseCard, background: "#f0f2f5", border: "2px dashed rgba(0,0,0,0.35)" }}>
                  <div style={{ fontWeight: 1000, color: "#111" }}>{t}</div>
                  <div style={{ fontSize: 12, fontWeight: 1000, color: "#111", opacity: 0.9 }}>예약 마감</div>
                </div>
              );
            }

            if (st.kind === "occupied") {
              return (
                <div key={t} style={{ ...baseCard, background: "#e9edf2" }}>
                  <div style={{ fontWeight: 1000, color: "#111" }}>{t}</div>
                  <div style={{ fontSize: 12, fontWeight: 1000, color: "#111", opacity: 0.9 }}>예약 마감</div>
                </div>
              );
            }

            if (st.kind === "mine") {
              const badge = statusBadge(st.resv.status);
              const canCancel = canCancelBy48Hours(st.resv.date, clampHHMM(st.resv.start_time));

              return (
                <div key={t} style={{ ...baseCard, background: "#111", border: "1px solid #111" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 1100, color: "#fff" }}>{t}</div>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: badge.bg,
                          color: badge.fg,
                          fontWeight: 1100,
                          fontSize: 11,
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {isRejectedStatus(st.resv.status) && st.resv.rejected_reason ? (
                      <div style={{ fontSize: 12, fontWeight: 1000, color: "#ffd5d5", marginTop: 6 }}>
                        사유: {st.resv.rejected_reason}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, fontWeight: 1000, color: "#eaeaea", marginTop: 6 }}>
                        {String(st.resv.status).toUpperCase() === "PENDING"
                          ? "관리자 승인 후 확정됩니다."
                          : canCancel
                          ? "취소 가능"
                          : "취소 마감(48시간 전)"}
                      </div>
                    )}
                  </div>

                  {isActiveReservationStatus(st.resv.status) ? (
                    <button
                      onClick={() => cancel(st.resv.id, st.resv.date, clampHHMM(st.resv.start_time))}
                      disabled={!canCancel}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.35)",
                        background: canCancel ? "#ff4d4f" : "rgba(255,255,255,0.18)",
                        color: "#fff",
                        fontWeight: 1000,
                        cursor: canCancel ? "pointer" : "not-allowed",
                        opacity: canCancel ? 1 : 0.6,
                      }}
                      title={!canCancel ? "48시간 전부터는 취소할 수 없어요." : "예약 취소"}
                    >
                      취소
                    </button>
                  ) : null}
                </div>
              );
            }

            return (
              <button
                key={t}
                onClick={() => togglePick(t)}
                style={{
                  ...baseCard,
                  cursor: "pointer",
                  border: picked ? "2px solid #111" : baseCard.border,
                  background: picked ? "#f3f5f7" : "#fff",
                }}
                title="눌러서 선택"
              >
                <div style={{ fontWeight: 1100, color: "#111" }}>{t}</div>
                <div style={{ fontSize: 12, fontWeight: 1000, color: "#111", opacity: 0.85 }}>
                  {picked ? "선택됨" : "예약 가능"}
                </div>
              </button>
            );
          })}
        </div>

        {pickedTimes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 1000, color: "#111", marginBottom: 8 }}>
              선택: <b style={{ color: "#111" }}>{pickedTimes.join(", ")}</b> (총 {pickedTimes.length}시간)
            </div>
            <button onClick={reserve} style={{ ...btnPrimary(), width: "100%", padding: "14px 12px", borderRadius: 16 }}>
              신청하기 (관리자 승인 후 확정)
            </button>
          </div>
        )}
      </div>

      <div style={{ height: 30 }} />

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 18,
            transform: "translateX(-50%)",
            width: "min(520px, calc(100vw - 24px))",
            background: toast.kind === "ok" ? "#111" : toast.kind === "warn" ? "#f59e0b" : "#ef4444",
            color: "#fff",
            padding: "12px 14px",
            borderRadius: 14,
            fontWeight: 1100,
            boxShadow: "0 16px 36px rgba(0,0,0,0.22)",
            zIndex: 9999,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function btnGhost(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d7dbe0",
    background: "#fff",
    color: "#111",
    fontWeight: 1000,
    cursor: "pointer",
  };
}

function btnPrimary(): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    fontWeight: 1100,
    cursor: "pointer",
  };
}