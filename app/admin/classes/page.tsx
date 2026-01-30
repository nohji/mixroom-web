// app/admin/classes/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";
import { boxStyle, inputStyle, primaryButton, secondaryButton, sectionTitle, colors } from "@/styles/ui";

type ClassType = "1month" | "3month";
type DeviceType = "controller" | "turntable";

type Candidate = {
  teacher_id: string;
  teacher_name: string;
  room_id: string;
  room_name: string;
  start_date: string;
  time: string;
  weekday: number;
  reason?: string;
};

type StudentOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function defaultStartDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toYMD(d);
}

function buildHourOptions(startHour = 9, endHour = 23) {
  const out: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
  }
  return out;
}

export default function AdminClassesPage() {
  const weekdayLabel = useMemo(() => ["일", "월", "화", "수", "목", "금", "토"], []);
  const timeOptions = useMemo(() => buildHourOptions(9, 23), []);

  // 학생 옵션
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // 선택/입력
  const [studentId, setStudentId] = useState("");
  const [classType, setClassType] = useState<ClassType>("1month");
  const [deviceType, setDeviceType] = useState<DeviceType>("controller");
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [weekday, setWeekday] = useState(3);
  const [time, setTime] = useState("19:00");

  // 후보
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [msg, setMsg] = useState("");
  const [createMsg, setCreateMsg] = useState("");

  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      // ✅ 기존 list-users API를 그대로 활용(프론트에서 학생만 필터)
      // (role=student 지원하면 더 좋지만, 일단 이대로도 충분)
      const qs = new URLSearchParams();
      qs.set("role", "student");
      const res = await authFetch(`/api/admin/list-users?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error ?? "수강생 목록 조회 실패");
        setStudents([]);
        return;
      }

      const rows = (data.rows ?? []) as any[];
      const onlyStudents: StudentOption[] = rows
        .filter((r) => r.role === "student")
        .map((r) => ({ id: r.id, name: r.name ?? null, phone: r.phone ?? null }));

      setStudents(onlyStudents);

      // 첫 로딩 시 자동 선택(옵션)
      if (!studentId && onlyStudents.length > 0) {
        setStudentId(onlyStudents[0].id);
      }
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCandidates = async () => {
    setMsg("");
    setCreateMsg("");
    setLoadingCandidates(true);
    setCandidates([]);

    try {
      if (!studentId) {
        setMsg("수강생을 선택해줘!");
        return;
      }
      if (!startDate) {
        setMsg("startDate를 입력해줘!");
        return;
      }
      if (weekday < 0 || weekday > 6) {
        setMsg("weekday가 올바르지 않아!");
        return;
      }
      if (!time) {
        setMsg("time을 선택해줘!");
        return;
      }

      const qs = new URLSearchParams();
      qs.set("studentId", studentId);
      qs.set("type", classType);
      qs.set("deviceType", deviceType);
      qs.set("startDate", startDate);
      qs.set("weekday", String(weekday));
      qs.set("time", time);

      const res = await authFetch(`/api/admin/class-candidates?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data.error ?? "후보 조회 실패");
        return;
      }

      const rows = (data.rows ?? []) as Candidate[];
      setCandidates(rows);

      if (rows.length === 0) {
        setMsg("조건에 맞는 후보가 없어. (강사 근무/기기/룸/충돌 확인)");
      }
    } finally {
      setLoadingCandidates(false);
    }
  };

  const createClassWithCandidate = async (cand: Candidate) => {
    setCreateMsg("");
    setMsg("");

    if (!studentId) {
      setCreateMsg("수강생 선택 누락");
      return;
    }

    const res = await authFetch("/api/admin/create-class", {
      method: "POST",
      body: JSON.stringify({
        studentId,
        type: classType,
        weekday: cand.weekday,
        time: cand.time,
        deviceType,
        teacherId: cand.teacher_id,
        roomId: cand.room_id,
        startDate: cand.start_date,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreateMsg(data.error ?? "수강권 생성 실패");
      return;
    }

    setCreateMsg(`수강권 생성 완료! classId=${data.classId}`);
  };

  const studentLabel = (s: StudentOption) => {
    const nm = s.name?.trim() ? s.name : "이름없음";
    const ph = s.phone?.trim() ? s.phone : "전화없음";
    return `${nm} (${ph})`;
  };

  return (
    <AdminLayoutShell title="수강권 생성 (후보 조회 → 확정)">
      <div style={{ maxWidth: 980 }}>
        {/* 1) 조건 입력 */}
        <section style={boxStyle}>
          <div style={sectionTitle}>1) 후보 조회 조건</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            {/* ✅ 수강생 선택 셀렉트 */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, color: colors.text }}>
              수강생 선택
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                style={{ ...inputStyle, minWidth: 280 }}
                disabled={loadingStudents || students.length === 0}
              >
                {loadingStudents ? (
                  <option value="">불러오는 중...</option>
                ) : students.length === 0 ? (
                  <option value="">수강생 없음</option>
                ) : (
                  students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {studentLabel(s)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, color: colors.text }}>
              수강권 타입
              <select value={classType} onChange={(e) => setClassType(e.target.value as ClassType)} style={inputStyle}>
                <option value="1month">1개월 (4회 / 4주)</option>
                <option value="3month">3개월 (12회 / 13주)</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, color: colors.text }}>
              기기
              <select value={deviceType} onChange={(e) => setDeviceType(e.target.value as DeviceType)} style={inputStyle}>
                <option value="controller">컨트롤러</option>
                <option value="turntable">턴테이블</option>
              </select>
            </label>

            {/* ✅ startDate만 */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, color: colors.text }}>
              시작일(startDate)
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, color: colors.text }}>
              선호 요일
              <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} style={inputStyle}>
                {weekdayLabel.map((d, idx) => (
                  <option key={idx} value={idx}>
                    {d}요일
                  </option>
                ))}
              </select>
            </label>

            {/* ✅ 시간 입력 → 1시간 단위 셀렉트 */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, color: colors.text }}>
              선호 시간(1시간 단위)
              <select value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                {timeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button onClick={loadCandidates} style={primaryButton} disabled={loadingCandidates || loadingStudents}>
                {loadingCandidates ? "후보 찾는 중..." : "후보 조회"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 10, color: colors.textSub, fontSize: 12, lineHeight: 1.5 }}>
            • 기간은 <b>startDate 기준</b>으로 자동 계산돼요. (1개월=4주, 3개월=13주) <br />
            • 시간은 1시간 단위로 선택해요. (나중에 slot_minutes 기반으로 30분 단위도 가능)
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

        {/* 2) 후보 리스트 */}
        <section style={{ ...boxStyle, marginTop: 14 }}>
          <div style={sectionTitle}>2) 후보 리스트</div>

          {loadingCandidates ? (
            <p style={{ marginTop: 10, color: colors.text }}>후보 불러오는 중...</p>
          ) : candidates.length === 0 ? (
            <p style={{ marginTop: 10, color: colors.text }}>후보가 없습니다.</p>
          ) : (
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["강사", "룸", "첫 레슨", "참고", "확정"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: 10,
                          borderBottom: `1px solid ${colors.border}`,
                          color: colors.text,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, idx) => (
                    <tr key={`${c.teacher_id}-${c.room_id}-${idx}`}>
                      <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", color: colors.text }}>
                        {c.teacher_name}{" "}
                        <span style={{ color: colors.textMuted, fontSize: 12 }}>({c.teacher_id})</span>
                      </td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", color: colors.text }}>
                        {c.room_name}{" "}
                        <span style={{ color: colors.textMuted, fontSize: 12 }}>({c.room_id})</span>
                      </td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", color: colors.text }}>
                        <b>{c.start_date}</b> {c.time} ({weekdayLabel[c.weekday]}요일)
                      </td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0", color: colors.text }}>
                        {c.reason ?? "-"}
                      </td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                        <button onClick={() => createClassWithCandidate(c)} style={secondaryButton}>
                          이 후보로 생성
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {createMsg && <p style={{ marginTop: 10, color: colors.text }}>{createMsg}</p>}
            </div>
          )}
        </section>
      </div>
    </AdminLayoutShell>
  );
}
