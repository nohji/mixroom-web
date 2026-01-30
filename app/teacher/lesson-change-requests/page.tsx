"use client";

import { useEffect, useMemo, useState } from "react";
import TeacherShell from "@/components/TeacherShell";
import { authFetch } from "@/lib/authFetch";

type RequestRow = {
  id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  from_date: string;
  from_time: string;
  to_date: string;
  to_time: string;

  // API에서 같이 내려주면 사용(없어도 안전하게 처리)
  lesson_date?: string;
  lesson_time?: string;
  student_name?: string;
};

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

export default function TeacherLessonChangeRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await authFetch("/api/teacher/lesson-change-requests");
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error ?? "변경요청 조회 실패");
      setRows([]);
      setLoading(false);
      return;
    }

    // ✅ 예전 requests.map is not a function 방지
    const list = safeArray<RequestRow>(data.rows ?? data.requests ?? data.data);
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const pending = useMemo(
    () => rows.filter((r) => r.status === "pending"),
    [rows]
  );

  const approve = async (requestId: string) => {
    setActingId(requestId);

    const res = await authFetch("/api/teacher/approve-lesson-change", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
    const data = await res.json().catch(() => ({}));

    setActingId(null);

    if (!res.ok) {
      alert(data.error ?? "승인 실패");
      return;
    }

    alert("승인 완료!");
    await load();
  };

  return (
    <TeacherShell title="레슨 변경 요청 승인">
      <div style={{ maxWidth: 980 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={load} style={{ padding: "6px 10px" }}>
            새로고침
          </button>
          <span style={{ color: "#666" }}>
            * 강사는 <b>정규 근무 시간 내 요청</b>만 승인 처리합니다. <br />
            * 거절이 필요하면 <b>관리자에게 연락</b>해주세요.
          </span>
        </div>

        <hr style={{ margin: "16px 0" }} />

        {loading ? (
          <p>불러오는 중...</p>
        ) : pending.length === 0 ? (
          <p>대기 중인 요청이 없습니다.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map((r) => (
              <div
                key={r.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {r.student_name ? `수강생: ${r.student_name}` : "수강생: (표시 없음)"}
                    </div>

                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: "#444" }}>
                        기존: <b>{r.from_date} {r.from_time}</b>
                      </div>
                      <div style={{ color: "#111" }}>
                        변경 요청: <b>{r.to_date} {r.to_time}</b>
                      </div>
                    </div>

                    <div style={{ marginTop: 6, color: "#888", fontSize: 12 }}>
                      요청시간: {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
                    <button
                      onClick={() => approve(r.id)}
                      disabled={actingId === r.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #111",
                        background: "#111",
                        color: "white",
                        cursor: actingId === r.id ? "not-allowed" : "pointer",
                        opacity: actingId === r.id ? 0.7 : 1,
                      }}
                    >
                      {actingId === r.id ? "처리중..." : "승인"}
                    </button>

                    <button
                      onClick={() => alert("거절은 관리자에게 연락해주세요. (관리자 화면에서 처리)")}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #eee",
                        background: "white",
                        color: "#111",
                        cursor: "pointer",
                      }}
                    >
                      거절은 관리자
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
