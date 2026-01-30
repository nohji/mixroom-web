"use client";

import { useEffect, useMemo, useState } from "react";
import StudentShell from "@/components/StudentShell";
import { authFetch } from "@/lib/authFetch";
import {
  boxStyle,
  inputStyle,
  primaryButton,
  secondaryButton,
  pageTitle,
  sectionTitle,
  colors,
} from "@/styles/ui";

type MyLesson = {
  id: string;
  lesson_date: string;
  lesson_time: string;
  status: string;
  allow_change_override: boolean;
  teacher_id: string | null;
};

type Slot = { date: string; time: string };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysStr(base: string, days: number) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StudentLessonChangePage() {
  const [myLessons, setMyLessons] = useState<MyLesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);

  const [selectedLessonId, setSelectedLessonId] = useState("");
  const selectedLesson = useMemo(
    () => myLessons.find((l) => l.id === selectedLessonId) ?? null,
    [myLessons, selectedLessonId]
  );

  const [from, setFrom] = useState(addDaysStr(todayStr(), 1));
  const [to, setTo] = useState(addDaysStr(todayStr(), 30));

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const loadMyLessons = async () => {
    setLoadingLessons(true);
    const qs = new URLSearchParams();
    qs.set("from", todayStr());
    const res = await authFetch(`/api/student/my-lessons?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "내 레슨 조회 실패");
      setMyLessons([]);
    } else {
      setMyLessons(data.rows ?? []);
    }
    setLoadingLessons(false);
  };

  const loadSlots = async (teacherId: string) => {
    setLoadingSlots(true);

    const qs = new URLSearchParams();
    qs.set("teacherId", teacherId);
    qs.set("from", from);
    qs.set("to", to);

    const res = await authFetch(`/api/student/available-slots?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "가능 슬롯 조회 실패");
      setSlots([]);
    } else {
      setSlots(data.rows ?? []);
    }
    setLoadingSlots(false);
  };

  useEffect(() => {
    loadMyLessons();
  }, []);

  useEffect(() => {
    if (!selectedLessonId) return;
    if (!selectedLesson?.teacher_id) {
      setSlots([]);
      setLoadingSlots(false);
      alert("담당 강사 정보가 없어요. (classes.teacher_id 확인 필요)");
      return;
    }
    loadSlots(selectedLesson.teacher_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLessonId]);

  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s.time);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort();
      map.set(k, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [slots]);

  const submit = async () => {
    if (!selectedLessonId) return alert("변경할 레슨(회차)을 먼저 선택해줘!");
    if (!selectedDate || !selectedTime) return alert("변경할 날짜/시간을 선택해줘!");

    const res = await authFetch("/api/student/request-lesson-change", {
      method: "POST",
      body: JSON.stringify({
        lessonId: selectedLessonId,
        to_date: selectedDate,
        to_time: selectedTime,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error ?? "변경 요청 실패");

    alert("변경 요청 완료! (승인 대기)");
    setSelectedDate("");
    setSelectedTime("");
  };

  return (
    <StudentShell title="레슨 변경 요청">
      <div style={{ maxWidth: 980, color: "#111" }}>
        <h3 style={{ ...pageTitle, marginTop: 0 }}>레슨 변경 요청</h3>

        <div style={{ ...boxStyle, marginTop: 12 }}>
          <div style={sectionTitle}>1) 변경할 레슨(회차) 선택</div>

          {loadingLessons ? (
            <p style={{ color: colors.textSub }}>내 레슨 불러오는 중...</p>
          ) : myLessons.length === 0 ? (
            <p style={{ color: colors.textSub }}>앞으로 예정된 레슨이 없어.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {myLessons.map((l) => {
                const active = l.id === selectedLessonId;
                return (
                  <button
                    key={l.id}
                    onClick={() => {
                      setSelectedLessonId(l.id);
                      setSelectedDate("");
                      setSelectedTime("");
                    }}
                    style={active ? primaryButton : secondaryButton}
                  >
                    {l.lesson_date} {l.lesson_time}
                  </button>
                );
              })}
            </div>
          )}

          {selectedLesson && (
            <div style={{ marginTop: 10, color: colors.textSub }}>
              선택됨: <b style={{ color: "#111" }}>{selectedLesson.lesson_date} {selectedLesson.lesson_time}</b>
            </div>
          )}
        </div>

        <div style={{ ...boxStyle, marginTop: 12 }}>
          <div style={sectionTitle}>2) 가능한 변경 시간 찾기</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <label>
              from{" "}
              <input style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              to{" "}
              <input style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>

            <button
              onClick={() => {
                if (!selectedLesson?.teacher_id) return alert("레슨을 먼저 선택해줘!");
                loadSlots(selectedLesson.teacher_id);
              }}
              style={secondaryButton}
            >
              기간 조회
            </button>
          </div>
        </div>

        <div style={{ ...boxStyle, marginTop: 12 }}>
          <div style={sectionTitle}>3) 날짜/시간 선택</div>

          {!selectedLessonId ? (
            <p style={{ color: colors.textSub, marginTop: 10 }}>위에서 레슨(회차)을 먼저 선택해줘!</p>
          ) : loadingSlots ? (
            <p style={{ color: colors.textSub, marginTop: 10 }}>가능한 시간 불러오는 중...</p>
          ) : grouped.length === 0 ? (
            <p style={{ color: colors.textSub, marginTop: 10 }}>선택한 기간에 가능한 시간이 없어.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, marginTop: 12 }}>
              {/* 날짜 */}
              <aside style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>날짜</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {grouped.map(([date]) => {
                    const active = date === selectedDate;
                    return (
                      <button
                        key={date}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedTime("");
                        }}
                        style={{
                          ...secondaryButton,
                          textAlign: "left",
                          background: active ? "#f5f5f5" : "#fff",
                        }}
                      >
                        {date}
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* 시간 */}
              <main style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>
                  시간 {selectedDate ? `(${selectedDate})` : ""}
                </div>

                {!selectedDate ? (
                  <p style={{ color: colors.textSub }}>왼쪽에서 날짜를 선택해줘!</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(grouped.find(([d]) => d === selectedDate)?.[1] ?? []).map((t) => {
                      const active = t === selectedTime;
                      return (
                        <button
                          key={t}
                          onClick={() => setSelectedTime(t)}
                          style={active ? primaryButton : secondaryButton}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div style={{ marginTop: 16 }}>
                  <button onClick={submit} style={primaryButton}>
                    선택한 시간으로 변경 요청
                  </button>
                </div>
              </main>
            </div>
          )}
        </div>
      </div>
    </StudentShell>
  );
}
