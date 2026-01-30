"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";

type LessonRow = {
  id: string;
  lesson_date: string; // YYYY-MM-DD
  lesson_time: string; // HH:mm or HH:mm:ss
  status: string;
  allow_change_override: boolean;

  teacher_id: string | null;
  teacher_name: string;
  student_id: string | null;
  student_name: string;

  room_id: string | null;
  room_name: string;

  device_type: string | null; // ✅ 이번 UI에서는 안 보여줌
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday start
  return d;
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function clampHHMM(t: string) {
  if (!t) return "";
  return t.slice(0, 5);
}
function minutesOf(t: string) {
  const hhmm = clampHHMM(t);
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const DOW_KR = ["일", "월", "화", "수", "목", "금", "토"];

function statusColor(status: string) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("요청") || s.includes("pending")) return { bg: "#fff1d6", fg: "#7a4b00", bd: "#ffd79a" };
  if (s.includes("취소") || s.includes("cancel")) return { bg: "#f3f3f3", fg: "#666", bd: "#e5e5e5" };
  if (s.includes("완료") || s.includes("changed") || s.includes("done")) return { bg: "#e7f6ff", fg: "#0b4f6c", bd: "#bfe8ff" };
  return { bg: "#111", fg: "#fff", bd: "#111" };
}

export default function AdminLessonsHallSheetPage() {
  /** ====== UI constants (사진 느낌) ====== */
  const TIME_W = 110;
  const COL_W = 170;          // 홀 컬럼 너비
  const HEAD_H1 = 44;         // 요일 헤더
  const HEAD_H2 = 36;         // 홀 헤더
  const ROW_H = 38;           // 30분 row height (스프레드시트 느낌)
  const STEP_MIN = 30;        // ✅ 30분 단위
  const DEFAULT_DURATION = 60; // ✅ 현재 시스템 60분 고정 (추후 DB에서 가져오면 됨)

  const [weekStart, setWeekStart] = useState(() => ymd(startOfWeek(new Date())));
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLessonId, setSelectedLessonId] = useState("");
  const selectedLesson = useMemo(
    () => lessons.find((l) => l.id === selectedLessonId) ?? null,
    [lessons, selectedLessonId]
  );

  const week = useMemo(() => {
    const ws = parseYmd(weekStart);
    const days = Array.from({ length: 7 }).map((_, i) => addDays(ws, i));
    return { days, from: ymd(days[0]), to: ymd(days[6]) };
  }, [weekStart]);

  const load = async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("from", week.from);
    qs.set("to", week.to);

    const res = await authFetch(`/api/admin/lessons?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "레슨 현황 조회 실패");
      setLessons([]);
      setLoading(false);
      return;
    }
    // ✅ 네 API는 lessons/availability 둘 다 줄 수도 있지만 여기선 lessons만 사용
    setLessons((data.lessons ?? data.rows ?? []) as LessonRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  /** ====== rooms(홀) 구성 ======
   * 사진처럼 A/B/C처럼 고정이면 그걸로 쓰면 되고, **/
  const rooms = ["A", "B", "C"] as const;


  /** ====== 타임 레인지(30분 그리드) ====== */
  const timeRange = useMemo(() => {
    let minM = 12 * 60; // 기본 12:00
    let maxM = 23 * 60; // 기본 23:00

    if (lessons.length > 0) {
      minM = 24 * 60;
      maxM = 0;
      lessons.forEach((l) => {
        const st = minutesOf(l.lesson_time);
        const ed = st + DEFAULT_DURATION;
        minM = Math.min(minM, st);
        maxM = Math.max(maxM, ed);
      });

      // 보기 좋게 30분 단위로 반올림
      minM = Math.floor(minM / STEP_MIN) * STEP_MIN;
      maxM = Math.ceil(maxM / STEP_MIN) * STEP_MIN;

      // 너무 좁으면 기본 범위 적용
      if (maxM - minM < 6 * 60) {
        minM = Math.min(minM, 12 * 60);
        maxM = Math.max(maxM, 23 * 60);
      }
    }

    return { minM, maxM };
  }, [lessons]);

  const slotTimes = useMemo(() => {
    const arr: string[] = [];
    for (let m = timeRange.minM; m < timeRange.maxM; m += STEP_MIN) {
      arr.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
    }
    return arr;
  }, [timeRange]);

  /** ====== 컬럼(요일×홀) ====== */
  type Col = { dateStr: string; labelDay: string; room: string };
  const cols = useMemo<Col[]>(() => {
    const out: Col[] = [];
    week.days.forEach((d) => {
      const dateStr = ymd(d);
      const labelDay = `${DOW_KR[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
      rooms.forEach((room) => out.push({ dateStr, labelDay, room }));
    });
    return out;
  }, [week.days, rooms]);

  /** ====== 레슨을 grid 위치로 변환 ====== */
  type PlacedLesson = LessonRow & {
    colIndex: number; // 0-based (cols)
    rowStart: number; // 1-based (grid row start)
    rowSpan: number;  // rows to span
  };

  const placedLessons = useMemo<PlacedLesson[]>(() => {
    const mapCol = new Map<string, number>();
    cols.forEach((c, idx) => mapCol.set(`${c.dateStr}|${c.room}`, idx));

    const out: PlacedLesson[] = [];
    lessons.forEach((l) => {
      const room = l.room_name ?? "미지정";
      const colIndex = mapCol.get(`${l.lesson_date}|${room}`);
      if (colIndex === undefined) return;

      const stMin = minutesOf(l.lesson_time);
      const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1; // 1-based
      const rowSpan = Math.max(1, Math.round(DEFAULT_DURATION / STEP_MIN)); // 60/30=2

      out.push({ ...l, colIndex, rowStart, rowSpan });
    });

    return out;
  }, [lessons, cols, timeRange]);

  const goPrevWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() - 7);
    setSelectedLessonId("");
    setWeekStart(ymd(startOfWeek(d)));
  };
  const goNextWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() + 7);
    setSelectedLessonId("");
    setWeekStart(ymd(startOfWeek(d)));
  };
  const goThisWeek = () => {
    setSelectedLessonId("");
    setWeekStart(ymd(startOfWeek(new Date())));
  };

  /** ====== Grid template ====== */
  const gridColsTemplate = useMemo(() => {
    // TIME + (요일×홀)
    return `${TIME_W}px repeat(${cols.length}, ${COL_W}px)`;
  }, [cols.length]);

  return (
    <AdminLayoutShell title="레슨 현황 (주간 · 홀별 · 스프레드시트)">
      <div style={{ maxWidth: 1600 }}>
        {/* Controls */}
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
          <div style={{ fontWeight: 900 }}>홀별 주간표</div>

          <button
            onClick={goPrevWeek}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 }}
          >
            ◀
          </button>
          <div style={{ fontWeight: 900 }}>
            {week.from} ~ {week.to}
          </div>
          <button
            onClick={goNextWeek}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 }}
          >
            ▶
          </button>
          <button
            onClick={goThisWeek}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 }}
          >
            이번주
          </button>
          <button
            onClick={load}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 900 }}
          >
            새로고침
          </button>

          <div style={{ marginLeft: "auto", color: "#666", fontSize: 13 }}>
            * 기기타입은 숨김 · 가로스크롤 OK · 블록 클릭=상세
          </div>
        </div>

        {/* Sheet */}
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
            overflow: "auto", // ✅ 가로 스크롤
            height: "calc(100vh - 220px)",
          }}
        >
          {/* Sticky headers container */}
          <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#fff" }}>
            {/* Header row 1: Day */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridColsTemplate,
                borderBottom: "1px solid #eee",
              }}
            >
              {/* top-left */}
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 60,
                  height: HEAD_H1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  color: "#666",
                  background: "#fff",
                  borderRight: "1px solid #eee",
                }}
              >
                시간/홀
              </div>

              {/* day groups */}
              {week.days.map((d) => {
                const dateStr = ymd(d);
                const labelDay = `${DOW_KR[d.getDay()]}(${d.getDate()})`;
                const isToday = dateStr === ymd(new Date());

                return (
                  <div
                    key={dateStr}
                    style={{
                      gridColumn: `span ${rooms.length}`,
                      height: HEAD_H1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      background: isToday ? "#111" : "#fafafa",
                      color: isToday ? "#fff" : "#111",
                      borderRight: "1px solid #eee",
                    }}
                  >
                    {labelDay}
                  </div>
                );
              })}
            </div>

            {/* Header row 2: Rooms */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridColsTemplate,
                borderBottom: "1px solid #eee",
              }}
            >
              {/* left blank */}
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 60,
                  height: HEAD_H2,
                  background: "#fff",
                  borderRight: "1px solid #eee",
                }}
              />

              {cols.map((c, idx) => (
                <div
                  key={`${c.dateStr}|${c.room}|${idx}`}
                  style={{
                    height: HEAD_H2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    background: "#fff",
                    borderRight: "1px solid #f0f0f0",
                    color: "#111",
                  }}
                >
                  {c.room}
                </div>
              ))}
            </div>
          </div>

          {/* Body: time grid + lessons as spanning blocks */}
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: gridColsTemplate,
              gridTemplateRows: `repeat(${slotTimes.length}, ${ROW_H}px)`,
            }}
          >
            {/* Time column cells */}
            {slotTimes.map((t, rIdx) => (
              <div
                key={`time-${t}`}
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 40,
                  gridColumn: 1,
                  gridRow: rIdx + 1,
                  background: "#fff",
                  borderRight: "1px solid #eee",
                  borderBottom: "1px solid #f3f3f3",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 12,
                  color: "#555",
                }}
              >
                {t}
              </div>
            ))}

            {/* Background grid cells (for lines) */}
            {cols.map((c, cIdx) =>
              slotTimes.map((_, rIdx) => (
                <div
                  key={`bg-${cIdx}-${rIdx}`}
                  style={{
                    gridColumn: cIdx + 2, // + time column
                    gridRow: rIdx + 1,
                    borderBottom: "1px solid #f3f3f3",
                    borderRight: "1px solid #f3f3f3",
                    background: rIdx % 2 === 0 ? "#fff" : "#fcfcfc", // 살짝 교차 라인 느낌
                  }}
                />
              ))
            )}

            {/* Lesson blocks */}
            {placedLessons.map((l) => {
              const c = statusColor(l.status);
              const isActive = selectedLessonId === l.id;

              // 표시 텍스트(기기 숨김)
              const title1 = `${l.student_name}`;
              const title2 = `${l.teacher_name}`;

              return (
                <button
                  key={l.id}
                  onClick={() => setSelectedLessonId(l.id)}
                  style={{
                    gridColumn: l.colIndex + 2, // time col 다음부터
                    gridRow: `${l.rowStart} / span ${l.rowSpan}`,
                    margin: 4,
                    borderRadius: 10,
                    border: `1px solid ${c.bd}`,
                    background: c.bg,
                    color: c.fg,
                    cursor: "pointer",
                    textAlign: "left",
                    padding: 10,
                    display: "grid",
                    gap: 6,
                    boxShadow: isActive ? "0 0 0 2px rgba(0,0,0,0.18)" : "none",
                    outline: isActive ? "2px solid #111" : "none",
                    outlineOffset: 0,
                  }}
                  title={`${l.lesson_date} ${clampHHMM(l.lesson_time)} / ${l.room_name}`}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 13,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {title1}
                    <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.85 }}>{l.status}</span>
                  </div>

                  <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.95 }}>{title2}</div>

                  {l.allow_change_override ? (
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#7a4b00" }}>예외ON</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div style={{ marginTop: 12 }}>
          {!selectedLesson ? (
            <div style={{ color: "#666", fontSize: 13 }}>블록 클릭하면 상세가 보여요.</div>
          ) : (
            <div style={{ border: "1px solid #eee", borderRadius: 12, background: "#fff", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <b>
                  {selectedLesson.lesson_date} {clampHHMM(selectedLesson.lesson_time)} · {selectedLesson.room_name}
                </b>
                <button
                  onClick={() => setSelectedLessonId("")}
                  style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontWeight: 900 }}
                >
                  선택 해제
                </button>
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13 }}>
                <div>
                  상태: <b>{selectedLesson.status}</b>
                </div>
                <div>
                  강사: <b>{selectedLesson.teacher_name}</b>
                </div>
                <div>
                  수강생: <b>{selectedLesson.student_name}</b>
                </div>
                {selectedLesson.allow_change_override ? (
                  <div>
                    <span style={{ padding: "4px 8px", borderRadius: 999, background: "#fff1d6", color: "#7a4b00", fontWeight: 900, fontSize: 12 }}>
                      예외ON
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayoutShell>
  );
}
