"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";
import {
  boxStyle,
  inputStyle,
  primaryButton,
  secondaryButton,
  sectionTitle,
  colors,
} from "@/styles/ui";

type NameRel =
  | { id: string; name: string | null }
  | { id: string; name: string | null }[]
  | null;

type RoomRel =
  | { id: string; name: string | null }
  | { id: string; name: string | null }[]
  | null;

type FixedScheduleRow = {
  id: string;
  student_id: string;
  teacher_id: string;
  room_id: string | null;
  weekday: number;
  lesson_time: string;
  hold_for_renewal: boolean;
  memo: string | null;
  created_at: string;
  updated_at?: string;
  student: NameRel;
  teacher: NameRel;
  room: RoomRel;
};

type UserRow = {
  id: string;
  name: string | null;
  phone: string | null;
  role: string;
};

type RoomRow = {
  id: string;
  name: string | null;
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function buildTimeOptions(startHour = 9, endHour = 23) {
  const out: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
  }
  return out;
}

function pickName(x: NameRel) {
  if (!x) return "-";
  return Array.isArray(x) ? x[0]?.name ?? "-" : x.name ?? "-";
}

function pickRoomName(x: RoomRel) {
  if (!x) return "전체";
  const name = Array.isArray(x) ? x[0]?.name ?? null : x.name ?? null;
  return name?.trim() || "전체";
}

function hhmm(v: string) {
  return String(v ?? "").slice(0, 5);
}

function studentLabel(u: UserRow) {
  const name = u.name?.trim() || "이름없음";
  const phone = u.phone?.trim() || "전화없음";
  return `${name} (${phone})`;
}

function teacherLabel(u: UserRow) {
  const name = u.name?.trim() || "이름없음";
  const phone = u.phone?.trim() || "전화없음";
  return `${name} (${phone})`;
}

export default function AdminFixedSchedulesPage() {
  const [isMobile, setIsMobile] = useState(false);

  const [items, setItems] = useState<FixedScheduleRow[]>([]);
  const [students, setStudents] = useState<UserRow[]>([]);
  const [teachers, setTeachers] = useState<UserRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState("");
  const [createMsg, setCreateMsg] = useState("");

  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState(""); // "" = 전체보호
  const [weekday, setWeekday] = useState(1);
  const [lessonTime, setLessonTime] = useState("19:00");
  const [holdForRenewal, setHoldForRenewal] = useState(true);
  const [memo, setMemo] = useState("");

  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editingMemoValue, setEditingMemoValue] = useState("");

  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomValue, setEditingRoomValue] = useState("");

  const timeOptions = useMemo(() => buildTimeOptions(9, 23), []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko")
    );
  }, [students]);

  const sortedTeachers = useMemo(() => {
    return [...teachers].sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko")
    );
  }, [teachers]);

  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko")
    );
  }, [rooms]);

  const protectedCount = useMemo(
    () => items.filter((x) => x.hold_for_renewal).length,
    [items]
  );

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const [studentRes, teacherRes, roomRes] = await Promise.all([
        authFetch("/api/admin/list-users?role=student"),
        authFetch("/api/admin/list-users?role=teacher"),
        authFetch("/api/admin/meta"),
      ]);

      const studentJson = await studentRes.json().catch(() => ({}));
      const teacherJson = await teacherRes.json().catch(() => ({}));
      const roomJson = await roomRes.json().catch(() => ({}));

      if (!studentRes.ok) throw new Error(studentJson.error ?? "수강생 조회 실패");
      if (!teacherRes.ok) throw new Error(teacherJson.error ?? "강사 조회 실패");
      if (!roomRes.ok) throw new Error(roomJson.error ?? "룸 조회 실패");

      const studentRows = (studentJson.rows ?? []) as UserRow[];
      const teacherRows = (teacherJson.rows ?? []) as UserRow[];
      const roomRows = (roomJson.rooms ?? []) as RoomRow[];

      setStudents(studentRows.filter((x) => x.role === "student"));
      setTeachers(teacherRows.filter((x) => x.role === "teacher"));
      setRooms(roomRows);

      if (!studentId && studentRows.length > 0) setStudentId(String(studentRows[0].id));
      if (!teacherId && teacherRows.length > 0) setTeacherId(String(teacherRows[0].id));
    } finally {
      setLoadingUsers(false);
    }
  }, [studentId, teacherId]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/fixed-schedules");
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error ?? "고정 슬롯 조회 실패");
      setItems((json.items ?? []) as FixedScheduleRow[]);
    } catch (e: any) {
      setMsg(e?.message ?? "고정 슬롯 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setMsg("");
    await Promise.all([loadUsers(), loadItems()]);
  }, [loadUsers, loadItems]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const createSlot = async () => {
    setCreateMsg("");
    setMsg("");

    if (!studentId) return setCreateMsg("학생을 선택해주세요.");
    if (!teacherId) return setCreateMsg("강사를 선택해주세요.");
    if (weekday < 0 || weekday > 6) return setCreateMsg("요일 값이 올바르지 않습니다.");
    if (!lessonTime) return setCreateMsg("시간을 입력해주세요.");

    setSaving(true);
    try {
      const res = await authFetch("/api/admin/fixed-schedules", {
        method: "POST",
        body: JSON.stringify({
          student_id: studentId,
          teacher_id: teacherId,
          room_id: roomId || null,
          weekday,
          lesson_time: lessonTime,
          hold_for_renewal: holdForRenewal,
          memo: memo || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "등록 실패");

      setMemo("");
      setRoomId("");
      setCreateMsg("고정 슬롯 등록 완료");
      await loadItems();
    } catch (e: any) {
      setCreateMsg(e?.message ?? "등록 실패");
    } finally {
      setSaving(false);
    }
  };

  const patchSlot = async (
    id: string,
    patch: {
      memo?: string | null;
      hold_for_renewal?: boolean;
      room_id?: string | null;
    }
  ) => {
    setSaving(true);
    setMsg("");
    try {
      const res = await authFetch(`/api/admin/fixed-schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "수정 실패");

      await loadItems();
    } catch (e: any) {
      setMsg(e?.message ?? "수정 실패");
    } finally {
      setSaving(false);
    }
  };

  const deleteSlot = async (id: string) => {
    if (!confirm("이 고정 슬롯을 삭제할까요? 삭제하면 보호 목록에서 제거됩니다.")) return;

    setSaving(true);
    setMsg("");
    try {
      const res = await authFetch(`/api/admin/fixed-schedules/${id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "삭제 실패");

      await loadItems();
    } catch (e: any) {
      setMsg(e?.message ?? "삭제 실패");
    } finally {
      setSaving(false);
    }
  };

  const startEditMemo = (row: FixedScheduleRow) => {
    setEditingRoomId(null);
    setEditingRoomValue("");
    setEditingMemoId(row.id);
    setEditingMemoValue(row.memo ?? "");
  };

  const saveMemo = async (id: string) => {
    await patchSlot(id, { memo: editingMemoValue || null });
    setEditingMemoId(null);
    setEditingMemoValue("");
  };

  const startEditRoom = (row: FixedScheduleRow) => {
    setEditingMemoId(null);
    setEditingMemoValue("");
    setEditingRoomId(row.id);
    setEditingRoomValue(row.room_id ?? "");
  };

  const saveRoom = async (id: string) => {
    await patchSlot(id, { room_id: editingRoomValue || null });
    setEditingRoomId(null);
    setEditingRoomValue("");
  };

  return (
    <AdminLayoutShell title="고정 스케줄 슬롯 관리">
      <div style={{ width: "100%", maxWidth: 1100, minWidth: 0 }}>
        <section style={{ ...boxStyle, padding: isMobile ? 14 : undefined }}>
          <div style={sectionTitle}>1) 새 고정 슬롯 등록</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(6, minmax(0, 1fr))",
              gap: 10,
              marginTop: 12,
            }}
          >
            <Field label="학생 선택">
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                disabled={loadingUsers || sortedStudents.length === 0}
              >
                {loadingUsers ? (
                  <option value="">불러오는 중...</option>
                ) : sortedStudents.length === 0 ? (
                  <option value="">학생 없음</option>
                ) : (
                  sortedStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {studentLabel(s)}
                    </option>
                  ))
                )}
              </select>
            </Field>

            <Field label="강사 선택">
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                disabled={loadingUsers || sortedTeachers.length === 0}
              >
                {loadingUsers ? (
                  <option value="">불러오는 중...</option>
                ) : sortedTeachers.length === 0 ? (
                  <option value="">강사 없음</option>
                ) : (
                  sortedTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {teacherLabel(t)}
                    </option>
                  ))
                )}
              </select>
            </Field>

            <Field label="홀 보호 범위">
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                disabled={loadingUsers}
              >
                <option value="">전체 보호</option>
                {sortedRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name ?? "이름없음"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="요일">
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                style={{ ...inputStyle, width: "100%" }}
              >
                {DOW.map((d, idx) => (
                  <option key={idx} value={idx}>
                    {d}요일
                  </option>
                ))}
              </select>
            </Field>

            <Field label="시간(1시간 단위)">
              <select
                value={lessonTime}
                onChange={(e) => setLessonTime(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
              >
                {timeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="보호 여부">
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 42,
                  color: colors.text,
                  fontWeight: 600,
                }}
              >
                <input
                  type="checkbox"
                  checked={holdForRenewal}
                  onChange={(e) => setHoldForRenewal(e.target.checked)}
                />
                보호
              </label>
            </Field>
          </div>

          <div style={{ marginTop: 10 }}>
            <Field label="메모">
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 기존 고정반 / 재등록 우선 보호 / A홀만 보호"
                style={{ ...inputStyle, width: "100%" }}
              />
            </Field>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={createSlot}
              style={{ ...primaryButton, width: isMobile ? "100%" : "auto" }}
              disabled={saving || loadingUsers}
            >
              고정 슬롯 등록
            </button>

            {createMsg && <span style={{ color: colors.text }}>{createMsg}</span>}
          </div>

          {msg && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${colors.border}`,
                background: colors.bg,
                color: colors.text,
              }}
            >
              {msg}
            </div>
          )}
        </section>

        <section style={{ ...boxStyle, marginTop: 14, padding: isMobile ? 14 : undefined }}>
          <div style={sectionTitle}>2) 고정 슬롯 목록</div>

          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, max-content)",
              gap: 8,
              color: colors.textSub,
              fontSize: 13,
            }}
          >
            <div>
              전체 슬롯: <b style={{ color: colors.text }}>{items.length}</b>
            </div>
            <div>
              보호 슬롯: <b style={{ color: colors.text }}>{protectedCount}</b>
            </div>
          </div>

          {loading ? (
            <div style={{ marginTop: 14, color: colors.text }}>불러오는 중...</div>
          ) : items.length === 0 ? (
            <div style={{ marginTop: 14, color: colors.text }}>등록된 슬롯이 없습니다.</div>
          ) : isMobile ? (
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {items.map((row) => (
                <div
                  key={row.id}
                  style={{
                    border: `1px solid ${colors.border}`,
                    background: "#fff",
                    borderRadius: 14,
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
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <b style={{ color: colors.text }}>
                      {pickName(row.student)} / {pickName(row.teacher)}
                    </b>
                    <span style={{ fontSize: 12, color: colors.textSub }}>
                      {DOW[row.weekday]} {hhmm(row.lesson_time)}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: colors.textSub, lineHeight: 1.7 }}>
                    보호 범위: {pickRoomName(row.room)}
                    <br />
                    보호 상태: {row.hold_for_renewal ? "보호중" : "비보호"}
                    <br />
                    메모: {row.memo ?? "-"}
                  </div>

                  {editingRoomId === row.id ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <select
                        value={editingRoomValue}
                        onChange={(e) => setEditingRoomValue(e.target.value)}
                        style={{ ...inputStyle, width: "100%" }}
                      >
                        <option value="">전체 보호</option>
                        {sortedRooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name ?? "이름없음"}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          style={secondaryButton}
                          onClick={() => saveRoom(row.id)}
                          disabled={saving}
                        >
                          홀 저장
                        </button>
                        <button
                          style={secondaryButton}
                          onClick={() => {
                            setEditingRoomId(null);
                            setEditingRoomValue("");
                          }}
                          disabled={saving}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : editingMemoId === row.id ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <input
                        value={editingMemoValue}
                        onChange={(e) => setEditingMemoValue(e.target.value)}
                        style={{ ...inputStyle, width: "100%" }}
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          style={secondaryButton}
                          onClick={() => saveMemo(row.id)}
                          disabled={saving}
                        >
                          메모 저장
                        </button>
                        <button
                          style={secondaryButton}
                          onClick={() => {
                            setEditingMemoId(null);
                            setEditingMemoValue("");
                          }}
                          disabled={saving}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        style={secondaryButton}
                        onClick={() =>
                          patchSlot(row.id, {
                            hold_for_renewal: !row.hold_for_renewal,
                          })
                        }
                        disabled={saving}
                      >
                        {row.hold_for_renewal ? "보호해제" : "보호적용"}
                      </button>

                      <button
                        style={secondaryButton}
                        onClick={() => startEditRoom(row)}
                        disabled={saving}
                      >
                        홀변경
                      </button>

                      <button
                        style={secondaryButton}
                        onClick={() => startEditMemo(row)}
                        disabled={saving}
                      >
                        메모수정
                      </button>

                      <button
                        style={secondaryButton}
                        onClick={() => deleteSlot(row.id)}
                        disabled={saving}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 14, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
                <thead>
                  <tr>
                    {["학생", "강사", "보호범위", "요일", "시간", "보호", "메모", "액션"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: 10,
                          borderBottom: `1px solid ${colors.border}`,
                          color: colors.text,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td style={td}>{pickName(row.student)}</td>
                      <td style={td}>{pickName(row.teacher)}</td>
                      <td style={td}>
                        {editingRoomId === row.id ? (
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <select
                              value={editingRoomValue}
                              onChange={(e) => setEditingRoomValue(e.target.value)}
                              style={{ ...inputStyle, minWidth: 180 }}
                            >
                              <option value="">전체 보호</option>
                              {sortedRooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name ?? "이름없음"}
                                </option>
                              ))}
                            </select>
                            <button
                              style={secondaryButton}
                              onClick={() => saveRoom(row.id)}
                              disabled={saving}
                            >
                              저장
                            </button>
                            <button
                              style={secondaryButton}
                              onClick={() => {
                                setEditingRoomId(null);
                                setEditingRoomValue("");
                              }}
                              disabled={saving}
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          pickRoomName(row.room)
                        )}
                      </td>
                      <td style={td}>{DOW[row.weekday] ?? row.weekday}</td>
                      <td style={td}>{hhmm(row.lesson_time)}</td>
                      <td style={td}>{row.hold_for_renewal ? "보호중" : "비보호"}</td>
                      <td style={td}>
                        {editingMemoId === row.id ? (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              value={editingMemoValue}
                              onChange={(e) => setEditingMemoValue(e.target.value)}
                              style={{ ...inputStyle, minWidth: 220 }}
                            />
                            <button
                              style={secondaryButton}
                              onClick={() => saveMemo(row.id)}
                              disabled={saving}
                            >
                              저장
                            </button>
                            <button
                              style={secondaryButton}
                              onClick={() => {
                                setEditingMemoId(null);
                                setEditingMemoValue("");
                              }}
                              disabled={saving}
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          row.memo ?? "-"
                        )}
                      </td>
                      <td style={td}>
                        {editingMemoId !== row.id && editingRoomId !== row.id && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              style={secondaryButton}
                              onClick={() =>
                                patchSlot(row.id, {
                                  hold_for_renewal: !row.hold_for_renewal,
                                })
                              }
                              disabled={saving}
                            >
                              {row.hold_for_renewal ? "보호해제" : "보호적용"}
                            </button>

                            <button
                              style={secondaryButton}
                              onClick={() => startEditRoom(row)}
                              disabled={saving}
                            >
                              홀변경
                            </button>

                            <button
                              style={secondaryButton}
                              onClick={() => startEditMemo(row)}
                              disabled={saving}
                            >
                              메모수정
                            </button>

                            <button
                              style={secondaryButton}
                              onClick={() => deleteSlot(row.id)}
                              disabled={saving}
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayoutShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, color: colors.text }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const td: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #f0f0f0",
  color: colors.text,
  verticalAlign: "top",
};