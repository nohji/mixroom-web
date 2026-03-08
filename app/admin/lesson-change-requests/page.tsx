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

  // view 스냅샷 old + 요청 new
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

type RoomRow = { id: string; name: string | null };

function clampHHMM(t: string) {
  return String(t ?? "").slice(0, 5);
}
function formatDate(s: string) {
  return String(s ?? "").slice(0, 10);
}

function prettyOldToNew(r: ViewRow) {
  if (r.request_type === "EXTENSION") return "연장(해당 레슨 → 맨 뒤 +7일)";

  const oldDate = r.lesson_date_old ? formatDate(r.lesson_date_old) : "-";
  const oldTime = r.lesson_time_old ? clampHHMM(r.lesson_time_old) : "-";

  const newDate = r.lesson_date_new ? formatDate(r.lesson_date_new) : "-";
  const newTime = r.lesson_time_new ? clampHHMM(r.lesson_time_new) : "-";

  // 학생이 날짜/시간만 바꿔도 한눈에 보이게
  return `${oldDate} ${oldTime}  →  ${newDate} ${newTime}`;
}

const TABS: { key: Status; label: string }[] = [
  { key: "PENDING", label: "대기(PENDING)" },
  { key: "APPROVED", label: "승인(APPROVED)" },
  { key: "REJECTED", label: "거절(REJECTED)" },
];

export default function AdminLessonChangeRequestsPage() {
  const [tab, setTab] = useState<Status>("PENDING");
  const [rows, setRows] = useState<ViewRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  // requestId -> selectedRoomId
  const [selectedRoomByReq, setSelectedRoomByReq] = useState<Record<string, string>>({});
  // requestId -> 사용중인 room_id[]
  const [busyRoomsByReq, setBusyRoomsByReq] = useState<Record<string, string[]>>({});

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const loadRooms = async () => {
    // 룸은 탭 변경과 무관하게 전체 한번 로드
    const { data, error } = await supabase
      .from("practice_rooms")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) {
      console.warn("practice_rooms load error:", error);
      setRooms([]);
      return;
    }
    setRooms((data ?? []) as RoomRow[]);
  };

  const getBusyRooms = async (r: ViewRow) => {

    if (r.request_type !== "CHANGE") return [];
  
    const date = r.lesson_date_new;
    const time = r.lesson_time_new;
  
    if (!date || !time) return [];
  
    const { data: lessons } = await supabase
      .from("lessons")
      .select("room_id")
      .eq("lesson_date", date)
      .eq("lesson_time", time)
      .neq("status", "canceled");
  
    const { data: practice } = await supabase
      .from("practice_reservations")
      .select("room_id")
      .eq("date", date)
      .eq("start_time", time)
      .eq("status", "approved");
  
    const busy = [
      ...(lessons ?? []),
      ...(practice ?? []),
    ]
      .map((x: any) => x.room_id)
      .filter(Boolean);
  
    return busy;
  };

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

    const nextRows = (data ?? []) as ViewRow[];
    setRows(nextRows);

    const busyMap: Record<string, string[]> = {};

    for (const r of nextRows) {
      busyMap[r.id] = await getBusyRooms(r);
    }

    setBusyRoomsByReq(busyMap);

    // 탭 바뀔 때마다 선택값 초기화(선택한 룸이 다른 탭으로 섞이지 않게)
    setSelectedRoomByReq((prev) => {
      const next: Record<string, string> = {};
      for (const r of nextRows) {
        // 만약 뷰에 room_id_new가 이미 있으면 그걸 기본값으로
        if (r.room_id_new) next[r.id] = String(r.room_id_new);
        // 아니면 old room을 기본으로(원하면 빈값으로 바꿔도 됨)
        else if (r.room_id_old) next[r.id] = String(r.room_id_old);
        else if (prev[r.id]) next[r.id] = prev[r.id];
      }
      return next;
    });

    setLoading(false);
  };

  useEffect(() => {
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const doApprove = async (r: ViewRow) => {
    const note = (prompt("승인 메모(선택)") ?? "").trim();

    if (!confirm(`이 요청을 승인(반영)할까요?\n\n요청종류: ${r.request_type}`)) return;

    let extensionNewDate: string | null = null;
    let pickedRoomId: string | null = null;

    // ✅ EXTENSION이면 날짜 지정 옵션
    if (r.request_type === "EXTENSION") {
      const hint =
        "연장 승인 날짜를 직접 지정할 수 있어요. (선택)\n" +
        "- 비우면 자동: '마지막 레슨 날짜 + 7일'\n" +
        "- 입력하면 그 날짜로 이동(YYYY-MM-DD)\n\n" +
        "예) 2026-03-10";
      const input = (prompt(hint, "") ?? "").trim();
      if (input.length > 0) {
        const ok = /^\d{4}-\d{2}-\d{2}$/.test(input);
        if (!ok) {
          alert("날짜 형식이 올바르지 않습니다. YYYY-MM-DD 로 입력해주세요.");
          return;
        }
        extensionNewDate = input;
      }
    }

    // ✅ CHANGE면 룸 선택 필수(학생은 룸 선택 안 함)
    if (r.request_type === "CHANGE") {
      pickedRoomId = selectedRoomByReq[r.id] ? String(selectedRoomByReq[r.id]) : "";
      if (!pickedRoomId) {
        alert("변경 승인 전, 룸을 선택해주세요.");
        return;
      }
    }

    setActingId(r.id);

    /**
     * ⭐️ 중요:
     * 아래 RPC는 UI 요구사항(관리자가 룸 선택)에 맞추려면
     * DB 함수가 p_room_id 파라미터를 받아야 해.
     *
     * 예) approve_lesson_change_request(
     *    p_request_id uuid,
     *    p_admin_note text,
     *    p_extension_new_date date,
     *    p_room_id uuid default null
     * )
     */
    const { error } = await supabase.rpc("approve_lesson_change_request", {
      p_request_id: r.id,
      p_admin_note: note || null,
      p_extension_new_date: extensionNewDate,
      // CHANGE 승인 시 사용(EXTENSION이면 null)
      p_room_id: pickedRoomId,
    } as any);

    setActingId(null);

    if (error) {
      alert(error.message ?? "approve 실패");
      return;
    }

    await load();
  };

  const doReject = async (r: ViewRow) => {
    const note = (prompt("거절 사유(관리자 메모)를 입력하세요.") ?? "").trim();
    if (!confirm(`이 요청을 거절(REJECT)할까요?\n\n요청종류: ${r.request_type}`)) return;

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

  const roomNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) m.set(String(r.id), r.name ?? String(r.id).slice(0, 6));
    return m;
  }, [rooms]);

  return (
    <AdminLayoutShell title="레슨 변경/연장 요청 관리">
      <div style={{ maxWidth: 1600 }}>
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
                {[
                  "상태",
                  "종류",
                  "레슨(기존)",
                  "변경(기존→요청)",
                  "학생",
                  "강사(기존)",
                  "룸(기존)",
                  "룸(선택)",
                  "요청사유",
                  "처리",
                  "액션",
                ].map((h) => (
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
                  <td colSpan={11} style={{ padding: 14, color: "#666" }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isActing = actingId === r.id;

                  const lessonDateOld = r.lesson_date_old ? formatDate(r.lesson_date_old) : "-";
                  const lessonTimeOld = r.lesson_time_old ? clampHHMM(r.lesson_time_old) : "-";

                  const oldToNew = prettyOldToNew(r);

                  const roomOldText = r.room_name_old ?? (r.room_id_old ? r.room_id_old.slice(0, 6) : "-");

                  const canPickRoom = r.status === "PENDING" && r.request_type === "CHANGE";
                  const pickedRoomId = selectedRoomByReq[r.id] ?? "";
                  const pickedRoomLabel = pickedRoomId ? roomNameById.get(pickedRoomId) ?? pickedRoomId.slice(0, 6) : "";

                  return (
                    <tr key={r.id}>
                      <td style={td({ bold: true })}>{r.status}</td>

                      <td style={td({ nowrap: true })}>{r.request_type === "EXTENSION" ? "연장" : "변경"}</td>

                      <td style={td({ nowrap: true })}>
                        {lessonDateOld} {lessonTimeOld}
                      </td>

                      <td style={td()}>{oldToNew}</td>

                      <td style={td({ nowrap: true })}>{r.student_name ?? r.student_id.slice(0, 6)}</td>

                      <td style={td({ nowrap: true })}>
                        {r.teacher_name_old ?? (r.teacher_id_old ? r.teacher_id_old.slice(0, 6) : "-")}
                      </td>

                      <td style={td({ nowrap: true })}>{roomOldText}</td>

                      {/* ✅ 룸 선택 컬럼(CHANGE + PENDING 때만 활성) */}
                      <td style={td({ nowrap: true })}>
                        {canPickRoom ? (
                          <select
                            value={pickedRoomId}
                            onChange={(e) =>
                              setSelectedRoomByReq((p) => ({
                                ...p,
                                [r.id]: e.target.value,
                              }))
                            }
                            disabled={isActing}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              fontWeight: 900,
                              background: "#fff",
                              minWidth: 180,
                            }}
                          >
                            <option value="">룸 선택</option>
                            {rooms
                            .filter((rr) => !(busyRoomsByReq[r.id] ?? []).includes(rr.id))
                            .map((rr) => (
                              <option key={rr.id} value={rr.id}>
                                {rr.name ?? rr.id.slice(0, 6)}
                              </option>
                            ))}               
                          </select>
                        ) : (
                          <span style={{ color: "#666" }}>
                            {r.request_type === "CHANGE" ? (pickedRoomLabel ? pickedRoomLabel : "-") : "-"}
                          </span>
                        )}
                      </td>

                      <td style={td()}>{r.reason ?? "-"}</td>

                      <td style={td({ color: "#666" })}>
                        {r.admin_processed_at
                          ? `처리됨 (${String(r.admin_processed_at).slice(0, 16).replace("T", " ")})`
                          : "-"}
                        {r.admin_note ? <div style={{ marginTop: 4, color: "#111" }}>메모: {r.admin_note}</div> : null}
                        {r.handled_by_name ? (
                          <div style={{ marginTop: 4, color: "#111" }}>처리자: {r.handled_by_name}</div>
                        ) : null}
                      </td>

                      <td style={td({ nowrap: true })}>
                        {r.status === "PENDING" ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              disabled={isActing}
                              onClick={() => doApprove(r)}
                              style={btnPrimary(isActing)}
                              title={
                                r.request_type === "CHANGE" && !pickedRoomId
                                  ? "변경 승인 전, 룸을 선택해주세요."
                                  : undefined
                              }
                            >
                              {r.request_type === "EXTENSION" ? "연장 승인" : "변경 승인"}
                            </button>

                            <button disabled={isActing} onClick={() => doReject(r)} style={btnGhost(isActing)}>
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
          <br />
          * CHANGE(변경) 요청은 학생이 날짜/시간만 요청하며, 룸은 관리자가 승인 시 선택합니다.
        </div>
      </div>
    </AdminLayoutShell>
  );
}

/* ===== small ui helpers ===== */

function td(opts?: { nowrap?: boolean; bold?: boolean; color?: string }): React.CSSProperties {
  return {
    padding: "10px 10px",
    borderBottom: "1px solid #f2f2f2",
    whiteSpace: opts?.nowrap ? "nowrap" : "normal",
    fontWeight: opts?.bold ? 1000 : 900,
    color: opts?.color ?? "#111",
    verticalAlign: "top",
  };
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