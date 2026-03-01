"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { createBrowserClient } from "@supabase/ssr";

type Status = "PENDING" | "APPROVED" | "REJECTED";

type Row = {
  id: string;
  student_id: string;
  room_id: string;
  voucher_id: string | null;

  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  status: string; // CANCELED/COMPLETED도 있을 수 있어 string으로 둠

  created_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_reason: string | null;
  canceled_at: string | null;

  // ✅ view join columns
  student_name: string | null;
  room_name: string | null;
  approved_by_name: string | null;

  voucher_type: string | null;
  voucher_quantity: number | null;
  voucher_valid_until: string | null; // date
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
    )
      return;

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
    )
      return;

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

  const renderVoucherCell = (r: Row) => {
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
      <div style={{ maxWidth: 1400 }}>
        {/* Tabs */}
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
            padding: 12,
            marginBottom: 12,
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
              marginLeft: "auto",
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

          <div style={{ color: "#666", fontSize: 12, fontWeight: 900 }}>{subtitle}</div>
        </div>

        {/* Table */}
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, background: "#fff", overflow: "auto" }}>
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 14, color: "#666" }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
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
                        {renderVoucherCell(r)}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", color: "#666" }}>
                        {r.approved_at
                          ? `처리됨 (${String(r.approved_at).slice(0, 16).replace("T", " ")})`
                          : "-"}
                        {r.rejected_reason ? (
                          <div style={{ marginTop: 4, color: "#111" }}>사유: {r.rejected_reason}</div>
                        ) : null}
                        {(r.approved_by_name || r.approved_by) ? (
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
                              style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #111",
                                background: "#111",
                                color: "#fff",
                                cursor: isActing ? "not-allowed" : "pointer",
                                fontWeight: 1000,
                                opacity: isActing ? 0.6 : 1,
                              }}
                            >
                              승인
                            </button>

                            <button
                              disabled={isActing}
                              onClick={() => doReject(r)}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #ddd",
                                background: "#fff",
                                color: "#111",
                                cursor: isActing ? "not-allowed" : "pointer",
                                fontWeight: 1000,
                                opacity: isActing ? 0.6 : 1,
                              }}
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
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          * 승인(APPROVED)되면 확정 예약입니다. 거절(REJECTED) 시 바우처 홀드(차감)는 자동 복구됩니다.
        </div>
      </div>
    </AdminLayoutShell>
  );
}