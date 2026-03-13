"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TeacherShell from "@/components/TeacherShell";
import { authFetch } from "@/lib/authFetch";

type LessonRow = {
  id: string;
  lesson_date: string;
  lesson_time: string;
  status: string;
  allow_change_override: boolean;

  teacher_id: string | null;
  room_id: string | null;
  room_name: string;

  student_id: string | null;
  student_name: string;

  lesson_no?: number | null;
  total_lessons?: number | null;
  class_type?: string | null;
};

type AvailabilityRow = {
  teacher_id: string;
  teacher_name: string;
  date: string;
  weekday: number; // 0=Sun..6=Sat
  start_time: string;
  end_time: string;
  device_type: "controller" | "turntable" | "both";
};

type PracticeRow = {
  id: string;
  room_id: string | null;
  room_name: string;

  date: string | null;
  start_time: string | null;
  end_time: string | null;

  student_id: string | null;
  student_name: string;
  status: string;
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
function clampHHMM(t: string | null | undefined) {
  if (!t) return "";
  return String(t).slice(0, 5);
}
function minutesOf(t: string | null | undefined) {
  const hhmm = clampHHMM(t);
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
const DOW_KR = ["일", "월", "화", "수", "목", "금", "토"] as const;

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
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDate, setMobileDate] = useState(() => ymd(new Date()));
  const loadingRef = useRef(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const TIME_W = isMobile ? 62 : 96;
  const COL_W = isMobile ? 72 : 108;

  const HEAD_H1 = isMobile ? 42 : 48;
  const HEAD_H2 = isMobile ? 34 : 40;
  const ROW_H = isMobile ? 48 : 50;

  const STEP_MIN = 60;
  const DEFAULT_DURATION = 60;

  const rooms = ["A", "B", "C"] as const;

  const MY_BLUE = "#2563eb";
  const OTHER_BLACK = "#111111";
  const PRACTICE_ORANGE = "#f97316";
  const WORK_BG = "#eff6ff";
  const WORK_BORDER = "#bfdbfe";

  const [weekStart, setWeekStart] = useState(() => ymd(startOfWeek(new Date())));
  const [myLessons, setMyLessons] = useState<LessonRow[]>([]);
  const [otherLessons, setOtherLessons] = useState<LessonRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [practice, setPractice] = useState<PracticeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const week = useMemo(() => {
    const ws = parseYmd(weekStart);
    const days = Array.from({ length: 7 }).map((_, i) => addDays(ws, i));
    return { days, from: ymd(days[0]), to: ymd(days[6]) };
  }, [weekStart]);

  useEffect(() => {
    const today = ymd(new Date());
    const inThisWeek = week.days.some((d) => ymd(d) === today);
    setMobileDate(inThisWeek ? today : ymd(week.days[0]));
  }, [week]);

  const load = useCallback(
    async (force = false) => {
      if (loadingRef.current && !force) return;
      loadingRef.current = true;
      setLoading(true);

      try {
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
          return;
        }

        setMyLessons((data.my_lessons ?? data.lessons ?? []) as LessonRow[]);
        setOtherLessons((data.other_lessons ?? []) as LessonRow[]);
        setAvailability((data.availability ?? []) as AvailabilityRow[]);
        setPractice((data.practice_reservations ?? []) as PracticeRow[]);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [week.from, week.to]
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onFocus = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => load(), 120);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => load(), 120);
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
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
      const st = minutesOf(a.start_time);
      const ed = minutesOf(a.end_time);
      if (Number.isFinite(st) && Number.isFinite(ed)) {
        mins.push(st);
        maxs.push(ed);
      }
    });

    practice.forEach((p) => {
      const st = minutesOf(p.start_time);
      const ed = minutesOf(p.end_time);
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
  }, [myLessons, otherLessons, availability, practice]);

  const slotTimes = useMemo(() => {
    const arr: string[] = [];
    for (let m = timeRange.minM; m < timeRange.maxM; m += STEP_MIN) {
      arr.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
    }
    return arr;
  }, [timeRange]);

  type Col = { dateStr: string; room: (typeof rooms)[number] };
  const cols = useMemo<Col[]>(() => {
    const out: Col[] = [];
    week.days.forEach((d) => {
      const dateStr = ymd(d);
      rooms.forEach((room) => out.push({ dateStr, room }));
    });
    return out;
  }, [week.days]);

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
      if (!Number.isFinite(stM) || !Number.isFinite(edM) || edM <= stM) continue;

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

  const availabilityByDate = useMemo(() => {
    const map = new Map<string, { start: string; end: string }[]>();

    week.days.forEach((dayDate) => {
      const dateStr = ymd(dayDate);
      const dow = dayDate.getDay();

      const ranges = availability
        .filter((a) => Number(a.weekday) === dow)
        .map((a) => ({
          start: clampHHMM(a.start_time),
          end: clampHHMM(a.end_time),
        }))
        .filter((r) => r.start && r.end)
        .sort((a, b) => minutesOf(a.start) - minutesOf(b.start));

      const merged: { start: string; end: string }[] = [];
      for (const r of ranges) {
        const last = merged[merged.length - 1];
        if (!last) {
          merged.push({ ...r });
        } else if (minutesOf(r.start) <= minutesOf(last.end)) {
          const endMax = Math.max(minutesOf(last.end), minutesOf(r.end));
          last.end = `${pad2(Math.floor(endMax / 60))}:${pad2(endMax % 60)}`;
        } else {
          merged.push({ ...r });
        }
      }

      map.set(dateStr, merged);
    });

    return map;
  }, [availability, week.days]);

  const isWorkingSlot = useCallback(
    (dateStr: string, time: string) => {
      const ranges = availabilityByDate.get(dateStr) ?? [];
      const m = minutesOf(time);
      return ranges.some((r) => m >= minutesOf(r.start) && m < minutesOf(r.end));
    },
    [availabilityByDate]
  );

  const getAvailabilityLabel = useCallback(
    (dateStr: string) => {
      const ranges = availabilityByDate.get(dateStr) ?? [];
      if (ranges.length === 0) return "근무 없음";
      return ranges.map((r) => `${r.start}-${r.end}`).join(" · ");
    },
    [availabilityByDate]
  );

  const mobileDay = useMemo(() => {
    return week.days.find((d) => ymd(d) === mobileDate) ?? week.days[0];
  }, [week.days, mobileDate]);

  const mobileDateStr = ymd(mobileDay);

  const mobileTimelineRows = useMemo(() => {
    return slotTimes.map((t) => {
      const myAtTime = myLessons.filter(
        (l) => l.lesson_date === mobileDateStr && clampHHMM(l.lesson_time) === t
      );
      const otherAtTime = otherLessons.filter(
        (l) => l.lesson_date === mobileDateStr && clampHHMM(l.lesson_time) === t
      );
      const practiceAtTime = practice.filter((p) => {
        if (!p.date || !p.start_time || !p.end_time) return false;
        const st = minutesOf(p.start_time);
        const ed = minutesOf(p.end_time);
        const cur = minutesOf(t);
        return p.date === mobileDateStr && cur >= st && cur < ed;
      });
      const working = isWorkingSlot(mobileDateStr, t);

      return {
        time: t,
        myAtTime,
        otherAtTime,
        practiceAtTime,
        working,
      };
    });
  }, [slotTimes, myLessons, otherLessons, practice, mobileDateStr, isWorkingSlot]);

  const goPrevWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(ymd(startOfWeek(d)));
  };
  const goNextWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(ymd(startOfWeek(d)));
  };
  const goThisWeek = () => {
    setWeekStart(ymd(startOfWeek(new Date())));
  };

  const gridColsTemplate = useMemo(
    () => `${TIME_W}px repeat(${cols.length}, ${COL_W}px)`,
    [TIME_W, cols.length, COL_W]
  );

  return (
    <TeacherShell title="주간 스케줄">
      <div style={{ maxWidth: 1800, padding: isMobile ? 10 : 16 }}>
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
            padding: isMobile ? 10 : 12,
            marginBottom: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: isMobile ? 14 : 16 }}>강사 주간표</div>

          <button onClick={goPrevWeek} style={btnGhost(isMobile)}>
            ◀
          </button>

          <div style={{ fontWeight: 900, fontSize: isMobile ? 13 : 15 }}>
            {week.from} ~ {week.to}
          </div>

          <button onClick={goNextWeek} style={btnGhost(isMobile)}>
            ▶
          </button>

          <button onClick={goThisWeek} style={btnGhost(isMobile)}>
            이번주
          </button>

          <button onClick={() => load(true)} style={btnPrimary(isMobile)}>
            새로고침
          </button>

          <div
            style={{
              marginLeft: "auto",
              color: "#666",
              fontSize: isMobile ? 12 : 13,
              fontWeight: 900,
            }}
          >
            {loading ? "불러오는 중..." : `내 수업 ${myLessons.length} · 연습실 ${practice.length}`}
          </div>

          <div
            style={{
              width: "100%",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            <LegendChip color={MY_BLUE} label="내 수업" />
            <LegendChip color={OTHER_BLACK} label="다른 수업" />
            <LegendChip color={PRACTICE_ORANGE} label="연습실" />
            <LegendChip color={WORK_BG} label="내 근무 시간" border={WORK_BORDER} textColor="#1d4ed8" />
          </div>
        </div>

        {isMobile ? (
          <>
            <div
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                marginBottom: 10,
                paddingBottom: 2,
                WebkitOverflowScrolling: "touch",
              }}
            >
              {week.days.map((d) => {
                const dateStr = ymd(d);
                const selected = dateStr === mobileDate;
                const today = dateStr === ymd(new Date());

                return (
                  <button
                    key={dateStr}
                    onClick={() => setMobileDate(dateStr)}
                    style={{
                      minWidth: 58,
                      padding: "9px 10px",
                      borderRadius: 12,
                      border: selected ? "1px solid #111" : "1px solid #ddd",
                      background: selected ? "#111" : "#fff",
                      color: selected ? "#fff" : "#111",
                      fontWeight: 900,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ fontSize: 12 }}>{DOW_KR[d.getDay()]}</div>
                    <div style={{ fontSize: 11, opacity: selected ? 0.95 : today ? 1 : 0.72 }}>
                      {d.getDate()}일
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                background: "#fff",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid #eee",
                  background: "#fafafa",
                }}
              >
                <div style={{ fontWeight: 900, color: "#111", fontSize: 14 }}>
                  {mobileDateStr} · {DOW_KR[mobileDay.getDay()]}
                </div>
                <div style={{ marginTop: 4, color: "#666", fontSize: 12, fontWeight: 800 }}>
                  근무시간: {getAvailabilityLabel(mobileDateStr)}
                </div>
              </div>

              {mobileTimelineRows.map((row) => (
                <div
                  key={row.time}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    borderBottom: "1px solid #f1f1f1",
                    background: row.working ? "#f8fbff" : "#fff",
                  }}
                >
                  <div
                    style={{
                      width: 62,
                      flexShrink: 0,
                      padding: "12px 8px",
                      fontWeight: 900,
                      fontSize: 12,
                      color: "#555",
                      borderRight: "1px solid #f1f1f1",
                      textAlign: "center",
                    }}
                  >
                    {row.time}
                  </div>

                  <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {row.myAtTime.map((l) => (
                      <div
                        key={`m-${l.id}-${row.time}`}
                        style={{
                          background: MY_BLUE,
                          color: "#fff",
                          borderRadius: 10,
                          padding: "9px 10px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                        }}
                        title={`${l.student_name}\n${clampHHMM(l.lesson_time)} · ${l.room_name}\n${
                          l.lesson_no && l.total_lessons ? `${l.lesson_no}/${l.total_lessons}` : ""
                        }`}
                      >
                        <div style={{ fontWeight: 900, fontSize: 12, lineHeight: 1.25 }}>
                          {l.student_name || "이름 없음"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.95, fontWeight: 800 }}>
                          {clampHHMM(l.lesson_time)} · {l.room_name || "-"}
                          {l.allow_change_override ? " · 예외" : ""}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 11, opacity: 0.95, fontWeight: 800 }}>
                          {l.lesson_no && l.total_lessons
                            ? `${l.lesson_no}회차 / 총 ${l.total_lessons}회`
                            : l.lesson_no
                            ? `${l.lesson_no}회차`
                            : ""}
                        </div>
                      </div>
                    ))}

                    {row.otherAtTime.length > 0 && (
                      <div
                        style={{
                          background: OTHER_BLACK,
                          color: "#fff",
                          borderRadius: 10,
                          padding: "9px 10px",
                        }}
                      >
                        <div style={{ fontWeight: 900, fontSize: 12 }}>다른 수업</div>
                      </div>
                    )}

                    {row.practiceAtTime.map((p, idx) => (
                      <div
                        key={`p-${p.id}-${row.time}-${idx}`}
                        style={{
                          background: PRACTICE_ORANGE,
                          color: "#fff",
                          borderRadius: 10,
                          padding: "9px 10px",
                        }}
                        title={`${p.student_name}\n${p.start_time}-${p.end_time}\n${p.room_name}`}
                      >
                        <div style={{ fontWeight: 900, fontSize: 12 }}>연습실 예약</div>
                        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.96, fontWeight: 800 }}>
                          {p.student_name} · {p.room_name || "-"}
                        </div>
                      </div>
                    ))}

                    {row.myAtTime.length === 0 &&
                      row.otherAtTime.length === 0 &&
                      row.practiceAtTime.length === 0 &&
                      row.working && (
                        <div
                          style={{
                            padding: "8px 2px",
                            color: "#2563eb",
                            fontSize: 11,
                            fontWeight: 900,
                          }}
                        >
                          근무 가능
                        </div>
                      )}

                    {row.myAtTime.length === 0 &&
                      row.otherAtTime.length === 0 &&
                      row.practiceAtTime.length === 0 &&
                      !row.working && <div style={{ height: 6 }} />}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "#666",
                fontWeight: 900,
                lineHeight: 1.5,
              }}
            >
              * 모바일은 요일 탭으로 하루씩 확인할 수 있어요.
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                background: "#fff",
                overflow: "auto",
                height: "calc(100vh - 240px)",
              }}
            >
              <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#fff" }}>
                <div style={{ display: "grid", gridTemplateColumns: gridColsTemplate, borderBottom: "1px solid #eee" }}>
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
                      fontSize: 14,
                    }}
                  >
                    시간
                  </div>

                  {week.days.map((d) => {
                    const dateStr = ymd(d);
                    const day = d.getDay();
                    const isToday = dateStr === ymd(new Date());

                    return (
                      <div
                        key={dateStr}
                        style={{
                          gridColumn: `span ${rooms.length}`,
                          height: HEAD_H1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          background: isToday ? "#111" : "#fafafa",
                          color: isToday ? "#fff" : "#111",
                          borderRight: "1px solid #eee",
                          padding: "4px 6px",
                          lineHeight: 1.15,
                        }}
                        title={`근무시간: ${getAvailabilityLabel(dateStr)}`}
                      >
                        <div style={{ fontSize: 14 }}>
                          {DOW_KR[day]}({d.getDate()})
                        </div>
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 10,
                            fontWeight: 800,
                            opacity: isToday ? 0.92 : 0.72,
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {getAvailabilityLabel(dateStr)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: gridColsTemplate, borderBottom: "1px solid #eee" }}>
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

              <div
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: gridColsTemplate,
                  gridTemplateRows: `repeat(${slotTimes.length}, ${ROW_H}px)`,
                  minWidth: TIME_W + cols.length * COL_W,
                }}
              >
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

                {cols.map((col, cIdx) =>
                  slotTimes.map((t, rIdx) => {
                    const working = isWorkingSlot(col.dateStr, t);

                    return (
                      <div
                        key={`bg-${cIdx}-${rIdx}`}
                        style={{
                          gridColumn: cIdx + 2,
                          gridRow: rIdx + 1,
                          borderBottom: "1px solid #f3f3f3",
                          borderRight: "1px solid #f3f3f3",
                          background: working ? WORK_BG : rIdx % 2 === 0 ? "#fff" : "#fcfcfc",
                          boxShadow: working ? `inset 0 0 0 1px ${WORK_BORDER}` : "none",
                        }}
                        title={working ? "근무 가능 시간" : undefined}
                      />
                    );
                  })
                )}

                {Array.from(otherLessonsBySlot.entries()).flatMap(([key, list]) => {
                  const [dateStr, hhmm, roomNorm] = key.split("|") as [string, string, "A" | "B" | "C"];
                  const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
                  if (colIndex === -1) return [];

                  const stMin = minutesOf(hhmm);
                  const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
                  const p = list[0];

                  return [
                    <div
                      key={`other-${p.id}-${key}`}
                      style={{
                        gridColumn: colIndex + 2,
                        gridRow: `${rowStart} / span 1`,
                        margin: 3,
                        borderRadius: 9,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: OTHER_BLACK,
                        color: "#fff",
                        padding: "4px 6px",
                        fontWeight: 900,
                        fontSize: 11,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "column",
                        overflow: "hidden",
                        zIndex: 3,
                        opacity: 0.95,
                        lineHeight: 1.08,
                      }}
                      title={`${dateStr} ${hhmm} · ${p.room_name || roomNorm}홀\n다른 강사 수업`}
                    >
                      <div
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "100%",
                          textAlign: "center",
                        }}
                      >
                        수업 있음
                      </div>
                    </div>,
                  ];
                })}

                {Array.from(practiceBySlot.entries()).flatMap(([key, list]) => {
                  const [dateStr, hhmm, roomNorm] = key.split("|") as [string, string, "A" | "B" | "C"];
                  const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
                  if (colIndex === -1) return [];

                  const stMin = minutesOf(hhmm);
                  const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;

                  return list.map((p, idx) => (
                    <div
                      key={`prac-${p.id}-${key}-${idx}`}
                      style={{
                        gridColumn: colIndex + 2,
                        gridRow: `${rowStart} / span 1`,
                        margin: 3,
                        borderRadius: 9,
                        border: "2px solid rgba(0,0,0,0.1)",
                        background: PRACTICE_ORANGE,
                        color: "#fff",
                        padding: "4px 6px",
                        fontWeight: 900,
                        fontSize: 11,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        overflow: "hidden",
                        zIndex: 5,
                        opacity: 0.96,
                        lineHeight: 1.08,
                      }}
                      title={`${p.date} ${p.start_time ?? ""}-${p.end_time ?? ""} · ${p.room_name || roomNorm}\n${p.student_name} (연습실)`}
                    >
                      <div
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        연습실 예약
                      </div>
                      <div
                        style={{
                          marginTop: 1,
                          fontSize: 10,
                          fontWeight: 800,
                          opacity: 0.95,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.student_name}
                      </div>
                    </div>
                  ));
                })}

                {Array.from(myLessonsBySlot.entries()).flatMap(([key, list]) => {
                  const [dateStr, hhmm, roomNorm] = key.split("|") as [string, string, "A" | "B" | "C"];
                  const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
                  if (colIndex === -1) return [];

                  const stMin = minutesOf(hhmm);
                  const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
                  const l = list[0];

                  return [
                    <div
                      key={`my-${l.id}-${key}`}
                      style={{
                        gridColumn: colIndex + 2,
                        gridRow: `${rowStart} / span 1`,
                        margin: 3,
                        borderRadius: 9,
                        border: "2px solid rgba(0,0,0,0.12)",
                        background: MY_BLUE,
                        color: "#fff",
                        padding: "4px 6px",
                        fontWeight: 1000,
                        fontSize: 11,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        overflow: "hidden",
                        zIndex: 10,
                        boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
                        lineHeight: 1.08,
                      }}
                      title={`${l.lesson_date} ${clampHHMM(l.lesson_time)} / ${l.room_name || roomNorm}
학생: ${l.student_name || "이름 없음"}
${
  l.lesson_no && l.total_lessons
    ? `회차: ${l.lesson_no}/${l.total_lessons}`
    : l.lesson_no
    ? `회차: ${l.lesson_no}`
    : ""
}`}
                    >
                      <div
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {l.student_name || "이름 없음"}
                      </div>

                      <div
                        style={{
                          marginTop: 1,
                          fontSize: 10,
                          fontWeight: 800,
                          opacity: 0.95,
                          lineHeight: 1.1,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {clampHHMM(l.lesson_time)} · {l.room_name || "-"}
                          {l.allow_change_override ? " · 예외" : ""}
                        </div>

                        <div
                          style={{
                            marginTop: 1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {l.lesson_no && l.total_lessons
                            ? `${l.lesson_no}회차 / 총 ${l.total_lessons}회`
                            : l.lesson_no
                            ? `${l.lesson_no}회차`
                            : ""}
                        </div>
                      </div>
                    </div>,
                  ];
                })}
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#666",
                fontWeight: 900,
                lineHeight: 1.5,
              }}
            >
              * 파랑=내 수업 · 검정=다른 수업 · 주황=연습실 · 연한 파랑 배경=내 근무 시간
            </div>
          </>
        )}
      </div>
    </TeacherShell>
  );
}

function LegendChip({
  color,
  label,
  border,
  textColor,
}: {
  color: string;
  label: string;
  border?: string;
  textColor?: string;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${border ?? "rgba(0,0,0,0.08)"}`,
        background: "#fff",
        fontSize: 12,
        fontWeight: 900,
        color: "#444",
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          background: color,
          border: `1px solid ${border ?? "rgba(0,0,0,0.08)"}`,
          display: "inline-block",
        }}
      />
      <span style={{ color: textColor ?? "#444" }}>{label}</span>
    </div>
  );
}

function btnGhost(isMobile?: boolean): React.CSSProperties {
  return {
    padding: isMobile ? "7px 9px" : "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: isMobile ? 12 : 13,
  };
}
function btnPrimary(isMobile?: boolean): React.CSSProperties {
  return {
    padding: isMobile ? "7px 10px" : "8px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: isMobile ? 12 : 13,
  };
}