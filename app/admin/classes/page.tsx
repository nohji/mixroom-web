"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";
import { boxStyle, inputStyle, primaryButton, secondaryButton, sectionTitle, colors } from "@/styles/ui";

type ClassType = "1month" | "3month";
type DeviceType = "controller" | "turntable";

type StudentOption = { id: string; name: string | null; phone: string | null };
type TeacherOption = { id: string; name: string | null; phone: string | null };
type RoomOption = { id: string; name: string };

type LessonDraft = {
  idx: number;
  lesson_date: string;
  teacher_id: string;
  lesson_time: string;
  room_id: string;
  selected: boolean;
};

type ConflictDetail = {
  idx: number;
  lesson_date: string;
  lesson_time: string;
  teacher_id: string;
  room_id: string;
  reasons: string[];
};

/* ===================== utils ===================== */
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function defaultStartDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toYMD(d);
}
function weekdayOf(ymd: string) {
  return new Date(`${ymd}T00:00:00`).getDay();
}
function addDaysYMD(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYMD(d);
}
function addWeeksYMD(ymd: string, weeks: number) {
  return addDaysYMD(ymd, weeks * 7);
}
function correctedFirstDate(startDate: string, weekday: number) {
  let firstDate = startDate;
  const wd = weekdayOf(firstDate);
  const delta = (weekday - wd + 7) % 7;
  if (delta !== 0) firstDate = addDaysYMD(firstDate, delta);
  return firstDate;
}
function lessonCountByType(type: ClassType) {
  return type === "1month" ? 4 : 12;
}
function buildTimeOptions(startHour = 9, endHour = 23) {
  const out: string[] = [];
  for (let h = startHour; h <= endHour; h++) out.push(`${pad2(h)}:00`);
  return out;
}
function shiftDateToWeekday(ymd: string, targetW: number) {
  const d = new Date(`${ymd}T00:00:00`);
  const cur = d.getDay();
  const delta = targetW - cur;
  d.setDate(d.getDate() + delta);
  return toYMD(d);
}

/* ===================== page ===================== */
export default function AdminClassesPage() {
  const weekdayLabel = useMemo(() => ["일", "월", "화", "수", "목", "금", "토"], []);
  const timeOptions = useMemo(() => buildTimeOptions(9, 23), []);
  const [isMobile, setIsMobile] = useState(false);

  // users
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // rooms
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // inputs
  const [studentId, setStudentId] = useState("");
  const [classType, setClassType] = useState<ClassType>("1month");
  const [deviceType, setDeviceType] = useState<DeviceType>("controller");
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [weekday, setWeekday] = useState(3);

  // defaults for bulk apply
  const [defaultTeacherId, setDefaultTeacherId] = useState("");
  const [defaultTime, setDefaultTime] = useState("19:00");
  const [defaultRoomId, setDefaultRoomId] = useState("");
  const [defaultWeekday, setDefaultWeekday] = useState(3);

  // lessons
  const [lessons, setLessons] = useState<LessonDraft[]>([]);

  // conflict ui
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);

  const [msg, setMsg] = useState("");
  const [createMsg, setCreateMsg] = useState("");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const studentLabel = (s: StudentOption) => {
    const nm = s.name?.trim() ? s.name : "이름없음";
    const ph = s.phone?.trim() ? s.phone : "전화없음";
    return `${nm} (${ph})`;
  };

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const an = String(a.name ?? "").trim();
      const bn = String(b.name ?? "").trim();
  
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
  
      return an.localeCompare(bn, "ko");
    });
  }, [students]);

  const teacherLabel = (t: TeacherOption) => {
    const nm = t.name?.trim() ? t.name : "이름없음";
    const ph = t.phone?.trim() ? t.phone : "전화없음";
    return `${nm} (${ph})`;
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const qsS = new URLSearchParams();
      qsS.set("role", "student");
      const resS = await authFetch(`/api/admin/list-users?${qsS.toString()}`);
      const dataS = await resS.json().catch(() => ({}));
      if (resS.ok) {
        const rows = (dataS.rows ?? []) as any[];
        const onlyStudents: StudentOption[] = rows
          .filter((r) => r.role === "student")
          .map((r) => ({ id: r.id, name: r.name ?? null, phone: r.phone ?? null }));
        setStudents(onlyStudents);
        if (!studentId && onlyStudents.length > 0) setStudentId(onlyStudents[0].id);
      } else {
        setStudents([]);
      }

      const qsT = new URLSearchParams();
      qsT.set("role", "teacher");
      const resT = await authFetch(`/api/admin/list-users?${qsT.toString()}`);
      const dataT = await resT.json().catch(() => ({}));
      if (resT.ok) {
        const rows = (dataT.rows ?? []) as any[];
        const onlyTeachers: TeacherOption[] = rows
          .filter((r) => r.role === "teacher")
          .map((r) => ({ id: r.id, name: r.name ?? null, phone: r.phone ?? null }));
        setTeachers(onlyTeachers);
        if (!defaultTeacherId && onlyTeachers.length > 0) setDefaultTeacherId(onlyTeachers[0].id);
      } else {
        setTeachers([]);
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadRooms = async (dt: DeviceType) => {
    setLoadingRooms(true);
    try {
      const qs = new URLSearchParams();
      qs.set("deviceType", dt);
      const res = await authFetch(`/api/admin/list-rooms?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRooms([]);
        return;
      }
      const rows = (data.rows ?? []) as RoomOption[];
      setRooms(rows);
      if (!defaultRoomId && rows.length > 0) setDefaultRoomId(rows[0].id);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRooms(deviceType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceType]);

  useEffect(() => {
    setDefaultWeekday(weekday);
  }, [weekday]);

  useEffect(() => {
    setMsg("");
    setCreateMsg("");
    setConflicts([]);
    if (!startDate) return;
    if (weekday < 0 || weekday > 6) return;

    const count = lessonCountByType(classType);
    const firstDate = correctedFirstDate(startDate, weekday);

    setLessons((prev) => {
      const next: LessonDraft[] = [];
      for (let i = 0; i < count; i++) {
        const date = addWeeksYMD(firstDate, i);
        const old = prev.find((x) => x.idx === i + 1);

        next.push({
          idx: i + 1,
          lesson_date: date,
          teacher_id: old?.teacher_id || defaultTeacherId || "",
          lesson_time: old?.lesson_time || defaultTime,
          room_id: old?.room_id || defaultRoomId || "",
          selected: old?.selected ?? true,
        });
      }
      return next;
    });
  }, [classType, startDate, weekday, defaultTeacherId, defaultTime, defaultRoomId]);

  const conflictMap = useMemo(() => {
    const m = new Map<number, ConflictDetail>();
    conflicts.forEach((c) => m.set(c.idx, c));
    return m;
  }, [conflicts]);

  const hasConflict = (idx: number) => conflictMap.has(idx);

  const scrollToConflict = (idx: number) => {
    const el = document.getElementById(`lesson-row-${idx}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const updateLesson = (idx: number, patch: Partial<LessonDraft>) => {
    setLessons((prev) => prev.map((l) => (l.idx === idx ? { ...l, ...patch } : l)));
    if (conflicts.length) setConflicts([]);
  };

  const selectedCount = lessons.filter((l) => l.selected).length;
  const allSelected = lessons.length > 0 && selectedCount === lessons.length;

  const setAllSelected = (v: boolean) => {
    setLessons((prev) => prev.map((l) => ({ ...l, selected: v })));
    if (conflicts.length) setConflicts([]);
  };

  const applyTeacherToSelected = () => {
    if (!defaultTeacherId) return;
    setLessons((prev) => prev.map((l) => (l.selected ? { ...l, teacher_id: defaultTeacherId } : l)));
    if (conflicts.length) setConflicts([]);
  };

  const applyTimeToSelected = () => {
    if (!defaultTime) return;
    setLessons((prev) => prev.map((l) => (l.selected ? { ...l, lesson_time: defaultTime } : l)));
    if (conflicts.length) setConflicts([]);
  };

  const applyRoomToSelected = () => {
    if (!defaultRoomId) return;
    setLessons((prev) => prev.map((l) => (l.selected ? { ...l, room_id: defaultRoomId } : l)));
    if (conflicts.length) setConflicts([]);
  };

  const applyWeekdayToSelected = () => {
    setLessons((prev) =>
      prev.map((l) => (l.selected ? { ...l, lesson_date: shiftDateToWeekday(l.lesson_date, defaultWeekday) } : l))
    );
    if (conflicts.length) setConflicts([]);
  };

  const createManualClass = async () => {
    setCreateMsg("");
    setMsg("");
    setConflicts([]);

    if (!studentId) return setCreateMsg("수강생 선택 누락");
    if (!lessons.length) return setCreateMsg("회차가 없습니다.");

    for (const l of lessons) {
      if (!l.lesson_date) return setCreateMsg(`${l.idx}회차 날짜 선택 누락`);
      if (!l.teacher_id) return setCreateMsg(`${l.idx}회차 강사 선택 누락`);
      if (!l.lesson_time) return setCreateMsg(`${l.idx}회차 시간 선택 누락`);
      if (!l.room_id) return setCreateMsg(`${l.idx}회차 룸 선택 누락`);
    }

    const firstDate = correctedFirstDate(startDate, weekday);
    const endDate = [...lessons]
    .map(l => l.lesson_date)
    .sort()
    .slice(-1)[0];

    const res = await authFetch("/api/admin/create-class-manual", {
      method: "POST",
      body: JSON.stringify({
        studentId,
        type: classType,
        deviceType,
        weekday,
        startDate: firstDate,
        endDate,
        lessons: lessons.map((l) => ({
          lesson_date: l.lesson_date,
          lesson_time: l.lesson_time,
          room_id: l.room_id,
          teacher_id: l.teacher_id,
        })),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok && Array.isArray(data.details)) {
      setConflicts(data.details as ConflictDetail[]);
      const firstIdx = (data.details as ConflictDetail[])[0]?.idx;
      if (firstIdx) scrollToConflict(firstIdx);
      setCreateMsg("충돌/검증 실패: 표시된 회차를 수정해 주세요.");
      return;
    }

    if (!res.ok) {
      setCreateMsg(data.error ?? "수강권 생성 실패");
      return;
    }

    setCreateMsg(`수강권 생성 완료! classId=${data.classId}`);
  };

  return (
    <AdminLayoutShell title="수강권 생성 (수동 배정)">
      <div style={{ width: "100%", maxWidth: 1100, minWidth: 0 }}>
        {/* 1) 기본 정보 */}
        <section style={{ ...boxStyle, padding: isMobile ? 14 : undefined }}>
          <div style={sectionTitle}>1) 기본 정보</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0, 1fr))",
              gap: 10,
              marginTop: 12,
            }}
          >
            <Field label="수강생 선택">
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                style={{ ...inputStyle, width: "100%", minWidth: 0 }}
                disabled={loadingUsers || students.length === 0}
              >
                {loadingUsers ? (
                  <option value="">불러오는 중...</option>
                ) : students.length === 0 ? (
                  <option value="">수강생 없음</option>
                ) : (
                  sortedStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {studentLabel(s)}
                    </option>
                  ))
                )}
              </select>
            </Field>

            <Field label="수강권 타입">
              <select
                value={classType}
                onChange={(e) => setClassType(e.target.value as ClassType)}
                style={{ ...inputStyle, width: "100%" }}
              >
                <option value="1month">1개월 (4회)</option>
                <option value="3month">3개월 (12회)</option>
              </select>
            </Field>

            <Field label="기기">
              <select
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value as DeviceType)}
                style={{ ...inputStyle, width: "100%" }}
              >
                <option value="controller">컨트롤러</option>
                <option value="turntable">턴테이블</option>
              </select>
            </Field>

            <Field label="시작일(startDate)">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
              />
            </Field>

            <Field label="기본 요일(초기 회차 생성용)">
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                style={{ ...inputStyle, width: "100%" }}
              >
                {weekdayLabel.map((d, idx) => (
                  <option key={idx} value={idx}>
                    {d}요일
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ marginTop: 10, color: colors.textSub, fontSize: 12, lineHeight: 1.6 }}>
            • 회차별로 <b>날짜(요일)/강사/시간/룸</b>을 직접 선택합니다.<br />
            • 시간 선택은 <b>1시간 단위(정각)</b>입니다.
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

        {/* 2) 회차별 배정 */}
        <section style={{ ...boxStyle, marginTop: 14, padding: isMobile ? 14 : undefined }}>
          <div style={sectionTitle}>2) 회차별 배정</div>

          <div
            style={{
              marginTop: 10,
              display: "grid",
              gap: 12,
            }}
          >
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: "#fafafa",
                border: `1px solid ${colors.border}`,
                color: colors.text,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              선택된 회차: <b>{selectedCount}</b> / {lessons.length}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                gap: 10,
                alignItems: "end",
              }}
            >
              <Field label="기본 강사">
                <select
                  value={defaultTeacherId}
                  onChange={(e) => setDefaultTeacherId(e.target.value)}
                  style={{ ...inputStyle, width: "100%", minWidth: 0 }}
                  disabled={loadingUsers || teachers.length === 0}
                >
                  {teachers.length === 0 ? (
                    <option value="">강사 없음</option>
                  ) : (
                    teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {teacherLabel(t)}
                      </option>
                    ))
                  )}
                </select>
              </Field>

              <Field label="기본 시간">
                <select
                  value={defaultTime}
                  onChange={(e) => setDefaultTime(e.target.value)}
                  style={{ ...inputStyle, width: "100%" }}
                >
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="기본 룸">
                <select
                  value={defaultRoomId}
                  onChange={(e) => setDefaultRoomId(e.target.value)}
                  style={{ ...inputStyle, width: "100%", minWidth: 0 }}
                  disabled={loadingRooms || rooms.length === 0}
                >
                  {loadingRooms ? (
                    <option value="">불러오는 중...</option>
                  ) : rooms.length === 0 ? (
                    <option value="">룸 없음</option>
                  ) : (
                    rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))
                  )}
                </select>
              </Field>

              <Field label="선택회차 요일">
                <select
                  value={defaultWeekday}
                  onChange={(e) => setDefaultWeekday(Number(e.target.value))}
                  style={{ ...inputStyle, width: "100%" }}
                >
                  {weekdayLabel.map((d, idx) => (
                    <option key={idx} value={idx}>
                      {d}요일
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, max-content)",
                gap: 8,
                alignItems: "center",
              }}
            >
              <button style={{ ...secondaryButton, width: "100%" }} onClick={() => setAllSelected(!allSelected)}>
                {allSelected ? "전체 해제" : "전체 선택"}
              </button>
              <button
                style={{ ...secondaryButton, width: "100%" }}
                onClick={applyTeacherToSelected}
                disabled={selectedCount === 0 || !defaultTeacherId}
              >
                선택회차 강사 적용
              </button>
              <button
                style={{ ...secondaryButton, width: "100%" }}
                onClick={applyTimeToSelected}
                disabled={selectedCount === 0 || !defaultTime}
              >
                선택회차 시간 적용
              </button>
              <button
                style={{ ...secondaryButton, width: "100%" }}
                onClick={applyRoomToSelected}
                disabled={selectedCount === 0 || !defaultRoomId}
              >
                선택회차 룸 적용
              </button>
              <button
                style={{ ...secondaryButton, width: "100%" }}
                onClick={applyWeekdayToSelected}
                disabled={selectedCount === 0}
              >
                선택회차 요일 적용
              </button>
            </div>
          </div>

          {lessons.length === 0 ? (
            <p style={{ marginTop: 10, color: colors.text }}>회차가 없습니다.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {isMobile ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {lessons.map((l) => (
                    <div
                      key={l.idx}
                      id={`lesson-row-${l.idx}`}
                      style={{
                        border: hasConflict(l.idx) ? "1px solid #f5c2c2" : `1px solid ${colors.border}`,
                        background: hasConflict(l.idx) ? "#fff5f5" : "#fff",
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
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
                          <input
                            type="checkbox"
                            checked={l.selected}
                            onChange={() => updateLesson(l.idx, { selected: !l.selected })}
                          />
                          {hasConflict(l.idx) ? "❗ " : ""}
                          {l.idx}회차
                        </label>

                        <span style={{ fontSize: 12, color: colors.textSub }}>
                          {l.lesson_date} ({weekdayLabel[weekdayOf(l.lesson_date)]})
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        <Field label="날짜">
                        <input
                          type="date"
                          value={l.lesson_date}
                          onChange={(e) =>
                            updateLesson(l.idx, { lesson_date: e.target.value })
                          }
                          style={inputStyle}
                        />
                      </Field>

                        <Field label="시간">
                          <select
                            value={l.lesson_time}
                            onChange={(e) => updateLesson(l.idx, { lesson_time: e.target.value })}
                            style={{ ...inputStyle, width: "100%" }}
                          >
                            {timeOptions.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>

                      <Field label="강사">
                        <select
                          value={l.teacher_id}
                          onChange={(e) => updateLesson(l.idx, { teacher_id: e.target.value })}
                          style={{ ...inputStyle, width: "100%" }}
                        >
                          <option value="">선택</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {teacherLabel(t)}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="룸">
                        <select
                          value={l.room_id}
                          onChange={(e) => updateLesson(l.idx, { room_id: e.target.value })}
                          style={{ ...inputStyle, width: "100%" }}
                          disabled={loadingRooms || rooms.length === 0}
                        >
                          <option value="">룸 선택</option>
                          {rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </Field>

                      {hasConflict(l.idx) && (
                        <div
                          style={{
                            border: "1px solid #f5c2c2",
                            background: "#fff0f0",
                            borderRadius: 10,
                            padding: 10,
                            color: "#b42318",
                            fontSize: 13,
                          }}
                        >
                          <b>❗ {l.idx}회차 문제</b>
                          <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                            {(conflictMap.get(l.idx)?.reasons ?? []).map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: "left",
                            padding: 10,
                            borderBottom: `1px solid ${colors.border}`,
                            color: colors.text,
                          }}
                        >
                          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={(e) => setAllSelected(e.target.checked)}
                            />
                            선택
                          </label>
                        </th>
                        {["회차", "날짜(수정 가능)", "강사", "시간(정각)", "룸"].map((h) => (
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
                      {lessons.map((l) => (
                        <>
                          <tr
                            key={l.idx}
                            id={`lesson-row-${l.idx}`}
                            style={{
                              background: hasConflict(l.idx) ? "#fff5f5" : undefined,
                            }}
                          >
                            <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                              <input
                                type="checkbox"
                                checked={l.selected}
                                onChange={() => updateLesson(l.idx, { selected: !l.selected })}
                              />
                            </td>

                            <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", color: colors.text }}>
                              {hasConflict(l.idx) ? "❗ " : ""}
                              {l.idx}회차
                            </td>

                            <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", color: colors.text }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <input
                                type="date"
                                value={l.lesson_date}
                                onChange={(e) =>
                                  updateLesson(l.idx, { lesson_date: e.target.value })
                                }
                                style={{ ...inputStyle, width: 160 }}
                              />

                              <span style={{ color: colors.textMuted, fontSize: 12 }}>
                                {weekdayLabel[weekdayOf(l.lesson_date)]}요일
                              </span>
                            </div>
                            </td>

                            <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                              <select
                                value={l.teacher_id}
                                onChange={(e) => updateLesson(l.idx, { teacher_id: e.target.value })}
                                style={{ ...inputStyle, minWidth: 220 }}
                              >
                                <option value="">선택</option>
                                {teachers.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {teacherLabel(t)}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                              <select
                                value={l.lesson_time}
                                onChange={(e) => updateLesson(l.idx, { lesson_time: e.target.value })}
                                style={{ ...inputStyle, width: 120 }}
                              >
                                {timeOptions.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                              <select
                                value={l.room_id}
                                onChange={(e) => updateLesson(l.idx, { room_id: e.target.value })}
                                style={{ ...inputStyle, minWidth: 160 }}
                                disabled={loadingRooms || rooms.length === 0}
                              >
                                <option value="">룸 선택</option>
                                {rooms.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>

                          {hasConflict(l.idx) && (
                            <tr>
                              <td colSpan={6} style={{ padding: 10 }}>
                                <div
                                  style={{
                                    border: "1px solid #f5c2c2",
                                    background: "#fff0f0",
                                    borderRadius: 8,
                                    padding: 10,
                                    color: "#b42318",
                                    fontSize: 13,
                                  }}
                                >
                                  <b>❗ {l.idx}회차 문제</b>
                                  <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                                    {(conflictMap.get(l.idx)?.reasons ?? []).map((r, i) => (
                                      <li key={i}>{r}</li>
                                    ))}
                                  </ul>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={createManualClass}
                    style={{ ...primaryButton, width: isMobile ? "100%" : "auto" }}
                    disabled={loadingUsers || lessons.length === 0}
                  >
                    수강권 생성
                  </button>
                  {createMsg && <span style={{ color: colors.text }}>{createMsg}</span>}
                </div>

                {conflicts.length > 0 && (
                  <div style={{ color: "#b42318", fontSize: 13 }}>
                    충돌/검증 실패가 있습니다. 빨간색 회차를 수정한 뒤 다시 저장하세요.
                  </div>
                )}
              </div>
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