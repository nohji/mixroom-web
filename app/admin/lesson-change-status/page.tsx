"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";

type Row = {
  id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  from_date: string;
  from_time: string;
  to_date: string;
  to_time: string;
  handled_by_role: string | null;
  handled_at: string | null;
  admin_checked_at: string | null;

  // lesson join (API에서 내려주는 형태에 맞춰 유연하게 처리)
  lesson?: any;
};

type Summary = {
  pending: number;
  tomorrowPending: number;
  handledToday: number;
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// “오늘 생성된 pending + 아직 처리 안됨”을 18시 기준으로 강조할 때 사용
function isOverduePending(r: Row) {
  if (r.status !== "pending") return false;

  const now = new Date();
  const hh = now.getHours();
  // 18시 이후면 overdue로 표시 (원하면 17시/19시로 바꿔도 됨)
  if (hh < 18) return false;

  const today = ymd(now);
  return (r.created_at ?? "").startsWith(today);
}

export default function AdminLessonChangeStatusPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await authFetch("/api/admin/lesson-change-status");
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error ?? "현황 조회 실패");
      setRows([]);
      setSummary(null);
    } else {
      setRows((data.rows ?? []) as Row[]);
      setSummary((data.summary ?? null) as Summary | null);
    }

    setLoading(false);
  };

  const adminApprove = async (requestId: string) => {
    const res = await authFetch("/api/admin/approve-lesson-change", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error ?? "관리자 승인 실패");
    alert("관리자 승인 완료!");
    await load();
  };

  const adminReject = async (requestId: string) => {
    const reason = prompt("거절 사유(선택)") ?? undefined;

    const res = await authFetch("/api/admin/reject-lesson-change", {
      method: "POST",
      body: JSON.stringify({ requestId, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error ?? "관리자 거절 실패");
    alert("관리자 거절 완료!");
    await load();
  };

  const markChecked = async (requestId: string) => {
    const res = await authFetch("/api/admin/mark-lesson-change-checked", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error ?? "확인 처리 실패");
    await load();
  };

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    // pending 먼저, 그 다음 최신순
    const rank = (s: string) => (s === "pending" ? 0 : s === "approved" ? 1 : 2);
    return [...rows].sort((a, b) => {
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [rows]);

  return (
    <AdminLayoutShell title="레슨 변경 현황 (관리자 모니터링)">
      <div style={{ maxWidth: 1100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>레슨 변경 요청 현황</h3>
            <p style={{ margin: "6px 0 0 0", color: "#666" }}>
              * 강사 승인 시 레슨이 즉시 변경되며, 관리자는 미처리/예외 케이스만 개입합니다.
            </p>
          </div>
          <button onClick={load} style={{ padding: "8px 12px" }}>
            새로고침
          </button>
        </div>

        {summary && (
          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Badge label={`대기(pending): ${summary.pending}`} />
            <Badge label={`내일 레슨 pending: ${summary.tomorrowPending}`} />
            <Badge label={`오늘 처리됨: ${summary.handledToday}`} />
          </div>
        )}

        <hr style={{ margin: "18px 0" }} />

        {loading ? (
          <p>불러오는 중...</p>
        ) : sorted.length === 0 ? (
          <p>요청이 없습니다.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {sorted.map((r) => {
              const overdue = isOverduePending(r);

              // API join 구조가 배열일 수도 있어서 안전하게
              const lesson = Array.isArray((r as any).lesson) ? (r as any).lesson?.[0] : (r as any).lesson;
              const classRow = lesson?.class ? (Array.isArray(lesson.class) ? lesson.class?.[0] : lesson.class) : null;
              const studentRow = classRow?.student ? (Array.isArray(classRow.student) ? classRow.student?.[0] : classRow.student) : null;
              const studentName = studentRow?.name ?? "알 수 없음";

              return (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    background: overdue ? "#fff4f4" : "white",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>
                        {studentName} ·{" "}
                        <span style={{ color: r.status === "pending" ? "#b45309" : r.status === "approved" ? "#166534" : "#991b1b" }}>
                          {r.status}
                        </span>
                        {overdue && <span style={{ marginLeft: 8, color: "#b91c1c", fontWeight: 800 }}>(18시 미처리)</span>}
                      </div>

                      <div style={{ marginTop: 6 }}>
                        {r.from_date} {r.from_time} → <b>{r.to_date} {r.to_time}</b>
                      </div>

                      <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
                        created: {r.created_at}
                        {r.handled_at ? ` · handled: ${r.handled_at} (${r.handled_by_role ?? "?"})` : ""}
                        {r.admin_checked_at ? ` · checked: ${r.admin_checked_at}` : ""}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                      {/* pending이면 관리자 개입 가능 */}
                      {r.status === "pending" && (
                        <>
                          <button onClick={() => adminApprove(r.id)} style={{ padding: "8px 10px" }}>
                            관리자 승인(대신)
                          </button>
                          <button onClick={() => adminReject(r.id)} style={{ padding: "8px 10px" }}>
                            관리자 거절
                          </button>
                        </>
                      )}

                      {/* admin 확인 처리(모니터링 체크용) */}
                      <button onClick={() => markChecked(r.id)} style={{ padding: "8px 10px" }}>
                        확인 체크
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span
      style={{
        border: "1px solid #eee",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 13,
        background: "white",
      }}
    >
      {label}
    </span>
  );
}
