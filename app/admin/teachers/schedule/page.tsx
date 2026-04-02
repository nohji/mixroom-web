"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { createBrowserClient } from "@supabase/ssr";

type Teacher = {
  id: string;
  name: string | null;
};

type AvailabilityRow = {
  id: string;
  teacher_id: string;
  teacher_name: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

type LessonRow = {
  id: string;
  lesson_date: string;
  lesson_time: string;
  status: string;

  teacher_id: string | null;
  teacher_name: string;
  student_id: string | null;
  student_name: string;

  room_id: string | null;
  room_name: string;
};

type ChangeBlock = {
  id: string;
  teacher_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  reason: string | null;
  is_active: boolean;
};

const weekdayLabel = ["일", "월", "화", "수", "목", "금", "토"];

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

function hhmm(t: string) {
  return String(t ?? "").slice(0, 5);
}

function toMin(t: string) {
  const [hh, mm] = hhmm(t).split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function normalizeWeekday(v: number) {
  if (v === 7) return 0;
  return v;
}

function statusLabel(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  if (s === "scheduled") return "예정";
  if (s === "completed") return "완료";
  if (s === "canceled") return "취소";
  if (s === "admin_changed") return "관리자변경";
  return status ?? "-";
}

function teacherColor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 68% 45%)`;
}

function buildHourOptions(startHour: number, endHour: number) {
  const arr: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    arr.push(`${pad2(h)}:00`);
  }
  return arr;
}

function dateLabel(dateStr: string) {
  const d = parseYmd(dateStr);
  return `${weekdayLabel[d.getDay()]}(${d.getDate()})`;
}

function roomLabel(roomName: string | null | undefined) {
  const s = String(roomName ?? "").trim();
  return s || "미지정";
}

type TeacherCardData = {
  teacher: Teacher;
  availabilityRows: AvailabilityRow[];
  lessons: LessonRow[];
  lessonCount: number;
  activeLessonCount: number;
  uniqueStudentCount: number;
  workDaysLabel: string;
};

export default function AdminTeacherSchedulePage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [weekStart, setWeekStart] = useState(() => ymd(startOfWeek(new Date())));
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showCanceledLessons, setShowCanceledLessons] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [changeBlocks, setChangeBlocks] = useState<ChangeBlock[]>([]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const week = useMemo(() => {
    const ws = parseYmd(weekStart);
    const days = Array.from({ length: 7 }).map((_, i) => addDays(ws, i));
    return {
      days,
      from: ymd(days[0]),
      to: ymd(days[6]),
    };
  }, [weekStart]);

  const ensureLoggedIn = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      alert("로그인이 필요합니다.");
      return false;
    }
    return true;
  };

  const getAccessToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const adminFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await getAccessToken();
    if (!token) throw new Error("세션 토큰이 없습니다. 다시 로그인해 주세요.");

    const headers = new Headers(init?.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init?.method && init.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(input, {
      ...init,
      headers,
      credentials: "include",
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(j?.error ?? `HTTP_${res.status}`);
    }
    return j;
  };

  const load = useCallback(async () => {
    if (!(await ensureLoggedIn())) return;

    setLoading(true);
    try {
      const [scheduleJson, lessonsJson] = await Promise.all([
        adminFetch("/api/admin/teachers/schedule", { method: "GET" }),
        adminFetch(`/api/admin/lessons?from=${week.from}&to=${week.to}`, { method: "GET" }),
      ]);

      setChangeBlocks(Array.isArray(scheduleJson?.change_blocks) ? scheduleJson.change_blocks : []);

      const nextTeachers = Array.isArray(scheduleJson?.teachers)
        ? (scheduleJson.teachers as Teacher[])
        : [];
      const nextAvailability = Array.isArray(scheduleJson?.rows)
        ? (scheduleJson.rows as AvailabilityRow[])
        : [];
      const nextLessons = Array.isArray(lessonsJson?.lessons)
        ? (lessonsJson.lessons as LessonRow[])
        : Array.isArray(lessonsJson?.rows)
        ? (lessonsJson.rows as LessonRow[])
        : [];

      setTeachers(nextTeachers);
      setAvailabilityRows(nextAvailability);
      setLessons(nextLessons);

      setSelectedTeacherId((prev) => {
        if (prev && nextTeachers.some((t) => t.id === prev)) return prev;
        return nextTeachers[0]?.id ?? "";
      });
    } catch (e: any) {
      alert(e?.message ?? "강사 근무 현황 조회 실패");
      setTeachers([]);
      setAvailabilityRows([]);
      setLessons([]);
      setChangeBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, week.from, week.to]);

  useEffect(() => {
    load();
  }, [load]);

  const teacherCards = useMemo<TeacherCardData[]>(() => {
    return teachers.map((teacher) => {
      const teacherAvailability = availabilityRows
        .filter((r) => r.teacher_id === teacher.id)
        .sort((a, b) => {
          const aw = normalizeWeekday(a.weekday);
          const bw = normalizeWeekday(b.weekday);
          if (aw !== bw) return aw - bw;
          return hhmm(a.start_time).localeCompare(hhmm(b.start_time));
        });

      const teacherLessons = lessons
        .filter((l) => l.teacher_id === teacher.id)
        .sort((a, b) => {
          if (a.lesson_date !== b.lesson_date) return a.lesson_date.localeCompare(b.lesson_date);
          return hhmm(a.lesson_time).localeCompare(hhmm(b.lesson_time));
        });

      const activeLessons = teacherLessons.filter(
        (l) => String(l.status ?? "").toLowerCase() !== "canceled"
      );

      const uniqueStudentCount = new Set(
        activeLessons.map((l) => l.student_id).filter((x): x is string => Boolean(x))
      ).size;

      const workDays = Array.from(
        new Set(teacherAvailability.map((r) => normalizeWeekday(r.weekday)))
      ).sort((a, b) => a - b);

      return {
        teacher,
        availabilityRows: teacherAvailability,
        lessons: teacherLessons,
        lessonCount: teacherLessons.length,
        activeLessonCount: activeLessons.length,
        uniqueStudentCount,
        workDaysLabel: workDays.length > 0 ? workDays.map((d) => weekdayLabel[d]).join(", ") : "-",
      };
    });
  }, [teachers, availabilityRows, lessons]);

  const visibleCards = useMemo(() => {
    const q = search.trim().toLowerCase();

    return teacherCards.filter((card) => {
      if (!q) return true;

      return (
        String(card.teacher.name ?? "").toLowerCase().includes(q) ||
        card.lessons.some((l) => String(l.student_name ?? "").toLowerCase().includes(q))
      );
    });
  }, [teacherCards, search]);

  const selectedTeacherCard = useMemo(() => {
    return teacherCards.find((c) => c.teacher.id === selectedTeacherId) ?? null;
  }, [selectedTeacherId, teacherCards]);

  const selectedTeacherChangeBlocks = useMemo(() => {
    if (!selectedTeacherId) return [];
    return changeBlocks.filter((b) => b.teacher_id === selectedTeacherId);
  }, [changeBlocks, selectedTeacherId]);

  const calendarHours = useMemo(() => {
    if (!selectedTeacherCard) return buildHourOptions(12, 23);

    const mins: number[] = [];
    const maxs: number[] = [];

    selectedTeacherCard.availabilityRows.forEach((r) => {
      mins.push(toMin(r.start_time));
      maxs.push(toMin(r.end_time));
    });

    selectedTeacherCard.lessons.forEach((l) => {
      mins.push(toMin(l.lesson_time));
      maxs.push(toMin(l.lesson_time) + 60);
    });

    selectedTeacherChangeBlocks.forEach((b) => {
      mins.push(toMin(b.start_time));
      maxs.push(toMin(b.end_time));
    });

    if (mins.length === 0 || maxs.length === 0) {
      return buildHourOptions(12, 23);
    }

    let startHour = Math.floor(Math.min(...mins) / 60);
    let endHour = Math.ceil(Math.max(...maxs) / 60);

    startHour = Math.max(0, Math.min(startHour, 23));
    endHour = Math.min(24, Math.max(endHour, startHour + 1));

    if (endHour - startHour < 8) {
      startHour = Math.max(0, Math.min(startHour, 12));
      endHour = Math.min(24, Math.max(endHour, 22));
    }

    return buildHourOptions(startHour, endHour);
  }, [selectedTeacherCard, selectedTeacherChangeBlocks]);

  const totalTeacherCount = visibleCards.length;
  const totalLessonCount = visibleCards.reduce((sum, card) => sum + card.lessonCount, 0);
  const totalStudentCount = visibleCards.reduce((sum, card) => sum + card.uniqueStudentCount, 0);

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

  return (
    <AdminLayoutShell title="강사 근무 현황">
      <div style={{ width: "100%", maxWidth: 1500, color: "#111" }}>
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 16,
            background: "#fff",
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <h3 style={{ margin: 0, fontSize: isMobile ? 20 : 22, fontWeight: 1000 }}>
              강사별 운영 현황 + 주간 캘린더
            </h3>
            <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
              강사 요약을 보고, 아래 캘린더에서 빈 시간에 수업 배치를 판단할 수 있어요.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={goPrevWeek} style={ghostBtn}>◀</button>

            <div
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e5e5",
                background: "#fafafa",
                fontWeight: 900,
              }}
            >
              {week.from} ~ {week.to}
            </div>

            <button onClick={goNextWeek} style={ghostBtn}>▶</button>
            <button onClick={goThisWeek} style={ghostBtn}>이번 주</button>
            <button onClick={load} style={darkBtn}>새로고침</button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 280px) minmax(220px, 1fr) auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? t.id}
                </option>
              ))}
            </select>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="강사명 / 수강생명 검색"
              style={{ ...inputStyle, width: "100%" }}
            />

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "#fff",
                fontSize: 14,
                fontWeight: 800,
                width: isMobile ? "100%" : "auto",
                boxSizing: "border-box",
              }}
            >
              <input
                type="checkbox"
                checked={showCanceledLessons}
                onChange={(e) => setShowCanceledLessons(e.target.checked)}
              />
              취소 수업 표시
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(3, minmax(0, 1fr))"
                : "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            <SummaryBox label="표시 강사" value={`${totalTeacherCount}명`} compact={isMobile} />
            <SummaryBox label="이번 주 수업" value={`${totalLessonCount}개`} compact={isMobile} />
            <SummaryBox label="담당 수강생" value={`${totalStudentCount}명`} compact={isMobile} />
          </div>
        </div>

        <div style={{ height: 14 }} />

        {loading ? (
          <div style={emptyCardStyle}>불러오는 중...</div>
        ) : visibleCards.length === 0 ? (
          <div style={emptyCardStyle}>조건에 맞는 강사가 없어요.</div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              {visibleCards.map((card) => {
                const color = teacherColor(card.teacher.id);
                const active = selectedTeacherCard?.teacher.id === card.teacher.id;

                return (
                  <button
                    key={card.teacher.id}
                    type="button"
                    onClick={() => setSelectedTeacherId(card.teacher.id)}
                    style={{
                      textAlign: "left",
                      border: active ? `2px solid ${color}` : "1px solid #e5e5e5",
                      borderRadius: 16,
                      background: "#fff",
                      padding: 14,
                      display: "grid",
                      gap: 10,
                      cursor: "pointer",
                      boxShadow: active ? "0 8px 24px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          background: color,
                          flex: "0 0 auto",
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 1000,
                            fontSize: isMobile ? 17 : 18,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {card.teacher.name ?? "(이름 없음)"}
                        </div>
                        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                          근무 요일: {card.workDaysLabel}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 8,
                      }}
                    >
                      <MiniMetric label="수업" value={`${card.lessonCount}`} />
                      <MiniMetric label="활성" value={`${card.activeLessonCount}`} />
                      <MiniMetric label="수강생" value={`${card.uniqueStudentCount}`} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ height: 16 }} />

            <div
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 16,
                background: "#fff",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: 16,
                  borderBottom: "1px solid #f0f0f0",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 1000 }}>
                      {selectedTeacherCard?.teacher.name ?? "강사 선택"}
                    </div>
                    <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                      연한 초록은 근무 가능 시간, 회색은 변경 차단 시간, 진한 블록은 이미 배정된 수업이에요.
                    </div>
                  </div>

                  {selectedTeacherCard && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <InfoPill label="근무 요일" value={selectedTeacherCard.workDaysLabel} />
                      <InfoPill label="이번 주 수업" value={`${selectedTeacherCard.lessonCount}개`} />
                      <InfoPill label="담당 수강생" value={`${selectedTeacherCard.uniqueStudentCount}명`} />
                    </div>
                  )}
                </div>
              </div>

              {!selectedTeacherCard ? (
                <div style={{ padding: 24, color: "#666" }}>선택된 강사가 없어요.</div>
              ) : (
                <TeacherWeeklyCalendar
                  teacher={selectedTeacherCard.teacher}
                  weekDays={week.days}
                  calendarHours={calendarHours}
                  availabilityRows={selectedTeacherCard.availabilityRows}
                  lessons={selectedTeacherCard.lessons}
                  showCanceledLessons={showCanceledLessons}
                  isMobile={isMobile}
                  changeBlocks={selectedTeacherChangeBlocks}
                />
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayoutShell>
  );
}

function TeacherWeeklyCalendar({
  teacher,
  weekDays,
  calendarHours,
  availabilityRows,
  lessons,
  showCanceledLessons,
  isMobile,
  changeBlocks,
}: {
  teacher: Teacher;
  weekDays: Date[];
  calendarHours: string[];
  availabilityRows: AvailabilityRow[];
  lessons: LessonRow[];
  showCanceledLessons: boolean;
  isMobile: boolean;
  changeBlocks: ChangeBlock[];
}) {
  const TIME_W = isMobile ? 64 : 88;
  const DAY_W = isMobile ? 120 : 180;
  const HEAD_H = isMobile ? 48 : 58;
  const ROW_H = isMobile ? 54 : 66;

  const visibleLessons = useMemo(() => {
    return lessons.filter((l) => {
      if (showCanceledLessons) return true;
      return String(l.status ?? "").toLowerCase() !== "canceled";
    });
  }, [lessons, showCanceledLessons]);

  const lessonsMap = useMemo(() => {
    const map = new Map<string, LessonRow[]>();
    visibleLessons.forEach((lesson) => {
      const key = `${lesson.lesson_date}|${hhmm(lesson.lesson_time)}`;
      const arr = map.get(key) ?? [];
      arr.push(lesson);
      map.set(key, arr);
    });
    return map;
  }, [visibleLessons]);

  const hasAvailabilityAt = useCallback(
    (date: Date, hourText: string) => {
      const weekday = date.getDay();
      const target = toMin(hourText);

      return availabilityRows.some((row) => {
        const rowWeekday = normalizeWeekday(row.weekday);
        if (rowWeekday !== weekday) return false;

        const start = toMin(row.start_time);
        const end = toMin(row.end_time);
        return target >= start && target < end;
      });
    },
    [availabilityRows]
  );

  const getBlockedReason = useCallback(
    (date: Date, time: string) => {
      const weekday = date.getDay();
      const t = toMin(time);

      const hit = changeBlocks.find((b) => {
        if (!b.is_active) return false;
        if (normalizeWeekday(Number(b.weekday)) !== weekday) return false;

        const s = toMin(b.start_time);
        const e = toMin(b.end_time);

        return t >= s && t < e;
      });

      if (!hit) return null;
      return hit.reason?.trim() || "변경 차단 시간";
    },
    [changeBlocks]
  );

  const minWidth = TIME_W + weekDays.length * DAY_W;

  const mobileLessonList = useMemo(() => {
    return visibleLessons.slice().sort((a, b) => {
      if (a.lesson_date !== b.lesson_date) return a.lesson_date.localeCompare(b.lesson_date);
      return hhmm(a.lesson_time).localeCompare(hhmm(b.lesson_time));
    });
  }, [visibleLessons]);

  const weeklyChangeBlockLabels = useMemo(() => {
    return Array.from(
      changeBlocks.reduce((map, row) => {
        if (!row.is_active) return map;
        const wd = normalizeWeekday(row.weekday);
        const key = `${wd}-${hhmm(row.start_time)}-${hhmm(row.end_time)}-${row.reason ?? ""}`;
        if (!map.has(key)) {
          const reasonText = row.reason?.trim() ? ` (${row.reason.trim()})` : "";
          map.set(
            key,
            `${weekdayLabel[wd]} ${hhmm(row.start_time)}~${hhmm(row.end_time)}${reasonText}`
          );
        }
        return map;
      }, new Map<string, string>()).values()
    );
  }, [changeBlocks]);

  return (
    <>
      <div
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <div style={{ minWidth }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `${TIME_W}px repeat(${weekDays.length}, ${DAY_W}px)`,
              position: "sticky",
              top: 0,
              zIndex: 5,
              background: "#fff",
              borderBottom: "1px solid #ececec",
            }}
          >
            <div
              style={{
                position: "sticky",
                left: 0,
                zIndex: 6,
                height: HEAD_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                color: "#666",
                borderRight: "1px solid #ececec",
                background: "#fafafa",
              }}
            >
              시간
            </div>

            {weekDays.map((d) => {
              const dateStr = ymd(d);
              const isToday = dateStr === ymd(new Date());

              return (
                <div
                  key={dateStr}
                  style={{
                    height: HEAD_H,
                    padding: isMobile ? "6px 8px" : "8px 10px",
                    borderRight: "1px solid #ececec",
                    background: isToday ? "#111" : "#fafafa",
                    color: isToday ? "#fff" : "#111",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 2,
                  }}
                >
                  <div style={{ fontWeight: 1000, fontSize: isMobile ? 13 : 15 }}>
                    {dateLabel(dateStr)}
                  </div>
                  <div style={{ fontSize: isMobile ? 11 : 12, opacity: isToday ? 0.9 : 0.7 }}>
                    {dateStr}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `${TIME_W}px repeat(${weekDays.length}, ${DAY_W}px)`,
            }}
          >
            {calendarHours.map((hourText) => (
              <div key={`row-${hourText}`} style={{ display: "contents" }}>
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 4,
                    minHeight: ROW_H,
                    borderRight: "1px solid #ececec",
                    borderBottom: "1px solid #ececec",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: isMobile ? 12 : 13,
                    color: "#555",
                    background: "#fcfcfc",
                  }}
                >
                  {hourText}
                </div>

                {weekDays.map((d) => {
                  const dateStr = ymd(d);
                  const key = `${dateStr}|${hourText}`;
                  const cellLessons = lessonsMap.get(key) ?? [];
                  const available = hasAvailabilityAt(d, hourText);
                  const blockedReason = getBlockedReason(d, hourText);
                  const blocked = Boolean(blockedReason);

                  return (
                    <div
                      key={`${dateStr}-${hourText}`}
                      title={blocked ? `변경 차단: ${blockedReason}` : undefined}
                      style={{
                        minHeight: ROW_H,
                        borderRight: "1px solid #ececec",
                        borderBottom: "1px solid #ececec",
                        padding: isMobile ? 4 : 6,
                        background: blocked
                          ? "#f3f4f6"
                          : available
                          ? "#edf9f0"
                          : "#fafafa",
                        position: "relative",
                      }}
                    >
                      {blocked && (
                        <>
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              backgroundImage:
                                "repeating-linear-gradient(135deg, rgba(0,0,0,0.06) 0 6px, transparent 6px 12px)",
                              pointerEvents: "none",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              right: 6,
                              bottom: 4,
                              maxWidth: "70%",
                              fontSize: isMobile ? 9 : 10,
                              fontWeight: 900,
                              color: "#6b7280",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              pointerEvents: "none",
                            }}
                          >
                            {blockedReason}
                          </div>
                        </>
                      )}

                      {cellLessons.length === 0 ? (
                        blocked ? (
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 10,
                              border: "1px dashed #cbd5e1",
                              background: "rgba(243,244,246,0.72)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: isMobile ? 11 : 12,
                              fontWeight: 800,
                              color: "#6b7280",
                              position: "relative",
                              zIndex: 1,
                            }}
                          >
                            변경 차단
                          </div>
                        ) : available ? (
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 10,
                              border: "1px dashed #b8dfc1",
                              background: "rgba(255,255,255,0.72)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: isMobile ? 11 : 12,
                              fontWeight: 800,
                              color: "#4b7b55",
                              position: "relative",
                              zIndex: 1,
                            }}
                          >
                            빈 시간
                          </div>
                        ) : null
                      ) : (
                        <div style={{ display: "grid", gap: 4, position: "relative", zIndex: 2 }}>
                          {cellLessons.map((lesson) => {
                            const canceled = String(lesson.status ?? "").toLowerCase() === "canceled";

                            return (
                              <div
                                key={lesson.id}
                                style={{
                                  borderRadius: 10,
                                  padding: isMobile ? "6px 7px" : "8px 9px",
                                  background: canceled ? "#d9d9d9" : "#111",
                                  color: canceled ? "#666" : "#fff",
                                  fontSize: isMobile ? 11 : 12,
                                  lineHeight: 1.3,
                                  fontWeight: 900,
                                  opacity: canceled ? 0.8 : 1,
                                }}
                                title={`${lesson.lesson_date} ${hhmm(lesson.lesson_time)} / ${lesson.student_name} / ${roomLabel(lesson.room_name)} / ${statusLabel(lesson.status)}`}
                              >
                                <div style={{ fontSize: isMobile ? 10 : 11, opacity: canceled ? 0.9 : 0.85 }}>
                                  {hhmm(lesson.lesson_time)} · {roomLabel(lesson.room_name)}
                                </div>
                                <div
                                  style={{
                                    marginTop: 2,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {lesson.student_name || "-"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: 14,
          display: "grid",
          gap: 10,
          borderBottom: isMobile ? "1px solid #f0f0f0" : "none",
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 1000 }}>근무 시간 요약</div>

        {availabilityRows.length === 0 ? (
          <div style={{ color: "#777" }}>등록된 근무시간이 없습니다.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Array.from(
              availabilityRows.reduce((map, row) => {
                const wd = normalizeWeekday(row.weekday);
                const key = `${wd}-${hhmm(row.start_time)}-${hhmm(row.end_time)}`;
                if (!map.has(key)) {
                  map.set(key, `${weekdayLabel[wd]} ${hhmm(row.start_time)}~${hhmm(row.end_time)}`);
                }
                return map;
              }, new Map<string, string>()).values()
            ).map((label) => (
              <span
                key={label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 11px",
                  borderRadius: 999,
                  background: "#f6f6f6",
                  border: "1px solid #e5e5e5",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        <div style={{ fontWeight: 1000, marginTop: 4 }}>변경 차단 시간</div>

        {weeklyChangeBlockLabels.length === 0 ? (
          <div style={{ color: "#777" }}>등록된 변경 차단 시간이 없습니다.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {weeklyChangeBlockLabels.map((label) => (
              <span
                key={label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 11px",
                  borderRadius: 999,
                  background: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#4b5563",
                }}
                title={label}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {isMobile && (
        <div
          style={{
            padding: 14,
            display: "grid",
            gap: 10,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 1000 }}>이번 주 수업 리스트</div>

          {mobileLessonList.length === 0 ? (
            <div style={{ color: "#777" }}>이번 주 수업이 없습니다.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {mobileLessonList.map((lesson) => {
                const canceled = String(lesson.status ?? "").toLowerCase() === "canceled";

                return (
                  <div
                    key={lesson.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 12,
                      padding: 12,
                      background: canceled ? "#fafafa" : "#fff",
                      opacity: canceled ? 0.7 : 1,
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
                      <div style={{ fontWeight: 900 }}>
                        {dateLabel(lesson.lesson_date)} · {hhmm(lesson.lesson_time)}
                      </div>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: canceled ? "#ececec" : "#111",
                          color: canceled ? "#666" : "#fff",
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        {statusLabel(lesson.status)}
                      </span>
                    </div>

                    <div style={{ marginTop: 8, display: "grid", gap: 3, fontSize: 13 }}>
                      <div>
                        수강생: <b>{lesson.student_name || "-"}</b>
                      </div>
                      <div>
                        홀: <b>{roomLabel(lesson.room_name)}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SummaryBox({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 14,
        background: "#fafafa",
        padding: compact ? 10 : 14,
      }}
    >
      <div style={{ color: "#666", fontSize: compact ? 11 : 13, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: compact ? 17 : 22, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 12,
        background: "#fafafa",
        padding: 10,
      }}
    >
      <div style={{ fontSize: 11, color: "#666", fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 1000, fontSize: 16 }}>{value}</div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        background: "#f7f7f7",
        border: "1px solid #e5e5e5",
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      {label}: {value}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  minWidth: 180,
  boxSizing: "border-box",
};

const ghostBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  fontWeight: 900,
  cursor: "pointer",
};

const darkBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const emptyCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 16,
  background: "#fff",
  padding: 24,
  color: "#666",
};