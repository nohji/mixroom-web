"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";

type PracticeCreditSummaryRow = {
  student_id: string;
  student_name: string;
  included_total_hours: number;
  included_used_hours: number;
  included_remaining_hours: number;
  extra_free_hours: number;
  paid_hours: number;
  total_remaining_hours: number;
};

type GrantType = "ADMIN_ADD" | "PURCHASE";

function formatHours(hours: number | null | undefined) {
  const n = Number(hours ?? 0);
  if (!Number.isFinite(n)) return "0시간";

  const safe = Math.max(0, n);
  const rounded = Math.round(safe * 100) / 100;

  if (Number.isInteger(rounded)) {
    return `${rounded}시간`;
  }

  return `${rounded}시간`;
}

function formatUsedOverTotal(used: number | null | undefined, total: number | null | undefined) {
  return `${formatHours(used)} / ${formatHours(total)}`;
}

export default function AdminPracticeCreditsPage() {
  const [rows, setRows] = useState<PracticeCreditSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedStudentName, setSelectedStudentName] = useState("");

  const [grantType, setGrantType] = useState<GrantType>("ADMIN_ADD");
  const [hours, setHours] = useState("");
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
      return name.includes(keyword);
    });
  }, [rows, q]);

  const openGrantModal = (row: PracticeCreditSummaryRow, type: GrantType) => {
    setSelectedStudentId(row.student_id);
    setSelectedStudentName(row.student_name);
    setGrantType(type);
    setHours("");
    setMemo("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const saveGrant = async () => {
    if (!selectedStudentId) {
      alert("학생 정보가 없어요.");
      return;
    }

    const n = Number(hours);
    if (!Number.isFinite(n) || n <= 0) {
      alert("추가할 시간을 시간 단위로 입력해줘.");
      return;
    }

    setSaving(true);

    const res = await authFetch("/api/admin/practice-credits/grant", {
      method: "POST",
      body: JSON.stringify({
        student_id: selectedStudentId,
        grant_type: grantType,
        hours: n,
        memo: memo || null,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(json.error ?? "연습실 사용권 추가 실패");
      setSaving(false);
      return;
    }

    alert("연습실 사용권이 추가되었어요.");
    setModalOpen(false);
    setSaving(false);
    await load();
  };

  return (
    <AdminLayoutShell title="연습실 사용권 관리">
      <div style={{ width: "100%", maxWidth: 1280, minWidth: 0 }}>
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
          <div style={{ fontWeight: 900 }}>학생별 연습실 사용권</div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="학생 이름 검색"
            style={{
              minWidth: 220,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              fontWeight: 700,
            }}
          />

          <button
            onClick={load}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            새로고침
          </button>

          <div style={{ marginLeft: "auto", color: "#666", fontSize: 13 }}>
            {loading ? "불러오는 중..." : `${filteredRows.length}명`}
          </div>

          <div style={{ width: "100%", color: "#666", fontSize: 12, fontWeight: 700 }}>
            무료 예약시간은 승인된 연습실 예약만 기준으로 표시돼요. (예: 2시간 / 4시간)
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
                minWidth: 1100,
              }}
            >
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={thStyle}>학생명</th>
                  <th style={thStyle}>무료 예약시간</th>
                  <th style={thStyle}>무료 잔여</th>
                  <th style={thStyle}>추가 무료</th>
                  <th style={thStyle}>유료</th>
                  <th style={thStyle}>총 잔여</th>
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
                      표시할 학생이 없어요.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    return (
                      <tr key={row.student_id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 900, color: "#111" }}>{row.student_name}</div>
                        </td>

                        <td style={tdStyle}>
                          <b>
                            {formatUsedOverTotal(
                              row.included_used_hours,
                              row.included_total_hours
                            )}
                          </b>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatHours(row.included_remaining_hours)}</b>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatHours(row.extra_free_hours)}</b>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatHours(row.paid_hours)}</b>
                        </td>

                        <td style={tdStyle}>
                          <b>{formatHours(row.total_remaining_hours)}</b>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              onClick={() => openGrantModal(row, "ADMIN_ADD")}
                              style={secondaryBtnStyle}
                            >
                              추가 무료시간
                            </button>

                            <button
                              onClick={() => openGrantModal(row, "PURCHASE")}
                              style={primaryBtnStyle}
                            >
                              유료시간 추가
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
              width: "min(520px, 96vw)",
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
                {grantType === "ADMIN_ADD" ? "추가 무료시간" : "유료시간 추가"}
              </div>

              <button
                onClick={closeModal}
                disabled={saving}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
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
                }}
              >
                대상 학생: <b>{selectedStudentName}</b>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={labelStyle}>유형</div>
                <select
                  value={grantType}
                  onChange={(e) => setGrantType(e.target.value as GrantType)}
                  disabled={saving}
                  style={inputStyle}
                >
                  <option value="ADMIN_ADD">추가 무료시간</option>
                  <option value="PURCHASE">유료시간 추가</option>
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={labelStyle}>추가 시간(시간)</div>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  disabled={saving}
                  placeholder="예: 1"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={labelStyle}>메모</div>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  disabled={saving}
                  placeholder="예: 이벤트 보상 / 현장 결제 / 운영 보정"
                  style={inputStyle}
                />
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
                onClick={saveGrant}
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