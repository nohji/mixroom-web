"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
  student_phone?: string | null;

  lesson_no?: number | null;
  total_lessons?: number | null;
  class_type?: string | null;
  device_type?: string | null;
  is_oneday?: boolean;
};

type AvailabilityRow = {
  teacher_id: string;
  teacher_name: string;
  date: string;
  weekday: number;
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

type OneDayLessonRow = {
  id: string;
  lesson_date: string;
  lesson_time: string;
  teacher_id: string | null;
  room_id: string | null;
  room_name: string | null;
  memo: string | null;
  status?: string | null;
};

type ChangeBlockRow = {
  id: string;
  teacher_id: string | null;
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
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

function getDeviceLabel(deviceType: string | null | undefined) {
  if (deviceType === "controller") return "컨트롤러";
  if (deviceType === "turntable") return "턴테이블";
  if (deviceType === "both") return "컨트롤러+턴테이블";
  return "-";
}

function getClassTypeLabel(classType: string | null | undefined) {
  if (classType === "1month") return "1개월권";
  if (classType === "3month") return "3개월권";
  return "";
}

export default function TeacherScheduleBoardPage() {
  const [isMobile, setIsMobile] = useState(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const TIME_W = isMobile ? 54 : 96;
  const COL_W = isMobile ? 72 : 108;

  const HEAD_H1 = isMobile ? 46 : 48;
  const HEAD_H2 = isMobile ? 30 : 40;
  const ROW_H = isMobile ? 38 : 50;

  const STEP_MIN = 60;
  const DEFAULT_DURATION = 60;

  const rooms = ["A", "B", "C"] as const;

  const MY_BLUE = "#2563eb";
  const OTHER_BLACK = "#111111";
  const PRACTICE_ORANGE = "#f97316";
  const BLOCK_RED = "#dc2626";
  const ADMIN_BLOCK_GRAY = "#6b7280";
  const ONEDAY_PURPLE = "#7c3aed";
  const WORK_BG = "#eff6ff";
  const WORK_BORDER = "#bfdbfe";
  const OFF_BG = "#ffffff";

  const [weekStart, setWeekStart] = useState(() => ymd(startOfWeek(new Date())));
  const [myLessons, setMyLessons] = useState<LessonRow[]>([]);
  const [otherLessons, setOtherLessons] = useState<LessonRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [practice, setPractice] = useState<PracticeRow[]>([]);
  const [onedayLessons, setOnedayLessons] = useState<OneDayLessonRow[]>([]);
  const [changeBlocks, setChangeBlocks] = useState<ChangeBlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState<LessonRow | null>(null);
  const [selectedOneDay, setSelectedOneDay] = useState<OneDayLessonRow | null>(null);

  const week = useMemo(() => {
    const ws = parseYmd(weekStart);
    const days = Array.from({ length: 7 }).map((_, i) => addDays(ws, i));
    return { days, from: ymd(days[0]), to: ymd(days[6]) };
  }, [weekStart]);

  const todayStr = ymd(new Date());

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
          setOnedayLessons([]);
          setChangeBlocks([]);
          return;
        }

        setMyLessons((data.my_lessons ?? data.lessons ?? []) as LessonRow[]);
        setOtherLessons((data.other_lessons ?? []) as LessonRow[]);
        setAvailability((data.availability ?? []) as AvailabilityRow[]);
        setPractice((data.practice_reservations ?? []) as PracticeRow[]);

        const normalizedOneDay: OneDayLessonRow[] = ((data.oneday_lessons ?? data.one_day_lessons ?? []) as any[]).map((x) => ({
          id: String(x.id),
          lesson_date: String(x.lesson_date ?? x.date ?? ""),
          lesson_time: x.lesson_time ? clampHHMM(x.lesson_time) : clampHHMM(x.time ?? ""),
          teacher_id: x.teacher_id ?? null,
          room_id: x.room_id ?? null,
          room_name: x.room_name ?? x.room?.name ?? null,
          memo: x.memo ?? x.note ?? null,
          status: x.status ?? "ACTIVE",
        }));

        setOnedayLessons(normalizedOneDay);
        setChangeBlocks((data.change_blocks ?? []) as ChangeBlockRow[]);
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

    onedayLessons.forEach((x) => {
      if (String(x.status ?? "").toLowerCase() === "canceled") return;
      const st = minutesOf(x.lesson_time);
      const ed = st + DEFAULT_DURATION;
      if (Number.isFinite(st) && Number.isFinite(ed)) {
        mins.push(st);
        maxs.push(ed);
      }
    });

    changeBlocks.forEach((b) => {
      const st = minutesOf(b.start_time);
      const ed = minutesOf(b.end_time);
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
  }, [myLessons, otherLessons, availability, practice, onedayLessons, changeBlocks]);

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

  const oneDayBySlot = useMemo(() => {
    const m = new Map<string, OneDayLessonRow[]>();

    for (const x of onedayLessons) {
      if (!x.lesson_date || !x.lesson_time) continue;
      if (String(x.status ?? "").toLowerCase() === "canceled") continue;

      const roomNorm = normalizeRoom(x.room_name);
      const k = slotKey(x.lesson_date, x.lesson_time, roomNorm);
      const arr = m.get(k) ?? [];
      arr.push(x);
      m.set(k, arr);
    }

    return m;
  }, [onedayLessons]);

  const changeBlocksBySlot = useMemo(() => {
    const m = new Map<string, ChangeBlockRow[]>();

    for (const b of changeBlocks) {
      if (b.weekday == null || !b.start_time || !b.end_time) continue;

      const stM = minutesOf(b.start_time);
      const edM = minutesOf(b.end_time);
      if (!Number.isFinite(stM) || !Number.isFinite(edM) || edM <= stM) continue;

      for (const day of week.days) {
        const dateStr = ymd(day);
        const dow = day.getDay();

        if (dow !== Number(b.weekday)) continue;

        for (const room of rooms) {
          for (let cur = stM; cur < edM; cur += STEP_MIN) {
            const t = `${pad2(Math.floor(cur / 60))}:${pad2(cur % 60)}`;
            const k = slotKey(dateStr, t, room);
            const arr = m.get(k) ?? [];
            arr.push(b);
            m.set(k, arr);
          }
        }
      }
    }

    return m;
  }, [changeBlocks, week.days]);

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
            borderRadius: isMobile ? 16 : 12,
            background: "#fff",
            padding: 12,
            marginBottom: 12,
            display: "grid",
            gap: isMobile ? 10 : 8,
          }}
        >
          {isMobile ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 1000, fontSize: 15, color: "#111" }}>
                  강사 주간표
                </div>
                <button onClick={() => load(true)} style={btnPrimary(true)}>
                  새로고침
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                <button onClick={goPrevWeek} style={btnGhost(true)}>
                  ◀ 이전
                </button>
                <button onClick={goThisWeek} style={btnGhost(true)}>
                  이번주
                </button>
                <button onClick={goNextWeek} style={btnGhost(true)}>
                  다음 ▶
                </button>
              </div>

              <div style={{ fontWeight: 900, fontSize: 13, color: "#111" }}>
                {week.from} ~ {week.to}
              </div>

              <div style={{ color: "#666", fontSize: 12, fontWeight: 900 }}>
                {loading
                  ? "불러오는 중..."
                  : `내 수업 ${myLessons.length} · 원데이 ${onedayLessons.length} · 연습실 ${practice.length} · 근무차단 ${changeBlocks.length}`}
              </div>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16 }}>강사 주간표</div>

              <button onClick={goPrevWeek} style={btnGhost(false)}>
                ◀
              </button>

              <div style={{ fontWeight: 900, fontSize: 15 }}>
                {week.from} ~ {week.to}
              </div>

              <button onClick={goNextWeek} style={btnGhost(false)}>
                ▶
              </button>

              <button onClick={goThisWeek} style={btnGhost(false)}>
                이번주
              </button>

              <button onClick={() => load(true)} style={btnPrimary(false)}>
                새로고침
              </button>

              <div
                style={{
                  marginLeft: "auto",
                  color: "#666",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                {loading
                  ? "불러오는 중..."
                  : `내 수업 ${myLessons.length} · 원데이 ${onedayLessons.length} · 연습실 ${practice.length} · 근무차단 ${changeBlocks.length}`}
              </div>
            </div>
          )}

          <div
            style={{
              width: "100%",
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginTop: isMobile ? 0 : 4,
            }}
          >
            <LegendChip color={MY_BLUE} label="내 수업" isMobile={isMobile} />
            <LegendChip color={OTHER_BLACK} label="다른 수업" isMobile={isMobile} />
            <LegendChip color={PRACTICE_ORANGE} label="연습실" isMobile={isMobile} />
            <LegendChip color={ONEDAY_PURPLE} label="원데이" isMobile={isMobile} />
            <LegendChip color={BLOCK_RED} label="근무 차단" isMobile={isMobile} />
            <LegendChip color={ADMIN_BLOCK_GRAY} label="운영 차단" isMobile={isMobile} />
            <LegendChip
              color={WORK_BG}
              label="근무 가능"
              border={WORK_BORDER}
              textColor="#1d4ed8"
              isMobile={isMobile}
            />
          </div>
        </div>

        {isMobile && (
          <div
            style={{
              marginBottom: 8,
              fontSize: 11,
              color: "#6b7280",
              fontWeight: 800,
              padding: "0 2px",
            }}
          >
            ← 좌우로 밀어서 홀별 스케줄 보기
          </div>
        )}

        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: isMobile ? 16 : 12,
            background: "#fff",
            overflow: "auto",
            WebkitOverflowScrolling: "touch",
            height: isMobile ? "calc(100vh - 250px)" : "calc(100vh - 240px)",
            boxShadow: isMobile ? "0 4px 16px rgba(0,0,0,0.04)" : "none",
          }}
        >
          <div style={{ minWidth: TIME_W + cols.length * COL_W }}>
            <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#fff" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: gridColsTemplate,
                  borderBottom: "1px solid #eee",
                }}
              >
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
                    fontSize: isMobile ? 11 : 14,
                  }}
                >
                  시간
                </div>

                {week.days.map((d) => {
                  const dateStr = ymd(d);
                  const day = d.getDay();
                  const isToday = dateStr === todayStr;

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
                      <div style={{ fontSize: isMobile ? 11 : 14 }}>
                        {DOW_KR[day]}({d.getDate()})
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: isMobile ? 8 : 10,
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

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: gridColsTemplate,
                  borderBottom: "1px solid #eee",
                }}
              >
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

                {cols.map((c, idx) => {
                  const isDayEnd = idx % 3 === 2;
                  return (
                    <div
                      key={`${c.dateStr}|${c.room}|${idx}`}
                      style={{
                        height: HEAD_H2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 1000,
                        background: "#fff",
                        borderRight: isDayEnd ? "2px solid #d1d5db" : "1px solid #f0f0f0",
                        color: "#111",
                        fontSize: isMobile ? 11 : 13,
                      }}
                    >
                      {c.room}
                    </div>
                  );
                })}
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
                    fontSize: isMobile ? 10 : 12,
                    color: "#555",
                  }}
                >
                  {t}
                </div>
              ))}

              {cols.map((col, cIdx) => {
                const isDayEnd = cIdx % 3 === 2;

                return slotTimes.map((t, rIdx) => {
                  const working = isWorkingSlot(col.dateStr, t);
                  const isTodayCol = col.dateStr === todayStr;

                  return (
                    <div
                      key={`bg-${cIdx}-${rIdx}`}
                      style={{
                        gridColumn: cIdx + 2,
                        gridRow: rIdx + 1,
                        borderBottom: "1px solid #f3f3f3",
                        borderRight: isDayEnd ? "2px solid #d1d5db" : "1px solid #f3f3f3",
                        background: working
                          ? isTodayCol
                            ? "#dbeafe"
                            : WORK_BG
                          : isTodayCol
                          ? "#f8fafc"
                          : OFF_BG,
                        boxShadow: working ? `inset 0 0 0 1px ${WORK_BORDER}` : "none",
                      }}
                    />
                  );
                });
              })}

              {Array.from(changeBlocksBySlot.entries()).flatMap(([key, list]) => {
                const [dateStr, hhmm, roomNorm] = key.split("|") as [
                  string,
                  string,
                  "A" | "B" | "C"
                ];
                const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
                if (colIndex === -1) return [];

                const stMin = minutesOf(hhmm);
                const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
                const block = list[0];

                return [
                  <div
                    key={`block-${block.id}-${key}`}
                    style={{
                      gridColumn: colIndex + 2,
                      gridRow: `${rowStart} / span 1`,
                      margin: isMobile ? 2 : 3,
                      borderRadius: isMobile ? 11 : 9,
                      border: "2px solid rgba(0,0,0,0.08)",
                      background: BLOCK_RED,
                      color: "#fff",
                      padding: isMobile ? "3px 4px" : "4px 6px",
                      fontWeight: 900,
                      fontSize: isMobile ? 9 : 11,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      overflow: "hidden",
                      zIndex: 4,
                      lineHeight: 1.05,
                    }}
                    title={`${DOW_KR[block.weekday]}요일 ${block.start_time ?? ""}-${
                      block.end_time ?? ""
                    }\n근무 차단${block.reason ? `\n사유: ${block.reason}` : ""}`}
                  >
                    <div style={ellipsisStyle}>근무 차단</div>
                    <div
                      style={{
                        marginTop: 1,
                        fontSize: isMobile ? 8 : 10,
                        fontWeight: 800,
                        opacity: 0.95,
                        ...ellipsisStyle,
                      }}
                    >
                      {isMobile
                        ? clampHHMM(block.start_time)
                        : block.reason ??
                          `${clampHHMM(block.start_time)}-${clampHHMM(block.end_time)}`}
                    </div>
                  </div>,
                ];
              })}

              {Array.from(otherLessonsBySlot.entries()).flatMap(([key, list]) => {
                const [dateStr, hhmm, roomNorm] = key.split("|") as [
                  string,
                  string,
                  "A" | "B" | "C"
                ];
                const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
                if (colIndex === -1) return [];

                const stMin = minutesOf(hhmm);
                const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
                const p = list[0];

                const isOtherOneDay = !!p.is_oneday;
                const otherLabel = isOtherOneDay
                  ? isMobile
                    ? "원데이"
                    : "원데이 있음"
                  : isMobile
                  ? "수업"
                  : "수업 있음";

                return [
                  <div
                    key={`other-${p.id}-${key}`}
                    style={{
                      gridColumn: colIndex + 2,
                      gridRow: `${rowStart} / span 1`,
                      margin: isMobile ? 2 : 3,
                      borderRadius: isMobile ? 11 : 9,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: OTHER_BLACK,
                      color: "#fff",
                      padding: isMobile ? "3px 4px" : "4px 6px",
                      fontWeight: 900,
                      fontSize: isMobile ? 9 : 11,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                      overflow: "hidden",
                      zIndex: 5,
                      opacity: 0.95,
                      lineHeight: 1.05,
                    }}
                    title={`${dateStr} ${hhmm} · ${p.room_name || roomNorm}홀\n${
                      isOtherOneDay ? "다른 강사 원데이" : "다른 강사 수업"
                    }`}
                  >
                    <div
                      style={{
                        ...ellipsisStyle,
                        width: "100%",
                        textAlign: "center",
                      }}
                    >
                      {otherLabel}
                    </div>
                  </div>,
                ];
              })}

              {Array.from(practiceBySlot.entries()).flatMap(([key, list]) => {
                const [dateStr, hhmm, roomNorm] = key.split("|") as [
                  string,
                  string,
                  "A" | "B" | "C"
                ];
                const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
                if (colIndex === -1) return [];

                const stMin = minutesOf(hhmm);
                const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;

                return list.map((p, idx) => {
                  const isBlocked = !p.student_id;

                  return (
                    <div
                      key={`prac-${p.id}-${key}-${idx}`}
                      style={{
                        gridColumn: colIndex + 2,
                        gridRow: `${rowStart} / span 1`,
                        margin: isMobile ? 2 : 3,
                        borderRadius: isMobile ? 11 : 9,
                        border: "2px solid rgba(0,0,0,0.1)",
                        background: isBlocked ? ADMIN_BLOCK_GRAY : PRACTICE_ORANGE,
                        color: "#fff",
                        padding: isMobile ? "3px 4px" : "4px 6px",
                        fontWeight: 900,
                        fontSize: isMobile ? 9 : 11,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        overflow: "hidden",
                        zIndex: 6,
                        opacity: 0.97,
                        lineHeight: 1.05,
                      }}
                      title={
                        isBlocked
                          ? `${p.date} ${p.start_time ?? ""}-${p.end_time ?? ""}\n운영 차단`
                          : `${p.date} ${p.start_time ?? ""}-${p.end_time ?? ""}\n${p.student_name} (연습실)`
                      }
                    >
                      <div style={ellipsisStyle}>
                        {isBlocked ? "운영차단" : isMobile ? "연습실" : "연습실 예약"}
                      </div>

                      <div
                        style={{
                          marginTop: 1,
                          fontSize: isMobile ? 8 : 10,
                          fontWeight: 800,
                          opacity: 0.95,
                          ...ellipsisStyle,
                        }}
                      >
                        {isBlocked
                          ? clampHHMM(p.start_time)
                          : isMobile
                          ? clampHHMM(p.start_time)
                          : p.student_name}
                      </div>
                    </div>
                  );
                });
              })}

              {Array.from(oneDayBySlot.entries()).flatMap(([key, list]) => {
                const [dateStr, hhmm, roomNorm] = key.split("|") as [
                  string,
                  string,
                  "A" | "B" | "C"
                ];
                const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
                if (colIndex === -1) return [];

                const stMin = minutesOf(hhmm);
                const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;

                return list.map((x, idx) => (
                  <button
                    type="button"
                    key={`oneday-${x.id}-${key}-${idx}`}
                    onClick={() => setSelectedOneDay(x)}
                    style={{
                      gridColumn: colIndex + 2,
                      gridRow: `${rowStart} / span 1`,
                      margin: isMobile ? 2 : 3,
                      borderRadius: isMobile ? 11 : 9,
                      border: "2px solid rgba(0,0,0,0.12)",
                      background: ONEDAY_PURPLE,
                      color: "#fff",
                      padding: isMobile ? "3px 4px" : "4px 6px",
                      fontWeight: 1000,
                      fontSize: isMobile ? 8 : 10,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      overflow: "hidden",
                      zIndex: 9,
                      opacity: 0.97,
                      lineHeight: 1.05,
                      cursor: "pointer",
                      outline: "none",
                      appearance: "none",
                      textAlign: "left",
                    }}
                    title={`${x.lesson_date} ${clampHHMM(x.lesson_time)} · ${x.room_name || roomNorm}홀\n원데이 레슨${x.memo ? `\n메모: ${x.memo}` : ""}`}
                  >
                    <div style={ellipsisStyle}>원데이</div>
                    <div
                      style={{
                        marginTop: 1,
                        fontSize: isMobile ? 8 : 9,
                        fontWeight: 800,
                        opacity: 0.95,
                        ...ellipsisStyle,
                      }}
                    >
                      {isMobile ? clampHHMM(x.lesson_time) : x.memo?.trim() || clampHHMM(x.lesson_time)}
                    </div>
                  </button>
                ));
              })}

              {Array.from(myLessonsBySlot.entries()).flatMap(([key, list]) => {
                const [dateStr, hhmm, roomNorm] = key.split("|") as [
                  string,
                  string,
                  "A" | "B" | "C"
                ];
                const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
                if (colIndex === -1) return [];

                const stMin = minutesOf(hhmm);
                const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
                const l = list[0];

                return [
                  <button
                    type="button"
                    onClick={() => setSelectedLesson(l)}
                    key={`my-${l.id}-${key}`}
                    style={{
                      gridColumn: colIndex + 2,
                      gridRow: `${rowStart} / span 1`,
                      margin: isMobile ? 2 : 3,
                      borderRadius: isMobile ? 11 : 9,
                      border: "2px solid rgba(0,0,0,0.12)",
                      background: MY_BLUE,
                      color: "#fff",
                      padding: isMobile ? "3px 4px" : "4px 5px",
                      fontWeight: 1000,
                      fontSize: isMobile ? 8 : 10,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      overflow: "hidden",
                      zIndex: 10,
                      boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
                      lineHeight: 1.05,
                      cursor: "pointer",
                      outline: "none",
                      appearance: "none",
                      textAlign: "left",
                    }}
                    title={`${l.lesson_date} ${clampHHMM(l.lesson_time)} / ${
                      l.room_name || roomNorm
                    }\n학생: ${l.student_name || "이름 없음"}\n${
                      l.lesson_no && l.total_lessons
                        ? `회차: ${l.lesson_no}/${l.total_lessons}`
                        : l.lesson_no
                        ? `회차: ${l.lesson_no}`
                        : ""
                    }`}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          minWidth: 0,
                          ...ellipsisStyle,
                          fontSize: isMobile ? 8 : 10,
                          fontWeight: 900,
                          letterSpacing: "-0.04em",
                        }}
                      >
                        {l.student_name || "이름 없음"}
                      </div>

                      {l.lesson_no ? (
                        <span
                          style={{
                            flexShrink: 0,
                            padding: "1px 4px",
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.18)",
                            border: "1px solid rgba(255,255,255,0.28)",
                            fontSize: isMobile ? 7 : 9,
                            fontWeight: 1000,
                            lineHeight: 1.15,
                          }}
                        >
                          {l.total_lessons ? `${l.lesson_no}/${l.total_lessons}` : `${l.lesson_no}회`}
                        </span>
                      ) : null}
                    </div>

                    <div
                      style={{
                        marginTop: 1,
                        fontSize: isMobile ? 8 : 9,
                        fontWeight: 800,
                        opacity: 0.95,
                        ...ellipsisStyle,
                      }}
                    >
                      {isMobile
                        ? clampHHMM(l.lesson_time)
                        : `${clampHHMM(l.lesson_time)} · ${l.room_name || "-"}${
                            l.allow_change_override ? " · 예외" : ""
                          }`}
                    </div>
                  </button>,
                ];
              })}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: isMobile ? 11 : 12,
            color: "#666",
            fontWeight: 900,
            lineHeight: 1.5,
          }}
        >
          * 파랑=내 수업 · 보라=원데이 · 검정=다른 수업 · 주황=연습실 · 빨강=근무 차단 · 회색=운영 차단 ·
          연한 파랑=근무 가능
        </div>
      </div>

      {selectedLesson && (
        <LessonInfoModal lesson={selectedLesson} onClose={() => setSelectedLesson(null)} />
      )}

      {selectedOneDay && (
        <OneDayInfoModal oneDay={selectedOneDay} onClose={() => setSelectedOneDay(null)} />
      )}
    </TeacherShell>
  );
}


function OneDayInfoModal({
  oneDay,
  onClose,
}: {
  oneDay: OneDayLessonRow;
  onClose: () => void;
}) {
  const endM = minutesOf(oneDay.lesson_time) + 60;
  const endTime = `${pad2(Math.floor(endM / 60))}:${pad2(endM % 60)}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 20,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 1000, color: "#111" }}>
            원데이 레슨
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 900,
              color: "#666",
              fontSize: 13,
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <InfoItem label="시간" value={`${oneDay.lesson_date} ${clampHHMM(oneDay.lesson_time)} ~ ${endTime}`} />
          <InfoItem label="홀" value={`${normalizeRoom(oneDay.room_name)}홀`} />
          <InfoItem label="메모" value={oneDay.memo?.trim() || "-"} />
        </div>
      </div>
    </div>
  );
}

function LessonInfoModal({
  lesson,
  onClose,
}: {
  lesson: LessonRow;
  onClose: () => void;
}) {
  const classLabel = `${getDeviceLabel(lesson.device_type)} ${getClassTypeLabel(
    lesson.class_type
  )}`.trim();

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 20,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 1000, color: "#111" }}>
            수강생 정보
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 900,
              color: "#666",
              fontSize: 13,
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <InfoItem label="이름" value={lesson.student_name || "-"} />
          <InfoItem label="전화번호" value={lesson.student_phone || "-"} />
          <InfoItem label="수강권" value={classLabel || "-"} />
          <InfoItem
            label="회차"
            value={
              lesson.lesson_no && lesson.total_lessons
                ? `${lesson.lesson_no}/${lesson.total_lessons}`
                : lesson.lesson_no
                ? `${lesson.lesson_no}회`
                : "-"
            }
          />
          <InfoItem
            label="수업 시간"
            value={`${lesson.lesson_date} ${clampHHMM(lesson.lesson_time)} · ${
              lesson.room_name || "-"
            }`}
          />
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: "#6b7280",
          fontWeight: 800,
          marginBottom: 4,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 900,
          color: "#111",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LegendChip({
  color,
  label,
  border,
  textColor,
  isMobile,
}: {
  color: string;
  label: string;
  border?: string;
  textColor?: string;
  isMobile?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isMobile ? 5 : 6,
        padding: isMobile ? "5px 8px" : "6px 10px",
        borderRadius: 999,
        border: `1px solid ${border ?? "rgba(0,0,0,0.08)"}`,
        background: "#fff",
        fontSize: isMobile ? 11 : 12,
        fontWeight: 900,
        color: "#444",
      }}
    >
      <span
        style={{
          width: isMobile ? 10 : 12,
          height: isMobile ? 10 : 12,
          borderRadius: 999,
          background: color,
          border: `1px solid ${border ?? "rgba(0,0,0,0.08)"}`,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span style={{ color: textColor ?? "#444" }}>{label}</span>
    </div>
  );
}

const ellipsisStyle: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function btnGhost(isMobile?: boolean): CSSProperties {
  return {
    padding: isMobile ? "8px 9px" : "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: isMobile ? 12 : 13,
  };
}

function btnPrimary(isMobile?: boolean): CSSProperties {
  return {
    padding: isMobile ? "8px 10px" : "8px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: isMobile ? 12 : 13,
  };
}