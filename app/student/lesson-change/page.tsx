"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import StudentTopNav from "@/components/student/StudentTopNav";

type Status = "PENDING" | "APPROVED" | "REJECTED";
type RequestType = "CHANGE" | "EXTENSION";

type LessonRow = {
  id: string;
  class_id: string;
  lesson_date: string; // "YYYY-MM-DD"
  lesson_time: string; // "HH:MM:SS"
  teacher_id: string | null;
  room_id: string | null;
  teacher_name: string | null;
  room_name: string | null;
  change_locked: boolean | null;
  changed_at: string | null;
};

type ActiveClass = {
  id: string;
  type: "1month" | "3month";
  start_date: string; // "YYYY-MM-DD"
  end_date: string; // "YYYY-MM-DD"
  extension_uses_total: number;
  extension_uses_used: number;
};

type ToastKind = "ok" | "warn" | "err";

type ChangeOptionsByDate = Record<
  string,
  { times: { time: string; rooms: { id: string; name: string }[] }[] }
>;

type OptionsApiResponse = {
  rooms?: { id: string; name: string }[];
  by_date?: Record<string, { times?: string[]; rooms_by_time?: Record<string, string[]> }>;
  error?: string;
};

type PendingReq = {
  id: string;
  lesson_id: string;
  request_type: RequestType;
  created_at: string;
  requested_changes: any;
};

type ChangeQuotaUI = {
  loading: boolean;
  used: number | null;
  limit: number;
  // period_start/end는 UI에서 "중복 기간" 표시 때문에 더 이상 쓰지 않음(보관만)
  period_start: string | null;
  period_end: string | null;
};

type ChangeQuotaRpcRow = {
  used: number;
  quota_limit: number;
  period_start: string;
  period_end: string;
};

function clampHHMM(t: string) {
  return String(t ?? "").slice(0, 5);
}

/** ✅ KST 기준 today ("YYYY-MM-DD") */
function todayYmdKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDate(ymdStr: string) {
  const [Y, M, D] = ymdStr.split("-").map(Number);
  return new Date(Y, M - 1, D);
}

function formatKoreanDate(ymdStr: string) {
  return String(ymdStr).replaceAll("-", ".");
}

function addMonths(date: Date, diff: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + diff);
  return d;
}
function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function startOfCalendarGrid(month: Date) {
  const first = startOfMonth(month);
  const day = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}
function sameYMD(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isBeforeYMD(a: Date, b: Date) {
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return aa < bb;
}

/** ✅ (핵심) KST 기준 "수업 전날 17:00" 마감 ms(UTC 기준) */
function cutoffPrevDay1700MsKST(lessonDateYmd: string) {
  const [Y, M, D] = String(lessonDateYmd).slice(0, 10).split("-").map(Number);
  if (!Y || !M || !D) return NaN;

  const HOUR = 60 * 60 * 1000;
  const kstMidnightUtcMs = Date.UTC(Y, M - 1, D, 0, 0, 0, 0) - 9 * HOUR;
  return kstMidnightUtcMs - 24 * HOUR + 17 * HOUR;
}

function canRequestChangeByCutoff(lessonDateYmd: string) {
  const cutoffMs = cutoffPrevDay1700MsKST(lessonDateYmd);
  if (!Number.isFinite(cutoffMs)) return false;
  return Date.now() < cutoffMs;
}

function cutoffPrevDay1700(lessonDateYmd: string) {
  const dt = parseLocalDate(lessonDateYmd);
  dt.setDate(dt.getDate() - 1);
  dt.setHours(17, 0, 0, 0);
  return dt;
}

/** ✅ Supabase embed가 object/array 둘 다 올 수 있어서 방어 */
type NameObj = { name: string | null };
type NameRel = NameObj | NameObj[] | null | undefined;
function pickName(x: NameRel): string | null {
  if (!x) return null;
  return Array.isArray(x) ? x[0]?.name ?? null : x.name ?? null;
}

/* ==========================
   달력 컴포넌트(카드톤)
========================== */
function CalendarMonth(props: {
  month: Date;
  selectedYmd: string | "";
  onSelect: (ymdStr: string) => void;
  minYmd?: string | null;
  maxYmd?: string | null;
  disabledYmdSet?: Set<string>;
}) {
  const { month, selectedYmd, onSelect, minYmd, maxYmd, disabledYmdSet } = props;

  const minDate = minYmd ? parseLocalDate(minYmd) : null;
  const maxDate = maxYmd ? parseLocalDate(maxYmd) : null;

  const gridStart = startOfCalendarGrid(month);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const selectedDate = selectedYmd ? parseLocalDate(selectedYmd) : null;
  const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {dayLabels.map((d) => (
          <div key={d} style={{ fontSize: 12, color: "#666", textAlign: "center", fontWeight: 900 }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 8 }}>
        {days.map((d) => {
          const inMonth = d >= monthStart && d <= monthEnd;
          const y = ymd(d);

          const isDisabled =
            !inMonth ||
            (minDate ? isBeforeYMD(d, minDate) : false) ||
            (maxDate ? isBeforeYMD(maxDate, d) : false) ||
            (disabledYmdSet?.has(y) ?? false);

          const isSelected = selectedDate ? sameYMD(d, selectedDate) : false;

          return (
            <button
              key={y}
              disabled={isDisabled}
              onClick={() => onSelect(y)}
              style={{
                padding: "10px 0",
                borderRadius: 12,
                border: isSelected ? "2px solid #111" : "1px solid #d7dbe0",
                background: isSelected ? "#111" : "#fff",
                color: isSelected ? "#fff" : inMonth ? "#111" : "#999",
                fontWeight: 1000,
                opacity: isDisabled ? 0.35 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
              }}
              title={y}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StudentLessonChangePage() {
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);

  const [activeClass, setActiveClass] = useState<ActiveClass | null>(null);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [pendingByLesson, setPendingByLesson] = useState<Map<string, PendingReq>>(new Map());

  const [changeQuota, setChangeQuota] = useState<ChangeQuotaUI>({
    loading: false,
    used: null,
    limit: 1,
    period_start: null,
    period_end: null,
  });

  // change modal
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<LessonRow | null>(null);

  const [newDate, setNewDate] = useState<string>("");
  const [newTime, setNewTime] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const [acting, setActing] = useState(false);
  const [calMonth, setCalMonth] = useState<Date>(startOfMonth(new Date()));

  // options
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsByDate, setOptionsByDate] = useState<ChangeOptionsByDate>({});
  const [disabledYmdSet, setDisabledYmdSet] = useState<Set<string>>(new Set());

  // toast
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const showToast = useCallback((msg: string, kind: ToastKind = "ok") => {
    setToast({ msg, kind });
    // @ts-ignore
    if (window.__lessonToastTimer) window.clearTimeout(window.__lessonToastTimer);
    // @ts-ignore
    window.__lessonToastTimer = window.setTimeout(() => setToast(null), 2200);
  }, []);

  function translateError(message?: string, code?: string) {
    const msg = (message ?? "").toLowerCase();

    if (msg.includes("change cutoff passed")) {
      return "변경 마감 시간이 지났어요. (수업 전날 17:00 이전까지만 가능)";
    }
    if (msg.includes("change-locked") || msg.includes("change locked")) {
      return "이미 변경된 레슨이라 재변경이 불가해요.";
    }
    if (msg.includes("outside teacher availability")) {
      return "강사 근무시간 밖이라 변경 요청이 불가해요.";
    }
    if (msg.includes("teacher is not assigned")) {
      return "강사가 배정되지 않아 변경 요청이 불가해요.";
    }
    if (msg.includes("already has a pending request")) {
      return "이미 처리 대기중(PENDING)인 요청이 있어요.";
    }
    if (code === "23505" || msg.includes("duplicate key")) {
      return "이미 처리 대기중(PENDING)인 요청이 있어요.";
    }
    if (msg.includes("change limit exceeded") || msg.includes("change limit reached")) {
      return "변경 가능 횟수를 초과했어요.";
    }
    if (msg.includes("outside class period")) {
      return "수강권 기간(마지막 회차) 밖으로는 변경할 수 없어요.";
    }

    return "요청을 처리할 수 없습니다. 관리자에게 문의해주세요.";
  }

  const minSelectableYmd = useMemo(() => {
    const today = todayYmdKST();
    if (!activeClass) return today;
    return activeClass.start_date > today ? activeClass.start_date : today;
  }, [activeClass]);

  const maxSelectableYmd = useMemo(() => {
    if (!activeClass) return null;
    return activeClass.end_date;
  }, [activeClass]);

  const nextLesson = useMemo(() => {
    const now = Date.now();
  
    const future = lessons
      .filter((l) => {
        // 🔥 KST 기준으로 정확히 계산
        const [Y, M, D] = l.lesson_date.split("-").map(Number);
        const [hh, mm] = clampHHMM(l.lesson_time).split(":").map(Number);
  
        // KST → UTC ms 계산
        const utcMs =
          Date.UTC(Y, M - 1, D, hh - 9, mm, 0, 0); // KST는 UTC+9
  
        return utcMs >= now;
      })
      .sort((a, b) => {
        const [Y1, M1, D1] = a.lesson_date.split("-").map(Number);
        const [h1, m1] = clampHHMM(a.lesson_time).split(":").map(Number);
        const t1 = Date.UTC(Y1, M1 - 1, D1, h1 - 9, m1);
  
        const [Y2, M2, D2] = b.lesson_date.split("-").map(Number);
        const [h2, m2] = clampHHMM(b.lesson_time).split(":").map(Number);
        const t2 = Date.UTC(Y2, M2 - 1, D2, h2 - 9, m2);
  
        return t1 - t2;
      });
  
    return future[0] ?? null;
  }, [lessons]);

  const canShowExtendButton = useMemo(() => {
    if (!activeClass) return false;
    if (activeClass.type !== "3month") return false;
    if (activeClass.extension_uses_used >= activeClass.extension_uses_total) return false;
    if (!nextLesson) return false;
    if (pendingByLesson.has(nextLesson.id)) return false;

    const cutoff = cutoffPrevDay1700(nextLesson.lesson_date);
    return new Date().getTime() < cutoff.getTime();
  }, [activeClass, nextLesson, pendingByLesson]);

  // ✅ 화면에서 “기간 중복 표시” 제거:
  // period_start/end는 저장만 하고 UI에는 출력하지 않음
  const loadChangeQuotaFromRpc = useCallback(async (classId: string) => {
    setChangeQuota((p) => ({ ...p, loading: true }));

    const { data, error } = await supabase.rpc("student_change_quota_status", {
      p_class_id: classId,
    });

    if (error) {
      console.error("student_change_quota_status rpc error:", error);
      setChangeQuota({ loading: false, used: null, limit: 1, period_start: null, period_end: null });
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as ChangeQuotaRpcRow | null;

    if (!row) {
      setChangeQuota({ loading: false, used: null, limit: 1, period_start: null, period_end: null });
      return;
    }

    setChangeQuota({
      loading: false,
      used: Number(row.used ?? 0),
      limit: Number(row.quota_limit ?? 1),
      period_start: row.period_start ? String(row.period_start).slice(0, 10) : null,
      period_end: row.period_end ? String(row.period_end).slice(0, 10) : null,
    });
  }, []);

  function mapOptionsResponseToUI(j: OptionsApiResponse): ChangeOptionsByDate {
    const rooms = (j.rooms ?? []).map((r) => ({ id: String(r.id), name: String(r.name) }));
    const roomNameById = new Map<string, string>(rooms.map((r) => [r.id, r.name]));

    const out: ChangeOptionsByDate = {};
    const by = j.by_date ?? {};

    for (const dateStr of Object.keys(by)) {
      const ent = by[dateStr] ?? {};
      const times = (ent.times ?? []).map((t) => String(t));
      const roomsByTime = ent.rooms_by_time ?? {};

      out[dateStr] = {
        times: times.map((t) => {
          const roomIds = (roomsByTime[t] ?? []).map(String);
          const mappedRooms = roomIds.map((id) => ({
            id,
            name: roomNameById.get(id) ?? id,
          }));
          return { time: t, rooms: mappedRooms };
        }),
      };
    }

    return out;
  }

  const loadChangeOptionsForMonth = useCallback(
    async (teacherId: string, month: Date) => {
      const mStart = startOfMonth(month);
      const mEnd = endOfMonth(month);

      const from = ymd(mStart);
      const to = ymd(mEnd);

      setOptionsLoading(true);
      try {
        const res = await fetch(
          `/api/student/my-lessons/options?teacher_id=${encodeURIComponent(teacherId)}&from=${from}&to=${to}`,
          { credentials: "include" }
        );
        const j = (await res.json().catch(() => ({}))) as OptionsApiResponse;

        if (!res.ok) {
          showToast(j.error ?? "변경 가능 옵션 조회 실패", "err");
          setOptionsByDate({});
          setDisabledYmdSet(new Set());
          return;
        }

        const mapped = mapOptionsResponseToUI(j);
        setOptionsByDate(mapped);

        const dis = new Set<string>();
        for (let dt = new Date(mStart); dt <= mEnd; dt.setDate(dt.getDate() + 1)) {
          const yy = ymd(dt);
          if (!mapped[yy] || (mapped[yy]?.times?.length ?? 0) === 0) dis.add(yy);
        }
        setDisabledYmdSet(dis);
      } finally {
        setOptionsLoading(false);
      }
    },
    [showToast]
  );

  const load = useCallback(async () => {
    setLoading(true);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      setMeId(null);
      setActiveClass(null);
      setLessons([]);
      setPendingByLesson(new Map());
      setChangeQuota({ loading: false, used: null, limit: 1, period_start: null, period_end: null });
      setLoading(false);
      return;
    }
    setMeId(user.id);

    const today = todayYmdKST();

    const { data: clsActive } = await supabase
      .from("classes")
      .select("id,type,start_date,end_date,extension_uses_total,extension_uses_used")
      .eq("student_id", user.id)
      .lte("start_date", today)
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    let cls: any = clsActive;

    if (!cls?.id) {
      const { data: clsFuture } = await supabase
        .from("classes")
        .select("id,type,start_date,end_date,extension_uses_total,extension_uses_used")
        .eq("student_id", user.id)
        .gt("start_date", today)
        .order("start_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      cls = clsFuture;
    }

    if (!cls?.id) {
      const { data: clsPast } = await supabase
        .from("classes")
        .select("id,type,start_date,end_date,extension_uses_total,extension_uses_used")
        .eq("student_id", user.id)
        .lt("end_date", today)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      cls = clsPast;
    }

    setActiveClass(cls ?? null);

    if (!cls?.id) {
      setLessons([]);
      setPendingByLesson(new Map());
      setChangeQuota({ loading: false, used: null, limit: 1, period_start: null, period_end: null });
      setLoading(false);
      return;
    }

    await loadChangeQuotaFromRpc(cls.id);

    const { data: ls, error: lsErr } = await supabase
      .from("lessons")
      .select(
        `
        id,
        class_id,
        lesson_date,
        lesson_time,
        teacher_id,
        room_id,
        change_locked,
        changed_at,
        teacher:profiles_public!lessons_teacher_id_profiles_public_fkey (name),
        room:practice_rooms!lessons_room_id_fkey (name)
      `
      )
      .eq("class_id", cls.id)
      .neq("status", "canceled")
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (lsErr) {
      showToast(lsErr.message, "err");
      setLoading(false);
      return;
    }

    const mappedLessons: LessonRow[] = (ls ?? []).map((l: any) => ({
      id: String(l.id),
      class_id: String(l.class_id),
      lesson_date: String(l.lesson_date).slice(0, 10),
      lesson_time: String(l.lesson_time),
      teacher_id: l.teacher_id ?? null,
      room_id: l.room_id ?? null,
      teacher_name: pickName(l.teacher),
      room_name: pickName(l.room),
      change_locked: l.change_locked ?? false,
      changed_at: l.changed_at ? String(l.changed_at) : null,
    }));
    setLessons(mappedLessons);

    const lessonIds = mappedLessons.map((x) => x.id);
    if (lessonIds.length === 0) {
      setPendingByLesson(new Map());
      setLoading(false);
      return;
    }

    const { data: pend, error: pendErr } = await supabase
      .from("lesson_change_requests")
      .select("id, lesson_id, request_type, created_at, requested_changes")
      .eq("student_id", user.id)
      .eq("status", "PENDING")
      .in("lesson_id", lessonIds);

    if (pendErr) {
      showToast(pendErr.message, "err");
      setLoading(false);
      return;
    }

    const map = new Map<string, PendingReq>();
    (pend ?? []).forEach((p: any) => {
      map.set(String(p.lesson_id), {
        id: String(p.id),
        lesson_id: String(p.lesson_id),
        request_type: String(p.request_type) as RequestType,
        created_at: String(p.created_at),
        requested_changes: p.requested_changes
      });
    });
    setPendingByLesson(map);

    setLoading(false);
  }, [loadChangeQuotaFromRpc, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const openChangeModal = useCallback(
    async (lesson: LessonRow) => {
      if (!canRequestChangeByCutoff(lesson.lesson_date)) {
        showToast("변경 마감 시간이 지났어요. (수업 전날 17:00 이전까지만 가능)", "warn");
        return;
      }
      if (pendingByLesson.has(lesson.id)) {
        showToast("이미 처리 대기중(PENDING)인 요청이 있어요.", "warn");
        return;
      }
      if (!lesson.teacher_id) {
        showToast("강사 정보가 없어 변경 옵션을 계산할 수 없어요.", "err");
        return;
      }
      if (lesson.change_locked) {
        showToast("이미 변경된 레슨이라 재변경이 불가해요.", "warn");
        return;
      }

      setSelected(lesson);
      setNewDate(lesson.lesson_date);
      setNewTime(clampHHMM(lesson.lesson_time));
     // setNewRoomId(lesson.room_id ?? "");
      setReason("");

      const baseMonth = startOfMonth(parseLocalDate(lesson.lesson_date));
      setCalMonth(baseMonth);
      await loadChangeOptionsForMonth(lesson.teacher_id, baseMonth);

      setOpen(true);
    },
    [pendingByLesson, showToast, loadChangeOptionsForMonth]
  );

  const timeOptions = useMemo(() => {
    if (!newDate) return [];
    return optionsByDate[newDate]?.times?.map((x) => x.time) ?? [];
  }, [newDate, optionsByDate]);

  const roomOptions = useMemo(() => {
    if (!newDate || !newTime) return [];
    const slot = optionsByDate[newDate]?.times?.find((x) => x.time === newTime);
    return slot?.rooms ?? [];
  }, [newDate, newTime, optionsByDate]);

  useEffect(() => {
    if (!open) return;
    if (newDate && timeOptions.length > 0) {
      if (newTime && !timeOptions.includes(newTime)) {
        setNewTime("");
      }
    } else {
      setNewTime("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDate, timeOptions.join("|"), open]);

  const submitChangeRequest = async () => {
    if (!selected || !meId) return;

    if (!canRequestChangeByCutoff(selected.lesson_date)) {
      showToast("변경 마감 시간이 지났어요. (수업 전날 17:00 이전까지만 가능)", "warn");
      return;
    }

    if (!newDate || !newTime) {
      showToast("날짜와 시간을 선택해주세요.", "warn");
      return;
    }
    
    if (!reason.trim()) {
      showToast("변경 사유를 입력해주세요.", "warn");
      return;
    }

    const okSlot =
    !!optionsByDate[newDate]?.times?.some(
      (t) => t.time === newTime
    );

    if (!okSlot) {
      showToast("선택한 옵션이 현재는 불가능해요. 새로고침 후 다시 선택해 주세요.", "warn");
      return;
    }

    setActing(true);

    const { error } = await supabase.from("lesson_change_requests").insert({
      lesson_id: selected.id,
      student_id: meId,
      status: "PENDING" as Status,
      request_type: "CHANGE" as RequestType,
      reason: reason || null,
      requested_changes: {
        lesson_date: newDate,
        lesson_time: `${newTime}:00`,
      },
    });

    setActing(false);

    if (error) {
      const anyErr = error as any;
      showToast(translateError(anyErr.message, anyErr.code), "err");
      return;
    }

    showToast("변경 요청이 접수되었습니다. 관리자 확인 후 변경 여부가 확정되며 결과를 안내드리겠습니다.","ok");
    setOpen(false);
    setSelected(null);
    setOptionsByDate({});
    setDisabledYmdSet(new Set());
    await load();
  };

  // ✅ 취소가 “가끔 안되는” 문제 방지:
  // - RLS에서 delete 막히는 케이스가 가장 흔함 → student_id + status=PENDING 조건도 같이 걸어줌(안전)
  // - delete 후 select로 확인까지 하고, 실제로 지워졌는지 검증
  const cancelPendingRequest = async (lessonId: string) => {
    const req = pendingByLesson.get(lessonId);
    if (!req) return;

    if (!confirm("요청을 취소할까요? (대기중인 요청만 취소 가능합니다)")) return;

    if (!meId) {
      showToast("로그인이 필요합니다.", "err");
      return;
    }

    setActing(true);

    const { data, error } = await supabase
      .from("lesson_change_requests")
      .delete()
      .eq("id", req.id)
      .eq("student_id", meId)
      .eq("status", "PENDING")
      .select("id"); // ✅ 삭제된 row 리턴(0개면 실제 삭제 안된 것)

    setActing(false);

    if (error) {
      showToast(error.message ?? "취소 실패", "err");
      return;
    }

    if (!data || data.length === 0) {
      showToast("취소할 수 없어요. (권한/상태를 확인해주세요)", "warn");
      await load();
      return;
    }

    showToast("요청이 취소되었습니다.", "ok");
    await load();
  };

  const submitExtensionRequest = async () => {
    if (!meId || !nextLesson) return;
    if (!canShowExtendButton) {
      showToast("지금은 연장 요청이 불가능해요. (전날 17시 이전/3개월권/잔여 연장권/대기요청 확인)", "warn");
      return;
    }

    const cutoff = cutoffPrevDay1700(nextLesson.lesson_date);
    const cutoffText = `${formatKoreanDate(ymd(cutoff))} 17:00`;
    if (!confirm(`다음 수업 1회에 대해 “연장 요청”을 보낼까요?\n(마감: ${cutoffText})`)) return;

    setActing(true);

    const { error } = await supabase.from("lesson_change_requests").insert({
      lesson_id: nextLesson.id,
      student_id: meId,
      status: "PENDING" as Status,
      request_type: "EXTENSION" as RequestType,
      reason: "3개월권 혜택: 1주 연장 요청",
      requested_changes: null,
    });

    setActing(false);

    if (error) {
      showToast(translateError((error as any).message, (error as any).code), "err");
      return;
    }

    showToast("연장 요청이 접수되었습니다. (관리자 확인 후 반영)", "ok");
    await load();
  };

  const classLabel = useMemo(() => {
    if (!activeClass) return "없음";
    return activeClass.type === "3month" ? "3개월권" : "1개월권";
  }, [activeClass]);

  // ✅ 기간 중복 표시 개선:
  // - "변경 가능 기간: ..." 라인을 제거
  // - 변경권 라벨도 짧게
  const changeQuotaLabel = useMemo(() => {
    if (!activeClass) return "변경권";
    return activeClass.type === "3month" ? "변경권(3개월권)" : "변경권(1개월권)";
  }, [activeClass]);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 16, background: "#f6f7f9", minHeight: "100vh" }}>
      <StudentTopNav />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 1000, fontSize: 20, color: "#111" }}>레슨 변경 / 연장</div>
        <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 900, color: "#111" }}>
          {loading ? "로딩중..." : activeClass ? "조회 완료" : "수강권 없음"}
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: "#666", fontWeight: 900 }}>
        변경·연장 요청은 접수 후 관리자가 확인하여 반영합니다.
      </div>

      {/* Summary */}
      <div style={{ marginTop: 12, border: "1px solid #d7dbe0", borderRadius: 14, background: "#fff", padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 1100, fontSize: 14, color: "#111" }}>내 수강권</div>
          <span
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #d7dbe0",
              background: activeClass ? "#111" : "#eef1f4",
              color: activeClass ? "#fff" : "#111",
              fontWeight: 1100,
              fontSize: 12,
            }}
          >
            {activeClass ? "확인됨" : "없음"}
          </span>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <Row k="수강권" v={classLabel} />
          <Row k="기간" v={activeClass ? `${activeClass.start_date} ~ ${activeClass.end_date}` : "-"} />

          <Row
            k={changeQuotaLabel}
            v={
              !activeClass
                ? "-"
                : changeQuota.loading
                ? "조회중..."
                : changeQuota.used == null
                ? "-"
                : `${changeQuota.used}/${changeQuota.limit}`
            }
          />

          {/* ✅ “변경 가능 기간: …” 중복 라인 제거 */}

          <Row
            k="연장권(3개월권)"
            v={activeClass ? `${activeClass.extension_uses_used}/${activeClass.extension_uses_total}` : "-"}
          />

          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "#f3f4f6",
              border: "1px solid #d7dbe0",
              color: "#111",
              fontWeight: 1000,
              fontSize: 12,
              lineHeight: "18px",
            }}
          >
            오늘 기준(KST): <b style={{ color: "#111" }}>{todayYmdKST()}</b>
            <br />
            요청 마감: <b>수업 전날 17:00</b>
          </div>
        </div>
      </div>

      {/* Next lesson + Extension */}
      <div style={{ marginTop: 12, border: "1px solid #d7dbe0", borderRadius: 14, background: "#fff", padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 1100, fontSize: 14, color: "#111" }}>가장 가까운 다음 수업</div>
          <button onClick={load} style={btnPrimary()} disabled={loading || acting}>
            새로고침
          </button>
        </div>

        {loading ? (
          <div style={{ marginTop: 10, color: "#666", fontWeight: 900 }}>불러오는 중...</div>
        ) : !meId ? (
          <div style={{ marginTop: 10, color: "#666", fontWeight: 900 }}>로그인이 필요합니다.</div>
        ) : !nextLesson ? (
          <div style={{ marginTop: 10, color: "#666", fontWeight: 900 }}>예정된 수업이 없습니다.</div>
        ) : (
          <>
            <div style={{ marginTop: 10, fontSize: 13, color: "#111", fontWeight: 1000 }}>
              {nextLesson.lesson_date} {clampHHMM(nextLesson.lesson_time)} · 강사 {nextLesson.teacher_name ?? "-"} · 룸{" "}
              {nextLesson.room_name ?? "-"}
            </div>

            <button
              disabled={!canShowExtendButton || acting}
              onClick={submitExtensionRequest}
              style={{
                ...btnPrimary(),
                width: "100%",
                padding: "14px 12px",
                borderRadius: 16,
                marginTop: 12,
                background: !canShowExtendButton || acting ? "#bbb" : "#111",
                borderColor: !canShowExtendButton || acting ? "#bbb" : "#111",
                cursor: !canShowExtendButton || acting ? "not-allowed" : "pointer",
              }}
            >
              {activeClass?.type !== "3month"
                ? "연장 요청(3개월권 전용)"
                : activeClass.extension_uses_used >= activeClass.extension_uses_total
                ? "연장권 소진"
                : pendingByLesson.has(nextLesson.id)
                ? "요청 대기중(PENDING)"
                : "연장 요청(다음 수업 1회)"}
            </button>

            <div style={{ marginTop: 8, fontSize: 12, color: "#666", fontWeight: 900 }}>
              * 연장 요청은 <b>수업 전날 17:00 이전</b>에만 가능합니다.
            </div>
          </>
        )}
      </div>

      {/* Lessons */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 1100, fontSize: 16, color: "#111", marginBottom: 12 }}>📌 레슨 목록</div>

        {loading ? (
          <div style={emptyCard()}>불러오는 중...</div>
        ) : !activeClass ? (
          <div style={emptyCard()}>표시할 수강권이 없습니다 🙂</div>
        ) : lessons.length === 0 ? (
          <div style={emptyCard()}>레슨이 없습니다.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {lessons.map((l) => {
              const pending = pendingByLesson.get(l.id);
              const locked = !!l.change_locked;

              const deadlinePassed = !canRequestChangeByCutoff(l.lesson_date);
              const btnDisabled = locked || acting || deadlinePassed || !!pending;

              return (
                <div
                  key={l.id}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: "1px solid #d7dbe0",
                    background: locked ? "#f0fdf4" : pending ? "#eef1f4" : "#fff",
                    color: "#111",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 1100 }}>
                      {l.lesson_date} {clampHHMM(l.lesson_time)}
                    </div>

                    {locked ? (
                      <span style={pill("#10b981", "#ecfdf5", "#047857")} title={l.changed_at ?? undefined}>
                        CHANGED
                      </span>
                    ) : pending ? (
                      <span style={pill("#f59e0b", "#fff7ed", "#b45309")}>PENDING</span>
                    ) : null}
                  </div>

                  <div style={{ fontSize: 12, color: "#666", fontWeight: 900, lineHeight: "18px" }}>
                    강사: {l.teacher_name ?? "-"}
                    <br />
                    룸: {l.room_name ?? "-"}
                  </div>

                  {pending ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <button
                        disabled={acting}
                        onClick={() => cancelPendingRequest(l.id)}
                        style={{
                          ...btnDanger(),
                          width: "100%",
                          padding: "12px 12px",
                          borderRadius: 14,
                          opacity: acting ? 0.6 : 1,
                          cursor: acting ? "not-allowed" : "pointer",
                        }}
                      >
                        요청 취소
                      </button>

                      <div style={{ fontSize: 16, color: "#444", fontWeight: 900, lineHeight: "20px" }}>
                      <b>
                        (변경요청){" "}
                        {pending.requested_changes?.lesson_date}{" "}
                        {pending.requested_changes?.lesson_time?.slice(0,5)} 
                      </b>
                      <br />
                      <span style={{ fontSize: 12, color: "#666" }}>
                        * 관리자 확인 후 변경 여부가 확정됩니다.
                      </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        disabled={btnDisabled}
                        onClick={() => openChangeModal(l)}
                        style={{
                          ...btnPrimary(),
                          width: "100%",
                          padding: "12px 12px",
                          borderRadius: 14,
                          background: btnDisabled ? "#bbb" : "#111",
                          borderColor: btnDisabled ? "#bbb" : "#111",
                          cursor: btnDisabled ? "not-allowed" : "pointer",
                        }}
                        title={deadlinePassed ? "변경 마감: 수업 전날 17:00" : undefined}
                      >
                        {locked ? "변경 완료(재변경 불가)" : deadlinePassed ? "변경 마감(전날 17:00)" : "변경 요청"}
                      </button>

                      {deadlinePassed && !locked ? (
                        <div style={{ marginTop: 2, fontSize: 12, color: "#666", fontWeight: 900 }}>
                          * 변경은 <b>수업 전날 17:00 이전</b>까지만 가능합니다.
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ height: 30 }} />

      {/* ===== Change modal ===== */}
      {open && selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "flex-end",
            zIndex: 9999,
            padding: 12,
          }}
          onClick={() => !acting && setOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              width: "100%",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 16,
              maxWidth: 560,
              margin: "0 auto",
              border: "1px solid #d7dbe0",
              boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
              maxHeight: "85vh",   // ✅ 화면 높이 제한
              overflowY: "auto",   // ✅ 세로 스크롤 생성
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 1100, fontSize: 16, color: "#111" }}>레슨 변경 요청</div>
              <button onClick={() => setOpen(false)} disabled={acting} style={btnGhost()}>
                닫기
              </button>
            </div>

            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "#f3f4f6",
                border: "1px solid #d7dbe0",
                color: "#111",
                fontWeight: 1000,
                fontSize: 12,
                lineHeight: "18px",
              }}
            >
              대상: <b>{selected.lesson_date}</b> {clampHHMM(selected.lesson_time)} · 강사{" "}
              <b>{selected.teacher_name ?? "-"}</b> · 룸 <b>{selected.room_name ?? "-"}</b>
              <div style={{ marginTop: 6, color: "#666", fontWeight: 900 }}>* 선택 가능한 날짜와 시간만 활성화됩니다.</div>
            </div>

            <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <button
                onClick={async () => {
                  const next = startOfMonth(addMonths(calMonth, -1));
                  setCalMonth(next);
                  if (selected.teacher_id) await loadChangeOptionsForMonth(selected.teacher_id, next);
                }}
                style={btnGhost()}
                disabled={acting || optionsLoading}
              >
                ◀
              </button>

              <div style={{ fontWeight: 1100, color: "#111" }}>
                {calMonth.getFullYear()}년 {calMonth.getMonth() + 1}월
              </div>

              <button
                onClick={async () => {
                  const next = startOfMonth(addMonths(calMonth, 1));
                  setCalMonth(next);
                  if (selected.teacher_id) await loadChangeOptionsForMonth(selected.teacher_id, next);
                }}
                style={btnGhost()}
                disabled={acting || optionsLoading}
              >
                ▶
              </button>
            </div>

            <CalendarMonth
              month={calMonth}
              selectedYmd={newDate}
              onSelect={(d) => {
                setNewDate(d);
                setNewTime("");
              }}
              minYmd={minSelectableYmd}
              maxYmd={maxSelectableYmd}
              disabledYmdSet={disabledYmdSet}
            />

            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 1100, fontSize: 13, color: "#111" }}>새 시간(1시간 단위)</div>

              <select
                value={newTime}
                onChange={(e) => {
                  setNewTime(e.target.value);
                }}
                disabled={acting || optionsLoading || !newDate}
                style={selectStyle()}
              >
                <option value="">
                  {optionsLoading
                    ? "옵션 불러오는 중..."
                    : !newDate
                    ? "날짜를 먼저 선택"
                    : timeOptions.length === 0
                    ? "가능한 시간이 없음"
                    : "시간 선택"}
                </option>
                {timeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <div style={{ marginTop: 6, fontSize: 12, color: "#666", fontWeight: 900 }}>* 시간은 1시간 단위로만 선택됩니다.</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 1100, fontSize: 13, color: "#111" }}>변경 사유 *</div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={acting}
                placeholder="예) 개인 사정으로 변경 요청드립니다."
                style={{
                  marginTop: 8,
                  width: "100%",
                  minHeight: 90,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid #d7dbe0",
                  fontSize: 14,
                  fontWeight: 900,
                  resize: "none",
                  color: "#111"
                }}
              />
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#111", fontWeight: 1100 }}>
              선택: <b>{newDate || "(날짜 미선택)"}</b> / <b>{newTime || "(시간 미선택)"}</b> 
            </div>

            <button
              disabled={acting || optionsLoading}
              onClick={submitChangeRequest}
              style={{
                ...btnPrimary(),
                width: "100%",
                padding: "14px 12px",
                borderRadius: 16,
                marginTop: 14,
                background: acting || optionsLoading ? "#bbb" : "#111",
                borderColor: acting || optionsLoading ? "#bbb" : "#111",
                cursor: acting || optionsLoading ? "not-allowed" : "pointer",
              }}
            >
              {optionsLoading ? "옵션 불러오는 중..." : acting ? "요청 중..." : "요청 보내기"}
            </button>

            <button
              disabled={acting}
              onClick={() => {
                setOpen(false);
                setSelected(null);
                setOptionsByDate({});
                setDisabledYmdSet(new Set());
              }}
              style={{
                ...btnGhost(),
                width: "100%",
                padding: "14px 12px",
                borderRadius: 16,
                marginTop: 10,
              }}
            >
              닫기
            </button>

            <div style={{ marginTop: 10, fontSize: 12, color: "#666", fontWeight: 900 }}>
              * 동일 레슨에 대해 처리 대기중(PENDING) 요청이 있으면 추가 요청이 불가합니다.
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 18,
            transform: "translateX(-50%)",
            width: "min(520px, calc(100vw - 24px))",
            background: toast.kind === "ok" ? "#111" : toast.kind === "warn" ? "#f59e0b" : "#ef4444",
            color: "#fff",
            padding: "12px 14px",
            borderRadius: 14,
            fontWeight: 1100,
            boxShadow: "0 16px 36px rgba(0,0,0,0.22)",
            zIndex: 10000,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ===== small ui helpers ===== */

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <div style={{ color: "#111", fontWeight: 1000 }}>{k}</div>
      <div style={{ color: "#111", fontWeight: 1100 }}>{v}</div>
    </div>
  );
}

function pill(border: string, bg: string, color: string): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 1100,
    padding: "3px 8px",
    borderRadius: 999,
    border: `1px solid ${border}`,
    background: bg,
    color,
  };
}

function selectStyle(): React.CSSProperties {
  return {
    marginTop: 8,
    width: "100%",
    padding: 12,
    borderRadius: 14,
    border: "1px solid #d7dbe0",
    fontSize: 15,
    fontWeight: 1000,
    background: "#fff",
    color: "#111"
  };
}

function btnGhost(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d7dbe0",
    background: "#fff",
    color: "#111",
    fontWeight: 1000,
    cursor: "pointer",
  };
}

function btnPrimary(): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    fontWeight: 1100,
    cursor: "pointer",
  };
}

function btnDanger(): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #ef4444",
    background: "#ef4444",
    color: "#fff",
    fontWeight: 1100,
    cursor: "pointer",
  };
}

function emptyCard(): React.CSSProperties {
  return {
    padding: 16,
    borderRadius: 14,
    background: "#fff",
    border: "1px solid #d7dbe0",
    color: "#111",
    fontWeight: 900,
  };
}