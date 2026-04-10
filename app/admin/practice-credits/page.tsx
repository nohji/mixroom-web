"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";

type PracticeCreditSummaryRow = {
  voucher_id: string;
  student_id: string;
  student_name: string;
  class_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  initial_hours: number;
  free_hours: number;
  paid_hours: number;
  remaining_hours: number;
  pending_hours: number;
};

type EditField = "initial" | "free" | "paid";

function formatHours(hours: number | null | undefined) {
  const n = Number(hours ?? 0);
  if (!Number.isFinite(n)) return "0시간";

  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}시간`;
  return `${rounded}시간`;
}

function formatDateRange(from?: string | null, to?: string | null) {
  const f = String(from ?? "").slice(0, 10);
  const t = String(to ?? "").slice(0, 10);

  if (f && t) return `${f} ~ ${t}`;
  if (f) return `${f} ~`;
  if (t) return `~ ${t}`;
  return "-";
}

function getFieldLabel(field: EditField) {
  switch (field) {
    case "initial":
      return "최초제공";
    case "free":
      return "무료";
    case "paid":
      return "유료";
    default:
      return "";
  }
}

export default function AdminPracticeCreditsPage() {
  const [rows, setRows] = useState<PracticeCreditSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedVoucherId, setSelectedVoucherId] = useState("");
  const [selectedStudentName, setSelectedStudentName] = useState("");
  const [selectedValidFrom, setSelectedValidFrom] = useState<string | null>(null);
  const [selectedValidUntil, setSelectedValidUntil] = useState<string | null>(null);

  const [editField, setEditField] = useState<EditField>("initial");
  const [currentHours, setCurrentHours] = useState(0);
  const [targetHours, setTargetHours] = useState("");
  const [memo, setMemo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    const res = await authFetch("/api/admin/practice-credits", {
      method: "GET",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(json.error ?? "연습실 사용권 목록 조회 실패");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json.rows ?? []) as PracticeCreditSummaryRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((r) => {
      const name = String(r.student_name ?? "").toLowerCase();
      const range = formatDateRange(r.valid_from, r.valid_until).toLowerCase();
      return name.includes(keyword) || range.includes(keyword);
    });
  }, [rows, q]);

  const openEditModal = (row: PracticeCreditSummaryRow, field: EditField) => {
    let current = 0;

    if (field === "initial") current = Number(row.initial_hours ?? 0);
    if (field === "free") current = Number(row.free_hours ?? 0);
    if (field === "paid") current = Number(row.paid_hours ?? 0);

    setSelectedVoucherId(row.voucher_id);
    setSelectedStudentName(row.student_name);
    setSelectedValidFrom(row.valid_from);
    setSelectedValidUntil(row.valid_until);
    setEditField(field);
    setCurrentHours(current);
    setTargetHours(String(current));
    setMemo("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const saveEdit = async () => {
    if (!selectedVoucherId) {
      alert("바우처 정보가 없어요.");
      return;
    }

    const n = Number(targetHours);
    if (!Number.isFinite(n) || n < 0) {
      alert("변경할 시간을 0 이상의 시간 단위로 입력해줘.");
      return;
    }

    setSaving(true);

    try {
      let res: Response;

      if (editField === "initial") {
        res = await authFetch("/api/admin/practice-credits/initial", {
          method: "PATCH",
          body: JSON.stringify({
            voucher_id: selectedVoucherId,
            target_hours: n,
            memo: memo || null,
          }),
        });
      } else if (editField === "free") {
        res = await authFetch("/api/admin/practice-credits/free-adjust", {
          method: "POST",
          body: JSON.stringify({
            voucher_id: selectedVoucherId,
            target_hours: n,
            memo: memo || null,
          }),
        });
      } else {
        res = await authFetch("/api/admin/practice-credits/paid-adjust", {
          method: "POST",
          body: JSON.stringify({
            voucher_id: selectedVoucherId,
            target_hours: n,
            memo: memo || null,
          }),
        });
      }

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(json.error ?? "연습실 사용권 수정 실패");
        setSaving(false);
        return;
      }

      alert(`${getFieldLabel(editField)} 시간이 수정되었어요.`);
      setModalOpen(false);
      setSaving(false);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "연습실 사용권 수정 실패");
      setSaving(false);
    }
  };

  return (
    <AdminLayoutShell title="연습실 사용권 관리">
      <div style={{ width: "100%", maxWidth: 1400, minWidth: 0 }}>
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
            padding: 12,
            marginBottom: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 900 }}>바우처별 연습실 사용권</div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="학생 이름 또는 사용기간 검색"
            style={{
              minWidth: 260,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              fontWeight: 700,
            }}
          />

          <button onClick={load} style={primaryBtnStyle}>
            새로고침
          </button>

          <div style={{ marginLeft: "auto", color: "#666", fontSize: 13 }}>
            {loading ? "불러오는 중..." : `${filteredRows.length}건`}
          </div>

          <div
            style={{
              width: "100%",
              color: "#666",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: "18px",
            }}
          >
            한 줄은 바우처 1개 기준이에요. 같은 학생도 수강권 기간이 다르면 여러 줄로 보여요.
            <br />
            무료/유료 추가 시간은 해당 바우처 기간 안에서만 소진되며, 잔여시간은 현재 바우처의 남은 시간(quantity) 기준이에요.
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 1250,
              }}
            >
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={thStyle}>학생명</th>
                  <th style={thStyle}>사용기간</th>
                  <th style={thStyle}>최초제공</th>
                  <th style={thStyle}>무료</th>
                  <th style={thStyle}>유료</th>
                  <th style={thStyle}>잔여시간</th>
                  <th style={thStyle}>승인대기</th>
                  <th style={thStyle}>관리</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={emptyStyle}>
                      불러오는 중...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={emptyStyle}>
                      표시할 바우처가 없어요.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    return (
                      <tr key={row.voucher_id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900, color: "#111" }}>
                            {row.student_name}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, color: "#777" }}>
                            voucher: {row.voucher_id.slice(0, 8)}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatDateRange(row.valid_from, row.valid_until)}</b>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatHours(row.initial_hours)}</b>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatHours(row.free_hours)}</b>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatHours(row.paid_hours)}</b>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatHours(row.remaining_hours)}</b>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatHours(row.pending_hours)}</b>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              onClick={() => openEditModal(row, "initial")}
                              style={secondaryBtnStyle}
                            >
                              최초제공 수정
                            </button>

                            <button
                              onClick={() => openEditModal(row, "free")}
                              style={secondaryBtnStyle}
                            >
                              무료 수정
                            </button>

                            <button
                              onClick={() => openEditModal(row, "paid")}
                              style={primaryBtnStyle}
                            >
                              유료 수정
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 96vw)",
              borderRadius: 14,
              background: "#fff",
              border: "1px solid #eee",
              padding: 14,
              boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 1000, fontSize: 16 }}>
                {getFieldLabel(editField)} 수정
              </div>

              <button
                onClick={closeModal}
                disabled={saving}
                style={secondaryBtnStyle}
              >
                닫기
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #eee",
                  background: "#fafafa",
                  fontSize: 14,
                  lineHeight: "20px",
                }}
              >
                대상 학생: <b>{selectedStudentName}</b>
                <br />
                사용기간: <b>{formatDateRange(selectedValidFrom, selectedValidUntil)}</b>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #eee",
                  background: "#fafafa",
                  fontSize: 14,
                  lineHeight: "20px",
                }}
              >
                현재 {getFieldLabel(editField)}: <b>{formatHours(currentHours)}</b>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={labelStyle}>변경할 시간(시간)</div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={targetHours}
                  onChange={(e) => setTargetHours(e.target.value)}
                  disabled={saving}
                  placeholder="예: 2"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={labelStyle}>메모</div>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  disabled={saving}
                  placeholder="예: 이벤트 혜택 조정 / 운영 보정 / 현장 수정"
                  style={inputStyle}
                />
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #f1f1f1",
                  background: "#fcfcfc",
                  fontSize: 12,
                  color: "#666",
                  lineHeight: "18px",
                }}
              >
                {editField === "initial"
                  ? "최초제공 수정은 해당 바우처의 기본 제공 시간을 직접 변경하며, 기존 사용량을 유지한 채 잔여시간도 함께 보정돼요."
                  : `${getFieldLabel(editField)} 수정은 해당 바우처에 귀속된 시간만 조정돼요.`}
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={closeModal}
                disabled={saving}
                style={secondaryBtnStyle}
              >
                취소
              </button>

              <button
                onClick={saveEdit}
                disabled={saving}
                style={primaryBtnStyle}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayoutShell>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #eee",
  color: "#666",
  fontSize: 13,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "14px 12px",
  borderBottom: "1px solid #f3f3f3",
  fontSize: 14,
  verticalAlign: "middle",
};

const emptyStyle: React.CSSProperties = {
  padding: "24px 12px",
  textAlign: "center",
  color: "#666",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  fontWeight: 900,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  fontWeight: 700,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  cursor: "pointer",
  fontWeight: 900,
};