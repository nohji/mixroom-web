"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { createBrowserClient } from "@supabase/ssr";

type Status = "PENDING" | "APPROVED" | "REJECTED";
type RequestType = "CHANGE" | "EXTENSION";

type ViewRow = {
  id: string;
  request_type: RequestType;
  lesson_id: string;
  student_id: string;
  status: Status;
  reason: string | null;
  requested_changes: any;
  created_at: string | null;
  handled_by_id: string | null;
  admin_processed_at: string | null;
  admin_note: string | null;

  // ✅ view 컬럼(스냅샷 old + 요청 new)
  lesson_date_old: string | null;
  lesson_time_old: string | null;
  teacher_id_old: string | null;
  room_id_old: string | null;

  lesson_date_new: string | null;
  lesson_time_new: string | null;
  teacher_id_new: string | null;
  room_id_new: string | null;

  student_name: string | null;
  teacher_name_old: string | null;
  room_name_old: string | null;
  handled_by_name: string | null;
};

function clampHHMM(t: string) {
  return String(t ?? "").slice(0, 5);
}
function formatDate(s: string) {
  return String(s ?? "").slice(0, 10);
}

function prettyChangesFromView(r: ViewRow) {
  if (r.request_type === "EXTENSION") return "연장(해당 레슨 → 맨 뒤 +7일)";

  const parts: string[] = [];

  if (r.lesson_date_new) parts.push(`날짜:${formatDate(r.lesson_date_new)}`);
  if (r.lesson_time_new) parts.push(`시간:${clampHHMM(r.lesson_time_new)}`);

  // ✅ teacher/room 변경은 "표시"만
  if (r.teacher_id_new) parts.push("강사변경");
  if (r.room_id_new) parts.push("룸변경");

  return parts.length ? parts.join(" · ") : "-";
}

const TABS: { key: Status; label: string }[] = [
  { key: "PENDING", label: "대기(PENDING)" },
  { key: "APPROVED", label: "승인(APPROVED)" },
  { key: "REJECTED", label: "거절(REJECTED)" },
];

export default function AdminLessonChangeRequestsPage() {
  const [tab, setTab] = useState<Status>("PENDING");
  const [rows, setRows] = useState<ViewRow[]>([]);
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
      .from("admin_lesson_change_requests")
      .select("*")
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      alert(error.message ?? "목록 조회 실패");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as ViewRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const doApprove = async (r: ViewRow) => {
    const note = prompt("승인 메모(선택)") ?? "";
    if (!confirm(`이 요청을 APPROVE(승인/반영) 할까요?\n\n요청종류: ${r.request_type}`)) return;

    let newDate: string | null = null;

    // ✅ EXTENSION이면 날짜 지정 옵션
    if (r.request_type === "EXTENSION") {
      const hint =
        "연장 승인 날짜를 직접 지정할 수 있어요. (선택)\n" +
        "- 비우면 자동: '마지막 레슨 날짜 + 7일'\n" +
        "- 입력하면 그 날짜로 이동(YYYY-MM-DD)\n\n" +
        "예) 2026-03-10";
      const input = prompt(hint, "") ?? "";
      const v = input.trim();
      if (v.length > 0) {
        const ok = /^\d{4}-\d{2}-\d{2}$/.test(v);
        if (!ok) {
          alert("날짜 형식이 올바르지 않습니다. YYYY-MM-DD 로 입력해주세요.");
          return;
        }
        newDate = v;
      }
    }

    setActingId(r.id);
    const { error } = await supabase.rpc("approve_lesson_change_request", {
      p_request_id: r.id,
      p_admin_note: note || null,
      p_extension_new_date: newDate,
    });
    setActingId(null);

    if (error) {
      alert(error.message ?? "approve 실패");
      return;
    }

    await load();
  };

  const doReject = async (r: ViewRow) => {
    const note = prompt("거절 사유(관리자 메모)를 입력하세요.") ?? "";
    if (!confirm(`이 요청을 REJECT(거절) 할까요?\n\n요청종류: ${r.request_type}`)) return;

    setActingId(r.id);
    const { error } = await supabase.rpc("reject_lesson_change_request", {
      p_request_id: r.id,
      p_admin_note: note || null,
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

  return (
    <AdminLayoutShell title="레슨 변경/연장 요청 관리">
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
          <div style={{ fontWeight: 1000 }}>요청</div>

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
                {["상태", "종류", "레슨(기존)", "요청내용", "학생", "강사(기존)", "룸(기존)", "요청사유", "처리", "액션"].map(
                  (h) => (
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
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 14, color: "#666" }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isActing = actingId === r.id;

                  const lessonDateOld = r.lesson_date_old ? formatDate(r.lesson_date_old) : "-";
                  const lessonTimeOld = r.lesson_time_old ? clampHHMM(r.lesson_time_old) : "-";

                  const changesText = prettyChangesFromView(r);

                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", fontWeight: 1000 }}>
                        {r.status}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                        {r.request_type === "EXTENSION" ? "연장" : "변경"}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                        {lessonDateOld} {lessonTimeOld}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2" }}>{changesText}</td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                        {r.student_name ?? r.student_id.slice(0, 6)}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                        {r.teacher_name_old ?? (r.teacher_id_old ? r.teacher_id_old.slice(0, 6) : "-")}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                        {r.room_name_old ?? (r.room_id_old ? r.room_id_old.slice(0, 6) : "-")}
                      </td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2" }}>{r.reason ?? "-"}</td>

                      <td style={{ padding: "10px 10px", borderBottom: "1px solid #f2f2f2", color: "#666" }}>
                        {r.admin_processed_at
                          ? `처리됨 (${String(r.admin_processed_at).slice(0, 16).replace("T", " ")})`
                          : "-"}
                        {r.admin_note ? <div style={{ marginTop: 4, color: "#111" }}>메모: {r.admin_note}</div> : null}
                        {r.handled_by_name ? (
                          <div style={{ marginTop: 4, color: "#111" }}>처리자: {r.handled_by_name}</div>
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
                              {r.request_type === "EXTENSION" ? "연장 승인" : "변경 승인"}
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
          * EXTENSION(연장) 승인 시 날짜를 비우면 자동으로 “마지막 레슨 + 7일”, 입력하면 지정 날짜로 반영됩니다.
        </div>
      </div>
    </AdminLayoutShell>
  );
}