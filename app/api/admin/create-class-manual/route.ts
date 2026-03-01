import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

/* ===================== types ===================== */

type ClassType = "1month" | "3month";
type DeviceType = "controller" | "turntable";

type LessonInput = {
  lesson_date: string; // YYYY-MM-DD
  lesson_time: string; // HH:mm
  room_id: string;
  teacher_id: string;
};

type ErrorDetail = {
  idx: number;
  lesson_date: string;
  lesson_time: string;
  teacher_id: string;
  room_id: string;
  reasons: string[];
};

/* ===================== utils ===================== */

function weekdayOf(ymd: string) {
  return new Date(`${ymd}T00:00:00`).getDay();
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isHHMM(v: string) {
  return /^\d{2}:\d{2}$/.test(v);
}

function toHHMMSS(t: string) {
  return t.length === 5 ? `${t}:00` : t;
}

const LESSON_COUNT_BY_CLASS: Record<ClassType, number> = {
  "1month": 4,
  "3month": 12,
};

const FREE_PRACTICE_BY_CLASS = {
  "1month_controller": 4,
  "1month_turntable": 5,
  "3month_controller": 12,
  "3month_turntable": 15,
} as const;

// ✅ 변경권: 기간 내 1개월=1회, 3개월=3회
const CHANGE_LIMIT_BY_CLASS: Record<ClassType, number> = {
  "1month": 1,
  "3month": 3,
};

// ✅ 연장권: 3개월=1, 1개월=0
const EXTENSION_TOTAL_BY_CLASS: Record<ClassType, number> = {
  "1month": 0,
  "3month": 1,
};

/* ===================== handler ===================== */

export async function POST(req: Request) {
  /* ---------- auth ---------- */
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  /* ---------- body ---------- */
  const body = await req.json().catch(() => ({}));

  const studentId = body.studentId as string | undefined;
  const classType = body.type as ClassType | undefined;
  const deviceType = body.deviceType as DeviceType | undefined;
  const lessons = body.lessons as LessonInput[] | undefined;

  if (!studentId || !classType || !deviceType || !Array.isArray(lessons)) {
    return NextResponse.json({ error: "필수 값 누락" }, { status: 400 });
  }

  const expectedCount = LESSON_COUNT_BY_CLASS[classType];
  if (lessons.length !== expectedCount) {
    return NextResponse.json(
      { error: `레슨 개수 오류 (${expectedCount}회 필요)` },
      { status: 400 }
    );
  }

  /* ---------- basic validation ---------- */
  const errors: ErrorDetail[] = [];

  lessons.forEach((l, i) => {
    const reasons: string[] = [];
    if (!l.lesson_date) reasons.push("날짜가 없습니다.");
    if (!l.lesson_time || !isHHMM(l.lesson_time))
      reasons.push("시간 형식이 올바르지 않습니다.");
    if (!l.room_id) reasons.push("룸이 선택되지 않았습니다.");
    if (!l.teacher_id) reasons.push("강사가 선택되지 않았습니다.");

    if (reasons.length) {
      errors.push({
        idx: i + 1,
        lesson_date: l.lesson_date,
        lesson_time: l.lesson_time,
        teacher_id: l.teacher_id,
        room_id: l.room_id,
        reasons,
      });
    }
  });

  if (errors.length) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", details: errors },
      { status: 400 }
    );
  }

  /* ---------- normalize & sort ---------- */
  const normalized = lessons
    .map((l, i) => ({ ...l, idx: i + 1 }))
    .sort((a, b) =>
      `${a.lesson_date}|${a.lesson_time}`.localeCompare(
        `${b.lesson_date}|${b.lesson_time}`
      )
    );

  /* ---------- duplicate check (within request) ---------- */
  const seen = new Set<string>();
  normalized.forEach((l) => {
    const key = `${l.lesson_date}|${l.lesson_time}`;
    if (seen.has(key)) {
      errors.push({
        idx: l.idx,
        lesson_date: l.lesson_date,
        lesson_time: l.lesson_time,
        teacher_id: l.teacher_id,
        room_id: l.room_id,
        reasons: ["같은 날짜/시간이 수강권 내에서 중복됩니다."],
      });
    }
    seen.add(key);
  });

  if (errors.length) {
    return NextResponse.json(
      { error: "DUPLICATE_LESSON", details: errors },
      { status: 400 }
    );
  }

  /* ---------- preload rooms ---------- */
  const { data: rooms } = await supabaseServer
    .from("practice_rooms")
    .select("id, name, is_active, allow_controller, allow_turntable");

  const roomMap = new Map(rooms?.map((r: any) => [r.id, r]) ?? []);

  /* ---------- preload availabilities ---------- */
  const teacherIds = [...new Set(normalized.map((l) => l.teacher_id))];
  const weekdays = [...new Set(normalized.map((l) => weekdayOf(l.lesson_date)))];

  const { data: avails } = await supabaseServer
    .from("teacher_availabilities")
    .select(
      "teacher_id, weekday, start_time, end_time, device_type, slot_minutes, is_active, effective_from, effective_until"
    )
    .in("teacher_id", teacherIds)
    .in("weekday", weekdays)
    .eq("is_active", true);

  /* ---------- availability check ---------- */
  normalized.forEach((l) => {
    const reasons: string[] = [];
    const wd = weekdayOf(l.lesson_date);
    const m = toMin(l.lesson_time);

    const ok = (avails ?? []).some((a: any) => {
      if (a.teacher_id !== l.teacher_id) return false;
      if (a.weekday !== wd) return false;

      if (a.device_type !== "both" && a.device_type !== deviceType) return false;

      if (a.effective_from && l.lesson_date < a.effective_from) return false;
      if (a.effective_until && l.lesson_date > a.effective_until) return false;

      const s = toMin(a.start_time);
      const e = toMin(a.end_time);
      const step = Number(a.slot_minutes ?? 60);

      return m >= s && m + step <= e && (m - s) % step === 0;
    });

    if (!ok) reasons.push("강사 근무시간(availability) 밖입니다.");

    const room = roomMap.get(l.room_id);
    if (!room || !room.is_active) {
      reasons.push("선택한 룸이 비활성 상태입니다.");
    } else {
      if (deviceType === "controller" && !room.allow_controller)
        reasons.push("선택한 룸은 controller를 허용하지 않습니다.");
      if (deviceType === "turntable" && !room.allow_turntable)
        reasons.push("선택한 룸은 turntable을 허용하지 않습니다.");
    }

    if (reasons.length) {
      errors.push({
        idx: l.idx,
        lesson_date: l.lesson_date,
        lesson_time: l.lesson_time,
        teacher_id: l.teacher_id,
        room_id: l.room_id,
        reasons,
      });
    }
  });

  if (errors.length) {
    return NextResponse.json(
      { error: "AVAILABILITY_MISMATCH", details: errors },
      { status: 400 }
    );
  }

  /* ---------- conflict check (DB) ---------- */
  const dates = normalized.map((l) => l.lesson_date);
  const times = normalized.map((l) => toHHMMSS(l.lesson_time));

  const { data: busy } = await supabaseServer
    .from("lessons")
    .select("lesson_date, lesson_time, room_id, teacher_id")
    .in("lesson_date", dates)
    .in("lesson_time", times)
    .neq("status", "canceled");

  normalized.forEach((l) => {
    const hit = (busy ?? []).find(
      (b: any) =>
        b.lesson_date === l.lesson_date &&
        b.lesson_time === toHHMMSS(l.lesson_time) &&
        (b.room_id === l.room_id || b.teacher_id === l.teacher_id)
    );

    if (hit) {
      const reasons: string[] = [];
      if (hit.room_id === l.room_id)
        reasons.push("해당 시간에 선택한 룸이 이미 예약되어 있습니다.");
      if (hit.teacher_id === l.teacher_id)
        reasons.push("해당 시간에 강사가 이미 다른 레슨이 있습니다.");

      errors.push({
        idx: l.idx,
        lesson_date: l.lesson_date,
        lesson_time: l.lesson_time,
        teacher_id: l.teacher_id,
        room_id: l.room_id,
        reasons,
      });
    }
  });

  if (errors.length) {
    return NextResponse.json(
      { error: "CONFLICT", details: errors },
      { status: 400 }
    );
  }

  /* ---------- insert class ---------- */
  const startDate = normalized[0].lesson_date;
  const endDate = normalized[normalized.length - 1].lesson_date;

  const monthlyChangeLimit = CHANGE_LIMIT_BY_CLASS[classType];
  const extensionTotal = EXTENSION_TOTAL_BY_CLASS[classType];

  const { data: cls, error: clsErr } = await supabaseServer
    .from("classes")
    .insert({
      student_id: studentId,
      type: classType,
      device_type: deviceType,
      total_lessons: normalized.length,
      start_date: startDate,
      end_date: endDate,

      // ✅ 추가: 변경권/연장권 기본값 세팅
      monthly_change_limit: monthlyChangeLimit,
      extension_uses_total: extensionTotal,
      extension_uses_used: 0,
    })
    .select("id")
    .single();

  if (clsErr || !cls?.id) {
    return NextResponse.json(
      { error: clsErr?.message ?? "classes 생성 실패" },
      { status: 500 }
    );
  }

  const classId = cls.id as string;

  /* ---------- insert lessons ---------- */
  const lessonRows = normalized.map((l, i) => ({
    class_id: classId,
    lesson_no: i + 1,
    lesson_date: l.lesson_date,
    lesson_time: toHHMMSS(l.lesson_time),
    room_id: l.room_id,
    teacher_id: l.teacher_id,
    status: "scheduled",
    allow_change_override: false,
  }));

  const { error: lessonErr } = await supabaseServer
    .from("lessons")
    .insert(lessonRows);

  if (lessonErr) {
    await supabaseServer.from("classes").delete().eq("id", classId);
    return NextResponse.json(
      { error: "LESSON_INSERT_FAILED", message: lessonErr.message },
      { status: 500 }
    );
  }

  /* ---------- voucher ---------- */
  const ruleKey = `${classType}_${deviceType}` as keyof typeof FREE_PRACTICE_BY_CLASS;
  const qty = FREE_PRACTICE_BY_CLASS[ruleKey];

  const { error: vErr } = await supabaseServer.from("practice_vouchers").insert({
    student_id: studentId,
    class_id: classId,
    voucher_type: "free",
    quantity: qty,
    valid_from: startDate,
    valid_until: endDate,
    cancel_limit_days: 3,
    source: "class",
  });

  if (vErr) {
    await supabaseServer.from("lessons").delete().eq("class_id", classId);
    await supabaseServer.from("classes").delete().eq("id", classId);

    return NextResponse.json(
      { error: "VOUCHER_INSERT_FAILED", message: vErr.message },
      { status: 500 }
    );
  }

  /* ---------- done ---------- */
  return NextResponse.json({
    success: true,
    classId,
    lessons: normalized.map((l) => ({
      idx: l.idx,
      lesson_date: l.lesson_date,
      lesson_time: l.lesson_time,
    })),
  });
}