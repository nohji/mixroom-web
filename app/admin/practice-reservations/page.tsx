"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { createBrowserClient } from "@supabase/ssr";
import { formatDateTimeKST } from "@/lib/datetime";

type Status = "PENDING" | "APPROVED" | "REJECTED";

type Row = {
  id: string;
  student_id: string;
  room_id: string;
  voucher_id: string | null;

  date: string;
  start_time: string;
  end_time: string;
  status: string;

  created_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_reason: string | null;
  canceled_at: string | null;

  student_name: string | null;
  room_name: string | null;
  approved_by_name: string | null;

  voucher_type: string | null;
  voucher_quantity: number | null;
  voucher_valid_until: string | null;
  voucher_source: string | null;
  voucher_class_id: string | null;
};

function formatDate(s: string) {
  return String(s ?? "").slice(0, 10);
}
function clampHHMM(t: string) {
  return String(t ?? "").slice(0, 5);
}

const TABS: { key: Status; label: string }[] = [
  { key: "PENDING", label: "대기(PENDING)" },
  { key: "APPROVED", label: "승인(APPROVED)" },
  { key: "REJECTED", label: "거절(REJECTED)" },
];

export default function AdminPracticeReservationsPage() {
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState<Status>("PENDING");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const load = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("admin_practice_reservations")
      .select("*")
      .eq("status", tab)
      .order("date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(300);

    if (error) {
      alert(error.message ?? "목록 조회 실패");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const doApprove = async (r: Row) => {
    if (
      !confirm(
        `이 연습실 신청을 APPROVE(승인) 할까요?\n\n${formatDate(r.date)} ${clampHHMM(r.start_time)}–${clampHHMM(
          r.end_time
        )}\n룸: ${r.room_name ?? r.room_id.slice(0, 6)}\n학생: ${r.student_name ?? r.student_id.slice(0, 6)}`
      )
    ) {
      return;
    }

    setActingId(r.id);
    const { error } = await supabase.rpc("admin_review_practice_reservation", {
      p_reservation_id: r.id,
      p_approve: true,
      p_reason: null,
    });
    setActingId(null);

    if (error) {
      alert(error.message ?? "approve 실패");
      return;
    }

    await load();
  };

  const doReject = async (r: Row) => {
    const note = prompt("거절 사유를 입력하세요.") ?? "";
    if (
      !confirm(
        `이 연습실 신청을 REJECT(거절) 할까요?\n\n${formatDate(r.date)} ${clampHHMM(r.start_time)}–${clampHHMM(
          r.end_time
        )}\n룸: ${r.room_name ?? r.room_id.slice(0, 6)}\n학생: ${r.student_name ?? r.student_id.slice(0, 6)}`
      )
    ) {
      return;
    }

    setActingId(r.id);
    const { error } = await supabase.rpc("admin_review_practice_reservation", {
      p_reservation_id: r.id,
      p_approve: false,
      p_reason: note || null,
    });
    setActingId(null);

    if (error) {
      alert(error.message ?? "reject 실패");
      return;
    }

    await load();
  };

  const subtitle = useMemo(() => {
    if (loading) return "불러오는 중...";
    return `총 ${rows.length}건`;
  }, [loading, rows.length]);

  const renderVoucherContent = (r: Row) => {
    if (!r.voucher_id) return "-";

    if (!r.voucher_type) return r.voucher_id.slice(0, 6);

    const meta = [
      r.voucher_quantity != null ? `잔여:${r.voucher_quantity}` : null,
      r.voucher_valid_until ? `만료:${formatDate(r.voucher_valid_until)}` : null,
      r.voucher_source ? `출처:${r.voucher_source}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <div>
        <div style={{ fontWeight: 1000 }}>{r.voucher_type}</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{meta || "-"}</div>
      </div>
    );
  };

  return (
    <AdminLayoutShell title="연습실 예약 승인 관리">
      <div style={{ width: "100%", maxWidth: 1400, minWidth: 0 }}>
        {/* Tabs */}
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
            padding: 12,
            marginBottom: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 1000 }}>연습실</div>

            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: active ? "1px solid #111" : "1px solid #ddd",
                    background: active ? "#111" : "#fff",
                    color: active ? "#fff" : "#111",
                    cursor: "pointer",
                    fontWeight: 1000,
                    fontSize: 12,
                  }}
                >
                  {t.label}
                </button>
              );
            })}

            <button
              onClick={load}
              style={{
                marginLeft: isMobile ? 0 : "auto",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 1000,
              }}
            >
              새로고침
            </button>
          </div>

          <div style={{ color: "#666", fontSize: 12, fontWeight: 900 }}>{subtitle}</div>
        </div>

        {loading ? (
          <div style={emptyWrapStyle}>불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div style={emptyWrapStyle}>데이터가 없습니다.</div>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((r) => {
              const isActing = actingId === r.id;
              const dt = `${formatDate(r.date)} ${clampHHMM(r.start_time)}–${clampHHMM(r.end_time)}`;

              return (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 14,
                    background: "#fff",
                    padding: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 1000, fontSize: 16, color: "#111" }}>연습실 예약 요청</div>
                      <div style={{ color: "#666", fontSize: 12, marginTop: 3 }}>
                        {r.created_at ? String(r.created_at).slice(0, 16).replace("T", " ") : "-"}
                      </div>
                    </div>

                    <StatusBadge status={r.status} />
                  </div>

                  <InfoGrid
                    items={[
                      { label: "일시", value: dt },
                      { label: "룸", value: r.room_name ?? r.room_id.slice(0, 6) },
                      { label: "학생", value: r.student_name ?? r.student_id.slice(0, 6) },
                      { label: "바우처", value: renderVoucherText(r) },
                    ]}
                  />

                  <div
                    style={{
                      border: "1px solid #f0f0f0",
                      borderRadius: 12,
                      padding: 10,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>처리 정보</div>
                    <div style={{ marginTop: 6, display: "grid", gap: 4, fontSize: 13, color: "#111" }}>
                      <div>
                      처리일: {formatDateTimeKST(r.approved_at)} 
                      </div>
                      <div>처리자: {r.approved_by_name ?? r.approved_by?.slice(0, 6) ?? "-"}</div>
                      <div>거절사유: {r.rejected_reason ?? "-"}</div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: r.status === "PENDING" ? "1fr 1fr" : "1fr",
                      gap: 8,
                    }}
                  >
                    {r.status === "PENDING" ? (
                      <>
                        <button
                          disabled={isActing}
                          onClick={() => doApprove(r)}
                          style={mobilePrimaryButton(isActing)}
                        >
                          승인
                        </button>

                        <button
                          disabled={isActing}
                          onClick={() => doReject(r)}
                          style={mobileGhostButton(isActing)}
                        >
                          거절
                        </button>
                      </>
                    ) : (
                      <div
                        style={{
                          textAlign: "center",
                          color: "#999",
                          fontSize: 13,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #eee",
                          background: "#fafafa",
                        }}
                      >
                        처리 완료
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              background: "#fff",
              overflow: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {["상태", "일자/시간", "룸", "학생", "바우처", "처리정보", "액션"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "10px 10px",
                        borderBottom: "1px solid #eee",
                        color: "#111",
                        fontWeight: 1000,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => {
                  const isActing = actingId === r.id;
                  const dt = `${formatDate(r.date)} ${clampHHMM(r.start_time)}–${clampHHMM(r.end_time)}`;

                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", fontWeight: 1000 }}>
                        {r.status}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                        {dt}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                        {r.room_name ?? r.room_id.slice(0, 6)}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                        {r.student_name ?? r.student_id.slice(0, 6)}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2" }}>
                        {renderVoucherContent(r)}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", color: "#666" }}>
                        {r.approved_at
                        ? `처리됨 (${formatDateTimeKST(r.approved_at)})`
                        : "-"}    
                        {r.rejected_reason ? (
                          <div style={{ marginTop: 4, color: "#111" }}>사유: {r.rejected_reason}</div>
                        ) : null}
                        {r.approved_by_name || r.approved_by ? (
                          <div style={{ marginTop: 4, color: "#111" }}>
                            처리자: {r.approved_by_name ?? r.approved_by?.slice(0, 6)}
                          </div>
                        ) : null}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                        {r.status === "PENDING" ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              disabled={isActing}
                              onClick={() => doApprove(r)}
                              style={btnPrimary(isActing)}
                            >
                              승인
                            </button>

                            <button
                              disabled={isActing}
                              onClick={() => doReject(r)}
                              style={btnGhost(isActing)}
                            >
                              거절
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "#999" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 12, color: "#666", lineHeight: 1.6 }}>
          * 승인(APPROVED)되면 확정 예약입니다. 거절(REJECTED) 시 바우처 홀드(차감)는 자동 복구됩니다.
        </div>
      </div>
    </AdminLayoutShell>
  );
}

/* ===== helpers ===== */

function renderVoucherText(r: Row) {
  if (!r.voucher_id) return "-";
  if (!r.voucher_type) return r.voucher_id.slice(0, 6);

  const meta = [
    r.voucher_quantity != null ? `잔여:${r.voucher_quantity}` : null,
    r.voucher_valid_until ? `만료:${formatDate(r.voucher_valid_until)}` : null,
    r.voucher_source ? `출처:${r.voucher_source}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return [r.voucher_type, meta].filter(Boolean).join(" / ");
}

function InfoGrid({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 8,
      }}
    >
      {items.map((item, idx) => (
        <div
          key={`${item.label}-${idx}`}
          style={{
            border: "1px solid #f0f0f0",
            borderRadius: 10,
            padding: 10,
            background: "#fafafa",
          }}
        >
          <div style={{ fontSize: 11, color: "#666", fontWeight: 800 }}>{item.label}</div>
          <div
            style={{
              marginTop: 4,
              fontSize: 13,
              color: "#111",
              fontWeight: 900,
              lineHeight: 1.45,
              wordBreak: "break-word",
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = String(status).toUpperCase();

  const style =
    s === "APPROVED"
      ? {
          background: "#ecfdf3",
          color: "#027a48",
          border: "1px solid #abefc6",
        }
      : s === "REJECTED"
      ? {
          background: "#fff1f3",
          color: "#c01048",
          border: "1px solid #fbcfe8",
        }
      : {
          background: "#fff7ed",
          color: "#b54708",
          border: "1px solid #fed7aa",
        };

  return (
    <span
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 1000,
      }}
    >
      {s}
    </span>
  );
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 1000,
    opacity: disabled ? 0.6 : 1,
  };
}

function btnGhost(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    color: "#111",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 1000,
    opacity: disabled ? 0.6 : 1,
  };
}

function mobilePrimaryButton(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 1000,
    opacity: disabled ? 0.6 : 1,
    width: "100%",
    justifyContent: "center",
  };
}

function mobileGhostButton(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    color: "#111",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 1000,
    opacity: disabled ? 0.6 : 1,
    width: "100%",
    justifyContent: "center",
  };
}

const emptyWrapStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  background: "#fff",
  padding: 20,
  color: "#666",
};