"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TeacherShell from "@/components/TeacherShell";
import { authFetch } from "@/lib/authFetch";

type LessonRow = {
  id: string;
  lesson_date: string;
  lesson_time: string; // "HH:mm"
  status: string;
  allow_change_override: boolean;

  teacher_id: string | null;
  room_id: string | null;
  room_name: string;

  student_id: string | null;
  student_name: string; // my: 실명 / other: "수업 있음"

  device_type: "controller" | "turntable" | "both" | null;
};

type AvailabilityRow = {
  teacher_id: string;
  teacher_name: string;
  date: string; // YYYY-MM-DD
  weekday: number; // 0=Sun..6=Sat
  start_time: string; // HH:mm:ss or HH:mm
  end_time: string;
  device_type: "controller" | "turntable" | "both";
};

type PracticeRow = {
  id: string;
  room_id: string | null;
  room_name: string;

  date: string | null; // YYYY-MM-DD
  start_time: string | null; // HH:mm
  end_time: string | null; // HH:mm

  start_ts: string | null;
  end_ts: string | null;

  student_id: string | null;
  student_name: string;
  status: string; // APPROVED
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
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function clampHHMM(t: string) {
  if (!t) return "";
  return String(t).slice(0, 5);
}
function minutesOf(t: string) {
  const hhmm = clampHHMM(t);
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
const DOW_KR = ["일", "월", "화", "수", "목", "금", "토"];

function normalizeRoom(roomName: string | null | undefined): "A" | "B" | "C" {
  const s = String(roomName ?? "").trim().toUpperCase();
  if (s === "A" || s === "B" || s === "C") return s as "A" | "B" | "C";
  if (s.includes("A")) return "A";
  if (s.includes("B")) return "B";
  if (s.includes("C")) return "C";
  return "A";
}
function slotKey(date: string, time: string, roomNorm: "A" | "B" | "C") {
  return `${date}|${clampHHMM(time)}|${roomNorm}`;
}

export default function TeacherScheduleBoardPage() {
  // ===== layout tuning =====
  const TIME_W = 105;
  const AVAIL_W = 74; // 근무 도트 컬럼
  const COL_W = 100;

  const HEAD_H1 = 46;
  const HEAD_H2 = 40;
  const ROW_H = 38;

  const STEP_MIN = 60;
  const DEFAULT_DURATION = 60;

  const rooms = ["A", "B", "C"] as const;

  // 💙 내 레슨 블루
  const MY_BLUE = "#2563eb";

  const [weekStart, setWeekStart] = useState(() => ymd(startOfWeek(new Date())));
  const [myLessons, setMyLessons] = useState<LessonRow[]>([]);
  const [otherLessons, setOtherLessons] = useState<LessonRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [practice, setPractice] = useState<PracticeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDow, setSelectedDow] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<string>("");

  const week = useMemo(() => {
    const ws = parseYmd(weekStart);
    const days = Array.from({ length: 7 }).map((_, i) => addDays(ws, i));
    return { days, from: ymd(days[0]), to: ymd(days[6]) };
  }, [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("from", week.from);
    qs.set("to", week.to);

    const res = await authFetch(`/api/teacher/schedule?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error ?? "스케줄 조회 실패");
      setMyLessons([]);
      setOtherLessons([]);
      setAvailability([]);
      setPractice([]);
      setLoading(false);
      return;
    }

    setMyLessons((data.my_lessons ?? data.lessons ?? []) as LessonRow[]);
    setOtherLessons((data.other_lessons ?? []) as LessonRow[]);
    setAvailability((data.availability ?? []) as AvailabilityRow[]);
    setPractice((data.practice_reservations ?? []) as PracticeRow[]);
    setLoading(false);
  }, [week.from, week.to]);

  useEffect(() => {
    load();
  }, [load]);

  // 포커스/복귀 새로고침
  useEffect(() => {
    const onFocus = () => load();
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const timeRange = useMemo(() => {
    let minM = 12 * 60;
    let maxM = 23 * 60;

    const mins: number[] = [];
    const maxs: number[] = [];

    [...myLessons, ...otherLessons].forEach((l) => {
      const st = minutesOf(l.lesson_time);
      const ed = st + DEFAULT_DURATION;
      if (Number.isFinite(st) && Number.isFinite(ed)) {
        mins.push(st);
        maxs.push(ed);
      }
    });

    availability.forEach((a) => {
      const st = minutesOf(clampHHMM(a.start_time));
      const ed = minutesOf(clampHHMM(a.end_time));
      if (Number.isFinite(st) && Number.isFinite(ed)) {
        mins.push(st);
        maxs.push(ed);
      }
    });

    if (mins.length > 0 && maxs.length > 0) {
      minM = Math.min(...mins);
      maxM = Math.max(...maxs);
    }

    minM = Math.floor(minM / STEP_MIN) * STEP_MIN;
    maxM = Math.ceil(maxM / STEP_MIN) * STEP_MIN;

    if (maxM - minM < 6 * 60) {
      minM = Math.min(minM, 12 * 60);
      maxM = Math.max(maxM, 23 * 60);
    }

    return { minM, maxM };
  }, [myLessons, otherLessons, availability]);

  const slotTimes = useMemo(() => {
    const arr: string[] = [];
    for (let m = timeRange.minM; m < timeRange.maxM; m += STEP_MIN) {
      arr.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
    }
    return arr;
  }, [timeRange]);

  // columns (date x room)
  type Col = { dateStr: string; room: (typeof rooms)[number] };
  const cols = useMemo<Col[]>(() => {
    const out: Col[] = [];
    week.days.forEach((d) => {
      const dateStr = ymd(d);
      rooms.forEach((room) => out.push({ dateStr, room }));
    });
    return out;
  }, [week.days]);

  // ---------- group by slot ----------
  const myLessonsBySlot = useMemo(() => {
    const m = new Map<string, LessonRow[]>();
    for (const l of myLessons) {
      const roomNorm = normalizeRoom(l.room_name);
      const k = slotKey(l.lesson_date, l.lesson_time, roomNorm);
      const arr = m.get(k) ?? [];
      arr.push(l);
      m.set(k, arr);
    }
    return m;
  }, [myLessons]);

  const otherLessonsBySlot = useMemo(() => {
    const m = new Map<string, LessonRow[]>();
    for (const l of otherLessons) {
      const roomNorm = normalizeRoom(l.room_name);
      const k = slotKey(l.lesson_date, l.lesson_time, roomNorm);
      const arr = m.get(k) ?? [];
      arr.push(l);
      m.set(k, arr);
    }
    return m;
  }, [otherLessons]);

  const practiceBySlot = useMemo(() => {
    const m = new Map<string, PracticeRow[]>();

    for (const p of practice) {
      if (!p.date || !p.start_time || !p.end_time) continue;
      const roomNorm = normalizeRoom(p.room_name);

      const stM = minutesOf(p.start_time);
      const edM = minutesOf(p.end_time);
      if (!Number.isFinite(stM) || !Number.isFinite(edM)) continue;
      if (edM <= stM) continue;

      for (let cur = stM; cur < edM; cur += STEP_MIN) {
        const t = `${pad2(Math.floor(cur / 60))}:${pad2(cur % 60)}`;
        const k = slotKey(p.date, t, roomNorm);
        const arr = m.get(k) ?? [];
        arr.push(p);
        m.set(k, arr);
      }
    }
    return m;
  }, [practice]);

  // ---------- availability dots (selected weekday only) ----------
  type AvailTeacher = { id: string; name: string };
  type AvailDetail = AvailTeacher & { ranges: { start: string; end: string }[] };

  const availByTimeForSelectedDow = useMemo(() => {
    if (selectedDow === null)
      return { byTime: new Map<string, AvailTeacher[]>(), detailByTeacherId: new Map<string, AvailDetail>() };

    const rows = availability.filter((a) => Number(a.weekday) === selectedDow);

    const detailByTeacherId = new Map<string, AvailDetail>();
    rows.forEach((a) => {
      const id = String(a.teacher_id);
      const name = String(a.teacher_name ?? "알 수 없음");
      const start = clampHHMM(a.start_time);
      const end = clampHHMM(a.end_time);

      const cur = detailByTeacherId.get(id) ?? { id, name, ranges: [] as { start: string; end: string }[] };
      cur.name = name;
      cur.ranges.push({ start, end });
      detailByTeacherId.set(id, cur);
    });

    detailByTeacherId.forEach((d) => {
      const ranges = d.ranges
        .filter((r) => r.start && r.end)
        .sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
      const merged: { start: string; end: string }[] = [];
      for (const r of ranges) {
        const last = merged[merged.length - 1];
        if (!last) merged.push({ ...r });
        else {
          if (minutesOf(r.start) <= minutesOf(last.end)) {
            const endMax = Math.max(minutesOf(last.end), minutesOf(r.end));
            last.end = `${pad2(Math.floor(endMax / 60))}:${pad2(endMax % 60)}`;
          } else {
            merged.push({ ...r });
          }
        }
      }
      d.ranges = merged;
    });

    const map = new Map<string, Map<string, AvailTeacher>>();
    rows.forEach((a) => {
      const st = minutesOf(clampHHMM(a.start_time));
      const ed = minutesOf(clampHHMM(a.end_time));
      const id = String(a.teacher_id);
      const name = String(a.teacher_name ?? "알 수 없음");

      slotTimes.forEach((t) => {
        const m = minutesOf(t);
        if (m >= st && m < ed) {
          const m2 = map.get(t) ?? new Map<string, AvailTeacher>();
          m2.set(id, { id, name });
          map.set(t, m2);
        }
      });
    });

    const byTime = new Map<string, AvailTeacher[]>();
    map.forEach((m2, t) => byTime.set(t, Array.from(m2.values())));

    return { byTime, detailByTeacherId };
  }, [availability, slotTimes, selectedDow]);

  const renderAvailDots = (teachers: { id: string; name: string }[]) => {
    if (!teachers || teachers.length === 0) return null;
    // 강사 본인만 있으니 점 1개로 충분
    return (
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: MY_BLUE,
          border: "1px solid rgba(0,0,0,0.18)",
          display: "inline-block",
          opacity: 0.28,
        }}
      />
    );
  };

  const goPrevWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() - 7);
    setHoverTime("");
    setSelectedDow(null);
    setWeekStart(ymd(startOfWeek(d)));
  };
  const goNextWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() + 7);
    setHoverTime("");
    setSelectedDow(null);
    setWeekStart(ymd(startOfWeek(d)));
  };
  const goThisWeek = () => {
    setHoverTime("");
    setSelectedDow(null);
    setWeekStart(ymd(startOfWeek(new Date())));
  };

  const gridColsTemplate = useMemo(() => `${TIME_W}px ${AVAIL_W}px repeat(${cols.length}, ${COL_W}px)`, [cols.length]);

  return (
    <TeacherShell title="주간 레슨 현황">
      <div style={{ maxWidth: 1600, padding: 16 }}>
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
          <div style={{ fontWeight: 900 }}>강사 주간표</div>

          <button onClick={goPrevWeek} style={btnGhost()}>
            ◀
          </button>

          <div style={{ fontWeight: 900 }}>
            {week.from} ~ {week.to}
          </div>

          <button onClick={goNextWeek} style={btnGhost()}>
            ▶
          </button>

          <button onClick={goThisWeek} style={btnGhost()}>
            이번주
          </button>

          <button onClick={load} style={btnPrimary()}>
            새로고침
          </button>

          <div style={{ marginLeft: "auto", color: "#666", fontSize: 13, fontWeight: 900 }}>
            {loading ? "불러오는 중..." : `내 레슨 ${myLessons.length} · 연습실 ${practice.length}`}
          </div>

          <div style={{ width: "100%", marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>
              요일 선택하면 근무 도트가 그 요일 기준으로 표시돼요.
            </div>
            {selectedDow !== null ? (
              <button
                onClick={() => {
                  setSelectedDow(null);
                  setHoverTime("");
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 12,
                  color: "#111",
                }}
              >
                요일 선택 해제
              </button>
            ) : null}
          </div>
        </div>

        {/* Sheet */}
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
            overflow: "auto",
            height: "calc(100vh - 240px)",
          }}
        >
          {/* Sticky headers */}
          <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#fff" }}>
            {/* Header row 1: Day */}
            <div style={{ display: "grid", gridTemplateColumns: gridColsTemplate, borderBottom: "1px solid #eee" }}>
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 60,
                  gridColumn: "span 2",
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
                시간/근무
              </div>

              {week.days.map((d) => {
                const dateStr = ymd(d);
                const day = d.getDay();
                const labelDay = `${DOW_KR[day]}(${d.getDate()})`;
                const isToday = dateStr === ymd(new Date());
                const isSelected = selectedDow === day;

                return (
                  <button
                    type="button"
                    key={dateStr}
                    onClick={() => {
                      setHoverTime("");
                      setSelectedDow((prev) => (prev === day ? null : day));
                    }}
                    style={{
                      gridColumn: `span ${rooms.length}`,
                      height: HEAD_H1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      background: isSelected ? "#111" : isToday ? "#111" : "#fafafa",
                      color: isSelected ? "#fff" : isToday ? "#fff" : "#111",
                      borderRight: "1px solid #eee",
                      cursor: "pointer",
                    }}
                    title="클릭하면 해당 요일 근무 도트를 표시해요"
                  >
                    {labelDay}
                  </button>
                );
              })}
            </div>

            {/* Header row 2: Rooms */}
            <div style={{ display: "grid", gridTemplateColumns: gridColsTemplate, borderBottom: "1px solid #eee" }}>
              <div style={{ position: "sticky", left: 0, zIndex: 60, height: HEAD_H2, background: "#fff", borderRight: "1px solid #eee" }} />
              <div
                style={{
                  position: "sticky",
                  left: TIME_W,
                  zIndex: 60,
                  height: HEAD_H2,
                  background: "#fff",
                  borderRight: "1px solid #eee",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 1000,
                  fontSize: 12,
                  color: selectedDow === null ? "#aaa" : "#666",
                }}
              >
                근무
              </div>

              {cols.map((c, idx) => (
                <div
                  key={`${c.dateStr}|${c.room}|${idx}`}
                  style={{
                    height: HEAD_H2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 1000,
                    background: "#fff",
                    borderRight: "1px solid #f0f0f0",
                    color: "#111",
                    fontSize: 13,
                  }}
                >
                  {c.room}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: gridColsTemplate,
              gridTemplateRows: `repeat(${slotTimes.length}, ${ROW_H}px)`,
            }}
          >
            {/* Time column */}
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

            {/* Availability dots column */}
            {slotTimes.map((t, rIdx) => {
              const teachers = selectedDow === null ? [] : availByTimeForSelectedDow.byTime.get(t) ?? [];
              const showTooltip = selectedDow !== null && hoverTime === t && teachers.length > 0;

              return (
                <div
                  key={`avail-${t}`}
                  style={{
                    position: "sticky",
                    left: TIME_W,
                    zIndex: 45,
                    gridColumn: 2,
                    gridRow: rIdx + 1,
                    background: "#fff",
                    borderRight: "1px solid #eee",
                    borderBottom: "1px solid #f3f3f3",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: selectedDow !== null && teachers.length > 0 ? "help" : "default",
                    opacity: selectedDow === null ? 0.35 : 1,
                  }}
                  onMouseEnter={() => {
                    if (selectedDow === null) return;
                    setHoverTime(t);
                  }}
                  onMouseLeave={() => setHoverTime("")}
                >
                  {selectedDow === null ? null : renderAvailDots(teachers)}

                  {showTooltip && (
                    <div
                      style={{
                        position: "absolute",
                        left: "100%",
                        top: "50%",
                        transform: "translateY(-50%)",
                        marginLeft: 10,
                        width: 240,
                        border: "1px solid #e5e5e5",
                        borderRadius: 12,
                        background: "#fff",
                        boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
                        padding: 10,
                        zIndex: 999,
                      }}
                    >
                      <div style={{ fontWeight: 1100, fontSize: 12, color: "#111" }}>
                        {DOW_KR[selectedDow ?? 0]} · {t} 근무 가능
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, color: "#666", fontWeight: 900 }}>
                        {availability
                          .filter((a) => a.weekday === selectedDow)
                          .map((a) => `${clampHHMM(a.start_time)}–${clampHHMM(a.end_time)}`)
                          .join(" · ") || "근무시간 정보 없음"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Background cells */}
            {cols.map((col, cIdx) =>
              slotTimes.map((__, rIdx) => {
                const date = parseYmd(col.dateStr);
                const day = date.getDay();
                const isSelectedDay = selectedDow !== null && day === selectedDow;

                return (
                  <div
                    key={`bg-${cIdx}-${rIdx}`}
                    style={{
                      gridColumn: cIdx + 3,
                      gridRow: rIdx + 1,
                      borderBottom: "1px solid #f3f3f3",
                      borderRight: "1px solid #f3f3f3",
                      background: isSelectedDay ? "#f7f7f7" : rIdx % 2 === 0 ? "#fff" : "#fcfcfc",
                    }}
                  />
                );
              })
            )}

            {/* 1) Other lessons (회색) - zIndex 낮게 */}
            {Array.from(otherLessonsBySlot.entries()).flatMap(([key, list]) => {
              const [dateStr, hhmm, roomNorm] = key.split("|") as [string, string, "A" | "B" | "C"];
              const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
              if (colIndex === -1) return [];

              const stMin = minutesOf(hhmm);
              const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
              const rowSpan = 1;

              // slot에 여러개 있어도 "수업 있음" 하나면 충분
              const p = list[0];
              return [
                <div
                  key={`other-${p.id}-${key}`}
                  style={{
                    gridColumn: colIndex + 3,
                    gridRow: `${rowStart} / span ${rowSpan}`,
                    margin: 4,
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    background: "#e5e7eb",
                    color: "#666",
                    padding: "6px 8px",
                    fontWeight: 1000,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    zIndex: 3,
                    opacity: 0.85,
                    cursor: "default",
                  }}
                  title={`${dateStr} ${hhmm} · ${roomNorm}홀\n다른 강사 수업`}
                >
                  수업 있음
                </div>,
              ];
            })}

            {/* 2) Practice blocks (오렌지) - 중간 레이어 */}
            {Array.from(practiceBySlot.entries()).flatMap(([key, list]) => {
              const [dateStr, hhmm, roomNorm] = key.split("|") as [string, string, "A" | "B" | "C"];

              const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
              if (colIndex === -1) return [];

              const stMin = minutesOf(hhmm);
              const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
              const rowSpan = 1;

              return list.map((p) => (
                <div
                  key={`prac-${p.id}-${key}`}
                  style={{
                    gridColumn: colIndex + 3,
                    gridRow: `${rowStart} / span ${rowSpan}`,
                    margin: 4,
                    borderRadius: 10,
                    border: "2px solid rgba(0,0,0,0.12)",
                    background: "#f97316",
                    color: "#fff",
                    padding: "6px 8px",
                    fontWeight: 900,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    zIndex: 5,
                    opacity: 0.92,
                  }}
                  title={`${p.date} ${p.start_time ?? ""}-${p.end_time ?? ""} · ${roomNorm}홀\n${p.student_name} (연습실)`}
                >
                  {p.student_name}
                </div>
              ));
            })}

            {/* 3) My lessons (블루) - 최상단 */}
            {Array.from(myLessonsBySlot.entries()).flatMap(([key, list]) => {
              const [dateStr, hhmm, roomNorm] = key.split("|") as [string, string, "A" | "B" | "C"];

              const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
              if (colIndex === -1) return [];

              const stMin = minutesOf(hhmm);
              const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
              const rowSpan = 1;

              const l = list[0];
              return [
                <div
                  key={`my-${l.id}-${key}`}
                  style={{
                    gridColumn: colIndex + 3,
                    gridRow: `${rowStart} / span ${rowSpan}`,
                    margin: 4,
                    borderRadius: 10,
                    border: "2px solid rgba(0,0,0,0.12)",
                    background: MY_BLUE,
                    color: "#fff",
                    padding: "6px 8px",
                    fontWeight: 1000,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    zIndex: 10,
                    boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
                  }}
                  title={`${l.lesson_date} ${clampHHMM(l.lesson_time)} / ${roomNorm}홀\n${l.student_name}`}
                >
                  {l.student_name}
                  {l.allow_change_override ? <span style={{ marginLeft: 6, opacity: 0.95 }}>(예외)</span> : null}
                </div>,
              ];
            })}
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666", fontWeight: 900 }}>
          * 내 레슨(블루) · 다른 강사 수업(회색) · 연습실 확정(오렌지)
        </div>
      </div>
    </TeacherShell>
  );
}

function btnGhost(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  };
}
function btnPrimary(): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  };
}