"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";

type LessonRow = {
  id: string;
  lesson_date: string;
  lesson_time: string;
  status: string;
  allow_change_override: boolean;

  teacher_id: string | null;
  teacher_name: string;
  student_id: string | null;
  student_name: string;

  room_id: string | null;
  room_name: string;

  device_type: "controller" | "turntable" | "both" | null;

  class_id: string | null;
  class_type: string | null;
  total_lessons: number | null;
  lesson_nth: number | null;
};

type AvailabilityRow = {
  teacher_id: string;
  teacher_name: string;
  date: string; // YYYY-MM-DD
  weekday: number; // 0=Sun..6=Sat
  start_time: string; // HH:mm:ss or HH:mm
  end_time: string; // HH:mm:ss or HH:mm
  device_type: "controller" | "turntable" | "both";
};

// ✅ ADD: practice row
type PracticeRow = {
  id: string;
  room_id: string | null;
  room_name: string;

  date: string; // YYYY-MM-DD
  start_time: string | null; // HH:mm
  end_time: string | null; // HH:mm

  start_ts: string | null; // YYYY-MM-DDTHH:mm:00
  end_ts: string | null;

  student_id: string | null;
  student_name: string;
};

type SimpleTeacher = { id: string; name: string };
type SimpleRoom = { id: string; name: string };

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

// ✅ 슬롯 그룹 키 (date + HH:mm + roomNorm)
function slotKey(date: string, time: string, roomNorm: "A" | "B" | "C") {
  return `${date}|${clampHHMM(time)}|${roomNorm}`;
}

// ✅ 고정하고 싶으면 여기에 넣으면 됨
const teacherColorMap: Record<string, string> = {
  // "teacher_uuid": "#7c3aed",
};

function fallbackColorFromKey(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 70% 45%)`;
}
function pickTeacherColor(teacherId: string | null, teacherName: string) {
  const k = teacherId ?? teacherName;
  return teacherColorMap[k] ?? fallbackColorFromKey(k);
}

function deviceLabel(d: LessonRow["device_type"]) {
  if (!d) return "미지정";
  if (d === "controller") return "컨트롤러";
  if (d === "turntable") return "턴테이블";
  return "둘다";
}
function classTypeLabel(t: string | null) {
  if (!t) return "알 수 없음";
  const s = t.toLowerCase();
  if (s.includes("1month")) return "1개월";
  if (s.includes("3month")) return "3개월";
  return t;
}

export default function AdminLessonsHallSheetPage() {
  // ===== layout tuning =====
  const TIME_W = 105;
  const AVAIL_W = 74; // ✅ 근무 도트 컬럼
  const COL_W = 100;

  const HEAD_H1 = 46;
  const HEAD_H2 = 40;
  const ROW_H = 38;

  const STEP_MIN = 60;
  const DEFAULT_DURATION = 60;

  const rooms = ["A", "B", "C"] as const;

  // ✅ 모달 시간 선택 (1시간 단위 고정)
  const HOUR_OPTIONS = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, i) => {
        const hh = String(i).padStart(2, "0");
        return `${hh}:00`;
      }),
    []
  );

  // ✅ 상태(B안: 소문자 고정)
  const STATUS_ADMIN_CHANGED = "admin_changed";
  const STATUS_CANCELED = "canceled";
  const STATUS_OPTIONS = [
    { value: STATUS_ADMIN_CHANGED, label: "관리자변경" },
    { value: STATUS_CANCELED, label: "취소" },
  ] as const;

  const [weekStart, setWeekStart] = useState(() => ymd(startOfWeek(new Date())));
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ ADD: practice state
  const [practice, setPractice] = useState<PracticeRow[]>([]);

  const [selectedLessonId, setSelectedLessonId] = useState("");
  const selectedLesson = useMemo(
    () => lessons.find((l) => l.id === selectedLessonId) ?? null,
    [lessons, selectedLessonId]
  );

  // ✅ 요일 선택 (근무도트는 선택된 요일 기준으로만 표시)
  const [selectedDow, setSelectedDow] = useState<number | null>(null);

  // ✅ hover tooltip (근무도트)
  const [hoverTime, setHoverTime] = useState<string>("");

  // ✅ 취소 이력 팝오버 open (placed lesson id)
  const [historyOpenFor, setHistoryOpenFor] = useState<string>("");

  // ===== 관리자 강제 수정 (modal) =====
  const [forceEditOpen, setForceEditOpen] = useState(false);
  const [forceSaving, setForceSaving] = useState(false);

  const [metaLoading, setMetaLoading] = useState(false);
  const [teachersAll, setTeachersAll] = useState<SimpleTeacher[]>([]);
  const [roomsAll, setRoomsAll] = useState<SimpleRoom[]>([]);

  const [feDate, setFeDate] = useState("");
  const [feTime, setFeTime] = useState("");
  const [feTeacherId, setFeTeacherId] = useState<string>("");
  const [feRoomId, setFeRoomId] = useState<string>("");
  const [feStatus, setFeStatus] = useState<string>(STATUS_ADMIN_CHANGED);
  const [feReason, setFeReason] = useState<string>("");

  const isCancelMode = feStatus === STATUS_CANCELED;

  const week = useMemo(() => {
    const ws = parseYmd(weekStart);
    const days = Array.from({ length: 7 }).map((_, i) => addDays(ws, i));
    return { days, from: ymd(days[0]), to: ymd(days[6]) };
  }, [weekStart]);

  // ✅ load는 useCallback으로 고정 + 포커스/가시성 복귀 시 재호출 가능
  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("from", week.from);
    qs.set("to", week.to);

    const res = await authFetch(`/api/admin/lessons?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "레슨 현황 조회 실패");
      setLessons([]);
      setAvailability([]);
      setPractice([]); // ✅ ADD
      setLoading(false);
      return;
    }

    setLessons((data.lessons ?? data.rows ?? []) as LessonRow[]);
    setAvailability((data.availability ?? []) as AvailabilityRow[]);
    setPractice((data.practice_reservations ?? []) as PracticeRow[]); // ✅ ADD
    setLoading(false);
  }, [week.from, week.to]);

  useEffect(() => {
    load();
  }, [load]);

  // ✅ 탭/창 다시 보면 자동 새로고침
  useEffect(() => {
    const onFocus = () => load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const loadMeta = async () => {
    setMetaLoading(true);
    const res = await authFetch("/api/admin/meta", { method: "GET" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error ?? "강사/룸 목록 조회 실패");
      setTeachersAll([]);
      setRoomsAll([]);
      setMetaLoading(false);
      return;
    }
    setTeachersAll((json.teachers ?? []) as SimpleTeacher[]);
    setRoomsAll((json.rooms ?? []) as SimpleRoom[]);
    setMetaLoading(false);
  };

  const openForceEdit = async () => {
    if (!selectedLesson) return;

    setFeDate(selectedLesson.lesson_date ?? "");
    setFeTime(clampHHMM(selectedLesson.lesson_time ?? "") || "");
    setFeTeacherId(selectedLesson.teacher_id ?? "");
    setFeRoomId(selectedLesson.room_id ?? "");

    const st = String(selectedLesson.status ?? "");
    setFeStatus(st === STATUS_CANCELED ? STATUS_CANCELED : STATUS_ADMIN_CHANGED);

    setFeReason("");
    setForceEditOpen(true);

    if (teachersAll.length === 0 || roomsAll.length === 0) {
      await loadMeta();
    }
  };

  const saveForceEdit = async () => {
    if (!selectedLesson) return;

    if (!isCancelMode) {
      if (!feDate || !feTime) {
        alert("날짜/시간은 필수야.");
        return;
      }
    }

    const payloadCommon = {
      status: feStatus, // admin_changed or canceled
      reason: feReason || null,
    };

    const payloadAdminChanged = {
      ...payloadCommon,
      lesson_date: feDate,
      lesson_time: feTime.length === 5 ? `${feTime}:00` : feTime,
      teacher_id: feTeacherId ? feTeacherId : null,
      room_id: feRoomId ? feRoomId : null,
    };

    const payload = isCancelMode ? payloadCommon : payloadAdminChanged;

    setForceSaving(true);

    let res = await authFetch(`/api/admin/lessons/${selectedLesson.id}/force-update`, {
      method: "POST",
      body: JSON.stringify({ ...payload, force: false }),
    });
    let json = await res.json().catch(() => ({}));

    if (!isCancelMode && res.status === 409 && json?.error === "CONFLICT") {
      const n = json?.conflicts?.length ?? 1;
      const ok = confirm(`⚠️ 같은 시간/같은 룸에 다른 레슨이 ${n}개 있어.\n그래도 변경할까?`);
      if (!ok) {
        setForceSaving(false);
        return;
      }

      res = await authFetch(`/api/admin/lessons/${selectedLesson.id}/force-update`, {
        method: "POST",
        body: JSON.stringify({ ...payload, force: true }),
      });
      json = await res.json().catch(() => ({}));
    }

    if (!res.ok) {
      alert(json.error ?? "강제 수정 실패");
      setForceSaving(false);
      return;
    }

    alert(isCancelMode ? "취소 처리 완료" : "수정 완료");
    setForceEditOpen(false);
    setForceSaving(false);

    // ✅ 저장 후 최신 반영
    setSelectedLessonId(selectedLesson.id);
    await load();
  };

  // ===== time range by lessons + availability =====
  const timeRange = useMemo(() => {
    let minM = 12 * 60;
    let maxM = 23 * 60;

    const mins: number[] = [];
    const maxs: number[] = [];

    lessons.forEach((l) => {
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
  }, [lessons, availability]);

  const slotTimes = useMemo(() => {
    const arr: string[] = [];
    for (let m = timeRange.minM; m < timeRange.maxM; m += STEP_MIN) {
      arr.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
    }
    return arr;
  }, [timeRange]);

  // ===== columns (date x room) =====
  type Col = { dateStr: string; room: (typeof rooms)[number] };
  const cols = useMemo<Col[]>(() => {
    const out: Col[] = [];
    week.days.forEach((d) => {
      const dateStr = ymd(d);
      rooms.forEach((room) => out.push({ dateStr, room }));
    });
    return out;
  }, [week.days]);

  // ✅ 슬롯별 lessons 그룹 (date+time+roomNorm)
  const lessonsBySlot = useMemo(() => {
    const m = new Map<string, LessonRow[]>();
    for (const l of lessons) {
      const roomNorm = normalizeRoom(l.room_name);
      const k = slotKey(l.lesson_date, l.lesson_time, roomNorm);
      const arr = m.get(k) ?? [];
      arr.push(l);
      m.set(k, arr);
    }
    return m;
  }, [lessons]);

  // ✅ ADD: practice 슬롯 그룹 (2시간이면 2칸 표시)
  const practiceBySlot = useMemo(() => {
    const m = new Map<string, PracticeRow[]>();

    for (const p of practice) {
      if (!p.date || !p.start_time || !p.end_time) continue;

      const roomNorm = normalizeRoom(p.room_name);
      const stM = minutesOf(p.start_time);
      const edM = minutesOf(p.end_time);

      if (!Number.isFinite(stM) || !Number.isFinite(edM)) continue;
      if (edM <= stM) continue;

      // ✅ 1시간 슬롯 단위로 분할: [start, end) 범위에 포함되는 시간칸 모두 넣기
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

  // ===== place lessons into grid (메인 1개 + 취소 이력) =====
  type PlacedLesson = LessonRow & {
    colIndex: number;
    rowStart: number;
    rowSpan: number;
    room_norm: "A" | "B" | "C";

    canceled_count: number;
    canceled_list: LessonRow[];
    has_active: boolean;
  };

  const placedLessons = useMemo<PlacedLesson[]>(() => {
    const mapCol = new Map<string, number>();
    cols.forEach((c, idx) => mapCol.set(`${c.dateStr}|${c.room}`, idx));

    const out: PlacedLesson[] = [];

    lessonsBySlot.forEach((slotLessons, key) => {
      const [dateStr, hhmm, roomNorm] = key.split("|") as [string, string, "A" | "B" | "C"];
      const colIndex = mapCol.get(`${dateStr}|${roomNorm}`);
      if (colIndex === undefined) return;

      const actives = slotLessons.filter((x) => String(x.status ?? "") !== STATUS_CANCELED);
      const canceled = slotLessons.filter((x) => String(x.status ?? "") === STATUS_CANCELED);

      const main = actives[0] ?? canceled[0];
      if (!main) return;

      const stMin = minutesOf(main.lesson_time);
      const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
      const rowSpan = Math.max(1, Math.round(DEFAULT_DURATION / STEP_MIN));

      out.push({
        ...main,
        colIndex,
        rowStart,
        rowSpan,
        room_norm: roomNorm,
        canceled_count: canceled.length,
        canceled_list: canceled,
        has_active: actives.length > 0,
      });
    });

    return out;
  }, [lessonsBySlot, cols, timeRange]);

  // ✅ Legend: availability(근무) 기준 강사만
  const legendTeachers = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string }>();

    availability.forEach((a) => {
      const id = String(a.teacher_id);
      const name = String(a.teacher_name ?? "알 수 없음");
      if (!id) return;
      if (seen.has(id)) return;

      seen.set(id, {
        id,
        name,
        color: pickTeacherColor(id, name),
      });
    });

    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [availability]);

  // ✅ 선택된 요일 기준 근무(availability) 그룹핑:
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

    // ranges 정리(정렬 + 겹침 병합)
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
    map.forEach((m2, t) => {
      byTime.set(t, Array.from(m2.values()).sort((a, b) => String(a.id).localeCompare(String(b.id))));
    });

    return { byTime, detailByTeacherId };
  }, [availability, slotTimes, selectedDow]);

  const renderAvailDots = (teachers: { id: string; name: string }[]) => {
    if (!teachers || teachers.length === 0) return null;
    const top = teachers.slice(0, 3);

    return (
      <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "center" }}>
        {top.map((t) => (
          <span
            key={t.id}
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: pickTeacherColor(t.id, t.name),
              border: "1px solid rgba(0,0,0,0.18)",
              display: "inline-block",
              opacity: 0.26,
            }}
          />
        ))}
      </div>
    );
  };

  const goPrevWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() - 7);
    setSelectedLessonId("");
    setHistoryOpenFor("");
    setHoverTime("");
    setSelectedDow(null);
    setWeekStart(ymd(startOfWeek(d)));
  };
  const goNextWeek = () => {
    const d = parseYmd(weekStart);
    d.setDate(d.getDate() + 7);
    setSelectedLessonId("");
    setHistoryOpenFor("");
    setHoverTime("");
    setSelectedDow(null);
    setWeekStart(ymd(startOfWeek(d)));
  };
  const goThisWeek = () => {
    setSelectedLessonId("");
    setHistoryOpenFor("");
    setHoverTime("");
    setSelectedDow(null);
    setWeekStart(ymd(startOfWeek(new Date())));
  };

  const gridColsTemplate = useMemo(() => `${TIME_W}px ${AVAIL_W}px repeat(${cols.length}, ${COL_W}px)`, [cols.length]);

  return (
    <AdminLayoutShell title="레슨 현황 (주간 · 홀별)">
      <div style={{ maxWidth: 1600 }}>
        {/* Controls + Legend */}
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
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            ◀
          </button>

          <div style={{ fontWeight: 900 }}>
            {week.from} ~ {week.to}
          </div>

          <button
            onClick={goNextWeek}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            ▶
          </button>

          <button
            onClick={goThisWeek}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            이번주
          </button>

          <button
            onClick={load}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            새로고침
          </button>

          <div style={{ marginLeft: "auto", color: "#666", fontSize: 13 }}>
            {loading ? "불러오는 중..." : `레슨 ${lessons.length}개 · 강사 ${legendTeachers.length}명`}
          </div>

          {/* Legend */}
          {legendTeachers.length > 0 && (
            <div style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
              <div style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>강사 색상:</div>
              {legendTeachers.slice(0, 12).map((t) => (
                <div key={t.id ?? t.name} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: t.color,
                      display: "inline-block",
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "#111", fontWeight: 900 }}>{t.name}</span>
                </div>
              ))}
              {legendTeachers.length > 12 && (
                <span style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>+{legendTeachers.length - 12}</span>
              )}
            </div>
          )}

          {/* 요일 선택 안내 */}
          <div style={{ width: "100%", marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>요일 선택하면 근무 도트가 그 요일 기준으로 표시돼요.</div>
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
                  height: 46,
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
                      height: 46,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      background: isSelected ? "#111" : isToday ? "#111" : "#fafafa",
                      color: isSelected ? "#fff" : isToday ? "#fff" : "#111",
                      borderRight: "1px solid #eee",
                      letterSpacing: 0.2,
                      cursor: "pointer",
                      outline: "none",
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
              <div style={{ position: "sticky", left: 0, zIndex: 60, height: 40, background: "#fff", borderRight: "1px solid #eee" }} />

              <div
                style={{
                  position: "sticky",
                  left: 105,
                  zIndex: 60,
                  height: 40,
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
                    height: 40,
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
                        width: 260,
                        maxHeight: 280,
                        overflow: "auto",
                        border: "1px solid #e5e5e5",
                        borderRadius: 12,
                        background: "#fff",
                        boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
                        padding: 10,
                        zIndex: 999,
                      }}
                    >
                      <div style={{ fontWeight: 1000, fontSize: 12, color: "#111" }}>
                        {DOW_KR[selectedDow ?? 0]} · {t} 근무 가능 ({teachers.length}명)
                      </div>

                      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        {teachers.map((x) => {
                          const detail = availByTimeForSelectedDow.detailByTeacherId.get(x.id);
                          const ranges = detail?.ranges ?? [];
                          return (
                            <div key={x.id} style={{ display: "grid", gap: 2 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 999,
                                    background: pickTeacherColor(x.id, x.name),
                                    border: "1px solid rgba(0,0,0,0.15)",
                                    display: "inline-block",
                                    opacity: 0.26,
                                  }}
                                />
                                <span style={{ fontSize: 12, color: "#111", fontWeight: 900 }}>{x.name}</span>
                              </div>
                              {ranges.length > 0 ? (
                                <div style={{ fontSize: 11, color: "#666", fontWeight: 900, paddingLeft: 18 }}>
                                  {ranges.map((r, idx) => (
                                    <span key={`${x.id}-${idx}`}>
                                      {r.start}–{r.end}
                                      {idx < ranges.length - 1 ? " · " : ""}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: 11, color: "#888", paddingLeft: 18 }}>근무시간 정보 없음</div>
                              )}
                            </div>
                          );
                        })}
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

            {/* Practice blocks (연습실 오렌지) */}
            {Array.from(practiceBySlot.entries()).flatMap(([key, list]) => {
              const [dateStr, hhmm, roomNorm] = key.split("|") as [string, string, "A" | "B" | "C"];

              const colIndex = cols.findIndex((c) => c.dateStr === dateStr && c.room === roomNorm);
              if (colIndex === -1) return [];

              const stMin = minutesOf(hhmm);
              const rowStart = Math.floor((stMin - timeRange.minM) / STEP_MIN) + 1;
              const rowSpan = 1; // 1시간 슬롯 고정

              return list.map((p) => (
                <div
                  key={`${p.id}-${key}`}
                  style={{
                    gridColumn: colIndex + 3,
                    gridRow: `${rowStart} / span ${rowSpan}`,
                    margin: 4,
                    borderRadius: 10,
                    border: "2px solid rgba(0,0,0,0.12)",
                    background: "#f97316", // 🟧 오렌지
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

            {/* Lesson blocks (메인 1개 + 취소 이력 뱃지/팝오버) */}
            {placedLessons.map((l) => {
              const isSelected = selectedLessonId === l.id;
              const teacherColor = pickTeacherColor(l.teacher_id, l.teacher_name);

              const mainIsCanceled = String(l.status ?? "") === STATUS_CANCELED; // active 없는 슬롯일 때
              const bg = mainIsCanceled ? "rgba(0,0,0,0.08)" : teacherColor;

              const showHistoryBadge = l.has_active && l.canceled_count > 0;
              const popOpen = historyOpenFor === l.id;

              return (
                <button
                  key={l.id}
                  onClick={() => setSelectedLessonId(l.id)}
                  style={{
                    gridColumn: l.colIndex + 3,
                    gridRow: `${l.rowStart} / span ${l.rowSpan}`,
                    margin: 4,
                    borderRadius: 10,
                    border: mainIsCanceled
                      ? `2px dashed ${isSelected ? "#111" : "rgba(0,0,0,0.35)"}`
                      : `2px solid ${isSelected ? "#111" : "rgba(0,0,0,0.12)"}`,
                    background: bg,
                    color: mainIsCanceled ? "#111" : "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: "8px 10px",
                    display: "flex",
                    alignItems: "center",
                    boxShadow: isSelected ? "0 6px 18px rgba(0,0,0,0.18)" : "none",
                    overflow: "hidden",
                    position: "relative",
                    zIndex: 10,
                    minHeight: 28,
                    opacity: mainIsCanceled ? 0.55 : 1,
                  }}
                  title={`${l.lesson_date} ${clampHHMM(l.lesson_time)} / ${l.room_norm}홀\n${l.student_name} / ${l.teacher_name}\nstatus=${l.status}`}
                  onMouseLeave={() => setHistoryOpenFor("")}
                >
                  {showHistoryBadge && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setHistoryOpenFor((prev) => (prev === l.id ? "" : l.id));
                      }}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.55)",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 1000,
                        border: "1px solid rgba(255,255,255,0.25)",
                        cursor: "pointer",
                      }}
                      title="취소 이력 보기"
                    >
                      이력 {l.canceled_count}
                    </span>
                  )}

                  {showHistoryBadge && popOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        top: 32,
                        right: 6,
                        width: 260,
                        maxHeight: 220,
                        overflow: "auto",
                        border: "1px solid #e5e5e5",
                        borderRadius: 12,
                        background: "#fff",
                        boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
                        padding: 10,
                        color: "#111",
                        zIndex: 999,
                      }}
                    >
                      <div style={{ fontWeight: 1100, fontSize: 12 }}>취소 이력 ({l.canceled_count}건)</div>
                      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        {l.canceled_list.slice(0, 10).map((x) => (
                          <div
                            key={x.id}
                            style={{
                              border: "1px solid #f0f0f0",
                              borderRadius: 10,
                              padding: 8,
                              background: "#fafafa",
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 1100 }}>
                              {x.student_name} <span style={{ color: "#666" }}>· {x.teacher_name}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#666", fontWeight: 900, marginTop: 2 }}>
                              {x.lesson_date} {clampHHMM(x.lesson_time)} · {normalizeRoom(x.room_name)}홀 · status=canceled
                            </div>
                          </div>
                        ))}
                        {l.canceled_count > 10 && (
                          <div style={{ fontSize: 11, color: "#666", fontWeight: 900 }}>+ {l.canceled_count - 10}건 더 있음</div>
                        )}
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      fontWeight: 1100,
                      fontSize: 13,
                      lineHeight: "16px",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      width: "100%",
                      textShadow: mainIsCanceled ? "none" : "0 1px 1px rgba(0,0,0,0.18)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {mainIsCanceled ? (
                      <>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(0,0,0,0.25)",
                            background: "rgba(255,255,255,0.75)",
                            fontSize: 12,
                            fontWeight: 1100,
                          }}
                        >
                          취소
                        </span>
                        <span style={{ fontWeight: 1000, color: "#111" }}>{l.student_name}</span>
                      </>
                    ) : (
                      l.student_name
                    )}
                  </div>
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
                  {selectedLesson.lesson_date} {clampHHMM(selectedLesson.lesson_time)} · {normalizeRoom(selectedLesson.room_name)}홀
                </b>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={openForceEdit}
                    style={{
                      border: "1px solid #111",
                      background: "#111",
                      color: "#fff",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    관리자 강제 수정
                  </button>

                  <button
                    onClick={() => {
                      setSelectedLessonId("");
                      setHistoryOpenFor("");
                    }}
                    style={{
                      border: "1px solid #ddd",
                      background: "#fff",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    선택 해제
                  </button>
                </div>
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
                <div>
                  기기: <b>{deviceLabel(selectedLesson.device_type)}</b>
                </div>
                <div>
                  수강권: <b>{classTypeLabel(selectedLesson.class_type)}</b>
                  {selectedLesson.total_lessons ? <span style={{ color: "#666" }}> · 총 {selectedLesson.total_lessons}회</span> : null}
                </div>
                <div>
                  진행:{" "}
                  <b>
                    {selectedLesson.lesson_nth ? selectedLesson.lesson_nth : "?"}
                    {selectedLesson.total_lessons ? ` / ${selectedLesson.total_lessons}` : ""}
                  </b>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Force Edit Modal ===== */}
      {forceEditOpen && selectedLesson && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => !forceSaving && setForceEditOpen(false)}
        >
          <div
            style={{
              width: "min(720px, 96vw)",
              borderRadius: 14,
              background: "#fff",
              border: "1px solid #eee",
              padding: 14,
              boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 1100, fontSize: 14 }}>관리자 강제 수정</div>
              <button
                onClick={() => setForceEditOpen(false)}
                disabled={forceSaving}
                style={{
                  border: "1px solid #ddd",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                닫기
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#666", fontWeight: 900, lineHeight: "18px" }}>
              ⚠️ 근무시간/마감/정책 무시하고 바로 수정됩니다. 같은 시간/같은 룸 충돌은 저장 시 경고합니다.
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {/* 상태 */}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#666", fontWeight: 1000 }}>상태</div>
                <select
                  value={feStatus}
                  onChange={(e) => setFeStatus(e.target.value)}
                  disabled={forceSaving}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 900 }}
                >
                  {STATUS_OPTIONS.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>

              {!isCancelMode ? (
                <>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 1000 }}>날짜</div>
                    <input
                      type="date"
                      value={feDate}
                      onChange={(e) => setFeDate(e.target.value)}
                      disabled={forceSaving}
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 900 }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 1000 }}>시간(1시간 단위)</div>
                    <select
                      value={feTime}
                      onChange={(e) => setFeTime(e.target.value)}
                      disabled={forceSaving}
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 900 }}
                    >
                      <option value="">시간 선택</option>
                      {HOUR_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 1000 }}>강사</div>
                    <select
                      value={feTeacherId}
                      onChange={(e) => setFeTeacherId(e.target.value)}
                      disabled={forceSaving || metaLoading}
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 900 }}
                    >
                      <option value="">(미지정)</option>
                      {teachersAll.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 1000 }}>룸</div>
                    <select
                      value={feRoomId}
                      onChange={(e) => setFeRoomId(e.target.value)}
                      disabled={forceSaving || metaLoading}
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 900 }}
                    >
                      <option value="">(미지정)</option>
                      {roomsAll.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #eee",
                    background: "#fafafa",
                    fontSize: 12,
                    color: "#666",
                    fontWeight: 900,
                    lineHeight: "18px",
                  }}
                >
                  ✅ <b style={{ color: "#111" }}>취소</b> 선택 시 날짜/시간/강사/룸은 변경하지 않고, 상태만 취소로 업데이트됩니다.
                  <br />
                  이 레슨 시간은 다른 변경/배정에 사용할 수 있게 “비어있는 슬롯”처럼 운용하면 됩니다.
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#666", fontWeight: 1000 }}>사유(로그 기록용)</div>
              <input
                value={feReason}
                onChange={(e) => setFeReason(e.target.value)}
                disabled={forceSaving}
                placeholder="예: 학생 요청으로 일정 조정 / 운영상 변경 ..."
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontWeight: 900 }}
              />
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setForceEditOpen(false)}
                disabled={forceSaving}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 1000,
                }}
              >
                닫기
              </button>
              <button
                onClick={saveForceEdit}
                disabled={forceSaving}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 1100,
                }}
              >
                {forceSaving ? "저장 중..." : isCancelMode ? "취소 처리" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayoutShell>
  );
}