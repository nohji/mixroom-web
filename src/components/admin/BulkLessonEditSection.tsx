"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { colors, inputStyle, primaryButton, secondaryButton } from "@/styles/ui";

type RoomOption = { id: string; name: string };
type TeacherOption = { id: string; name: string | null };

type LessonRow = {
  id: string;
  lesson_date: string;
  lesson_time: string;
  room_id: string;
  teacher_id: string;
  status: string;
};

type ConflictRow = {
  type: string;
  lessonDate: string;
  lessonTime: string;
  conflictStudentName: string;
  conflictTeacherName: string;
  conflictRoomName: string;
  message: string;
};

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function buildTimeOptions() {
  const arr: string[] = [];
  for (let h = 9; h <= 23; h++) arr.push(`${pad2(h)}:00`);
  return arr;
}

export default function BulkLessonEditSection({ classId }: { classId: string }) {
  const timeOptions = useMemo(() => buildTimeOptions(), []);

  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);

  const [fromDate, setFromDate] = useState(todayYMD());
  const [roomId, setRoomId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [weekday, setWeekday] = useState("");
  const [lessonTime, setLessonTime] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);

  const loadData = async () => {
    if (!classId) return;

    setLoading(true);
    setMsg("");
    setConflicts([]);

    try {
      const res = await authFetch(`/api/admin/classes/${classId}/lessons/bulk-update`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data.error ?? "데이터 조회 실패");
        return;
      }

      setRooms(data.rooms ?? []);
      setTeachers(data.teachers ?? []);
      setLessons(data.lessons ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const preview = async () => {
    setLoading(true);
    setMsg("");
    setConflicts([]);

    try {
      const res = await authFetch(`/api/admin/classes/${classId}/lessons/bulk-update`, {
        method: "PATCH",
        body: JSON.stringify({
          fromDate,
          roomId: roomId || null,
          teacherId: teacherId || null,
          weekday: weekday === "" ? null : Number(weekday),
          lessonTime: lessonTime || null,
          dryRun: true,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setConflicts(data.conflicts ?? []);
        setMsg("충돌이 있습니다. 아래 내용을 확인해 주세요.");
        return;
      }

      if (!res.ok) {
        setMsg(data.error ?? "충돌 확인 실패");
        return;
      }

      setConflicts(data.conflicts ?? []);
      setMsg(`변경 가능: ${data.count ?? 0}개 레슨`);
    } finally {
      setLoading(false);
    }
  };

  const save = async (force = false) => {
    const ok = window.confirm(
      force
        ? "충돌이 있어도 강제로 변경할까요?"
        : "선택한 조건으로 기존 레슨 일정을 변경할까요?"
    );

    if (!ok) return;

    setLoading(true);
    setMsg("");

    try {
      const res = await authFetch(`/api/admin/classes/${classId}/lessons/bulk-update`, {
        method: "PATCH",
        body: JSON.stringify({
          fromDate,
          roomId: roomId || null,
          teacherId: teacherId || null,
          weekday: weekday === "" ? null : Number(weekday),
          lessonTime: lessonTime || null,
          dryRun: false,
          force,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setConflicts(data.conflicts ?? []);
        setMsg("충돌이 있어 저장되지 않았습니다.");
        return;
      }

      if (!res.ok) {
        setMsg(data.error ?? "저장 실패");
        return;
      }

      setMsg(`${data.count ?? 0}개 레슨을 변경했습니다.`);
      setConflicts([]);
      await loadData();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
      <div
        style={{
          padding: 12,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          background: "#fafafa",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 800, color: colors.text }}>오늘 이후 레슨 일괄 수정</div>

        <div style={{ color: colors.textSub, fontSize: 13, lineHeight: 1.6 }}>
          비워둔 항목은 변경하지 않습니다. 홀만 선택하면 홀만 변경돼요.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          <Field label="변경 기준일">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            />
          </Field>

          <Field label="변경할 홀">
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            >
              <option value="">변경 안 함</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="변경할 선생님">
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            >
              <option value="">변경 안 함</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? "이름없음"}
                </option>
              ))}
            </select>
          </Field>

          <Field label="변경할 요일">
            <select
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            >
              <option value="">변경 안 함</option>
              {weekdayLabels.map((d, idx) => (
                <option key={idx} value={idx}>
                  {d}요일
                </option>
              ))}
            </select>
          </Field>

          <Field label="변경할 시간">
            <select
              value={lessonTime}
              onChange={(e) => setLessonTime(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            >
              <option value="">변경 안 함</option>
              {timeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={preview} style={secondaryButton} disabled={loading}>
            충돌 확인
          </button>

          <button type="button" onClick={() => save(false)} style={primaryButton} disabled={loading}>
            변경 저장
          </button>

          {conflicts.length > 0 && (
            <button type="button" onClick={() => save(true)} style={secondaryButton} disabled={loading}>
              충돌 무시하고 강제 변경
            </button>
          )}
        </div>

        {msg && <div style={{ color: conflicts.length ? "#b42318" : colors.text }}>{msg}</div>}
      </div>

      {conflicts.length > 0 && (
        <div
          style={{
            border: "1px solid #f5c2c2",
            background: "#fff5f5",
            borderRadius: 12,
            padding: 12,
            color: "#b42318",
            fontSize: 13,
          }}
        >
          <b>충돌 내역</b>
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {conflicts.map((c, idx) => (
              <li key={idx}>
                {c.lessonDate} {c.lessonTime} / {c.message} / 충돌 학생:{" "}
                {c.conflictStudentName} / {c.conflictTeacherName} / {c.conflictRoomName}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div style={{ fontWeight: 800, color: colors.text, marginBottom: 8 }}>현재 레슨 목록</div>

        {lessons.length === 0 ? (
          <p style={{ color: colors.textSub }}>레슨이 없습니다.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["날짜", "요일", "시간", "홀", "선생님", "상태"].map((h) => (
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
                {lessons.map((l) => {
                  const room = rooms.find((r) => r.id === l.room_id);
                  const teacher = teachers.find((t) => t.id === l.teacher_id);
                  const wd = new Date(`${l.lesson_date}T00:00:00`).getDay();

                  return (
                    <tr key={l.id}>
                      <td style={tdStyle}>{l.lesson_date}</td>
                      <td style={tdStyle}>{weekdayLabels[wd]}</td>
                      <td style={tdStyle}>{l.lesson_time}</td>
                      <td style={tdStyle}>{room?.name ?? "-"}</td>
                      <td style={tdStyle}>{teacher?.name ?? "-"}</td>
                      <td style={tdStyle}>{l.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, color: colors.text }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const tdStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #f0f0f0",
  whiteSpace: "nowrap",
};