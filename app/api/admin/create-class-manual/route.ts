import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

/* ===================== types ===================== */

type ClassType = "1month" | "3month";
type DeviceType = "controller" | "turntable";

type LessonInput = {
  lesson_date: string;
  lesson_time: string;
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
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function isHHMM(v: string) {
  return /^\d{2}:\d{2}$/.test(v);
}

function toHHMMSS(t: string) {
  return t.length === 5 ? `${t}:00` : t;
}

function timeEq(a: string | null | undefined, b: string) {
  return String(a ?? "").slice(0, 5) === String(b ?? "").slice(0, 5);
}

function roomLabel(name: string | null | undefined) {
  return String(name ?? "")
    .replace(/\s/g, "")
    .replace(/[룸홀]/g, "")
    .trim()
    .toUpperCase();
}

function isTimeInRange(target: string, start: string, end: string) {
  const t = toMin(target);
  return t >= toMin(start) && t < toMin(end);
}

function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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

const CHANGE_LIMIT_BY_CLASS: Record<ClassType, number> = {
  "1month": 1,
  "3month": 3,
};

const EXTENSION_TOTAL_BY_CLASS: Record<ClassType, number> = {
  "1month": 0,
  "3month": 1,
};

/* ===================== handler ===================== */

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

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

  const errors: ErrorDetail[] = [];

  lessons.forEach((l, i) => {
    const reasons: string[] = [];
    if (!l.lesson_date) reasons.push("날짜가 없습니다.");
    if (!l.lesson_time || !isHHMM(l.lesson_time)) {
      reasons.push("시간 형식이 올바르지 않습니다.");
    }
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

  const normalized = lessons
    .map((l, i) => ({ ...l, idx: i + 1 }))
    .sort((a, b) =>
      `${a.lesson_date}|${a.lesson_time}`.localeCompare(
        `${b.lesson_date}|${b.lesson_time}`
      )
    );

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
  const { data: rooms, error: roomErr } = await supabaseServer
    .from("practice_rooms")
    .select("id, name, is_active, allow_controller, allow_turntable");

  if (roomErr) {
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }

  const roomMap = new Map(rooms?.map((r: any) => [r.id, r]) ?? []);

  /* ---------- preload availabilities ---------- */
  const teacherIds = [...new Set(normalized.map((l) => l.teacher_id))];
  const dates = [...new Set(normalized.map((l) => l.lesson_date))];
  const timesHHMMSS = [...new Set(normalized.map((l) => toHHMMSS(l.lesson_time)))];
  const weekdays = [...new Set(normalized.map((l) => weekdayOf(l.lesson_date)))];

  const { data: avails, error: availErr } = await supabaseServer
    .from("teacher_availabilities")
    .select(
      "teacher_id, weekday, start_time, end_time, device_type, slot_minutes, is_active, effective_from, effective_until"
    )
    .in("teacher_id", teacherIds)
    .in("weekday", weekdays)
    .eq("is_active", true);

  if (availErr) {
    return NextResponse.json({ error: availErr.message }, { status: 500 });
  }

  /* ---------- availability + room type check ---------- */
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
    const label = roomLabel(room?.name);

    if (!room || !room.is_active) {
      reasons.push("선택한 룸이 비활성 상태입니다.");
    } else {
      if (deviceType === "controller" && !room.allow_controller) {
        reasons.push("선택한 룸은 controller를 허용하지 않습니다.");
      }

      if (deviceType === "turntable" && !room.allow_turntable) {
        reasons.push("선택한 룸은 turntable을 허용하지 않습니다.");
      }

      if (deviceType === "controller" && !["A", "B", "C"].includes(label)) {
        reasons.push("컨트롤러 수업은 A/B/C룸만 사용 가능합니다.");
      }

      if (deviceType === "turntable" && !["A", "C"].includes(label)) {
        reasons.push("턴테이블 수업은 A룸 또는 C룸만 사용 가능합니다.");
      }
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

  /* ---------- preload conflict data ---------- */

  const { data: busy, error: busyErr } = await supabaseServer
    .from("lessons")
    .select("lesson_date, lesson_time, room_id, teacher_id, status")
    .in("lesson_date", dates)
    .in("lesson_time", timesHHMMSS)
    .neq("status", "canceled");

  if (busyErr) {
    return NextResponse.json({ error: busyErr.message }, { status: 500 });
  }

  const { data: onedays, error: onedayErr } = await supabaseServer
    .from("oneday_lessons")
    .select("lesson_date, lesson_time, room_id, teacher_id")
    .in("lesson_date", dates)
    .in("lesson_time", timesHHMMSS);

  if (onedayErr) {
    return NextResponse.json({ error: onedayErr.message }, { status: 500 });
  }

  const { data: reservations, error: reservationErr } = await supabaseServer
    .from("practice_reservations")
    .select("id, date, room_id, start_time, end_time, status, reservation_kind")
    .in("date", dates)
    .in("status", ["PENDING", "APPROVED"]);

  if (reservationErr) {
    return NextResponse.json({ error: reservationErr.message }, { status: 500 });
  }

  const { data: fixedSlots, error: fixedErr } = await supabaseServer
    .from("fixed_schedule_slots")
    .select("id, teacher_id, room_id, weekday, lesson_time, hold_for_renewal")
    .eq("hold_for_renewal", true)
    .in("weekday", weekdays)
    .in("lesson_time", timesHHMMSS);

  if (fixedErr) {
    return NextResponse.json({ error: fixedErr.message }, { status: 500 });
  }

  /* ---------- conflict check ---------- */

  normalized.forEach((l) => {
    const reasons: string[] = [];
    const targetTime = toHHMMSS(l.lesson_time);
    const wd = weekdayOf(l.lesson_date);

    const lessonHit = (busy ?? []).find(
      (b: any) =>
        b.lesson_date === l.lesson_date &&
        timeEq(b.lesson_time, l.lesson_time) &&
        (b.room_id === l.room_id || b.teacher_id === l.teacher_id)
    );

    if (lessonHit) {
      if (lessonHit.room_id === l.room_id) {
        reasons.push("해당 시간에 선택한 룸이 이미 수업으로 예약되어 있습니다.");
      }
      if (lessonHit.teacher_id === l.teacher_id) {
        reasons.push("해당 시간에 강사가 이미 다른 수업이 있습니다.");
      }
    }

    const onedayHit = (onedays ?? []).find(
      (o: any) =>
        o.lesson_date === l.lesson_date &&
        timeEq(o.lesson_time, l.lesson_time) &&
        (o.room_id === l.room_id || o.teacher_id === l.teacher_id)
    );

    if (onedayHit) {
      if (onedayHit.room_id === l.room_id) {
        reasons.push("해당 시간에 선택한 룸에 원데이 레슨이 등록되어 있습니다.");
      }
      if (onedayHit.teacher_id === l.teacher_id) {
        reasons.push("해당 시간에 선택한 강사의 원데이 레슨이 등록되어 있습니다.");
      }
    }

    const reservationHits = (reservations ?? []).filter(
      (r: any) =>
        r.date === l.lesson_date &&
        r.room_id === l.room_id &&
        isTimeInRange(targetTime, r.start_time, r.end_time)
    );

    const adminBlockHit = reservationHits.find(
      (r: any) => r.reservation_kind === "ADMIN_BLOCK"
    );

    if (adminBlockHit) {
      reasons.push("해당 시간/룸은 운영차단으로 막혀 있습니다.");
    }

    const practiceHit = reservationHits.find(
      (r: any) => r.reservation_kind !== "ADMIN_BLOCK"
    );

    if (practiceHit) {
      reasons.push("해당 시간/룸에 연습실 예약이 있습니다.");
    }

    const fixedHit = (fixedSlots ?? []).find(
      (f: any) =>
        f.weekday === wd &&
        timeEq(f.lesson_time, l.lesson_time) &&
        (f.teacher_id === l.teacher_id ||
          f.room_id === null ||
          f.room_id === l.room_id)
    );

    if (fixedHit) {
      reasons.push(
        "해당 시간은 고정 슬롯으로 등록된 시간입니다. 재등록 가능성이 있는 자리이므로 새 수강권을 등록할 수 없습니다."
      );
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
      { error: "CONFLICT", details: errors },
      { status: 400 }
    );
  }

  /* ---------- insert class ---------- */

  const startDate = normalized[0].lesson_date;
  const endDate = normalized[normalized.length - 1].lesson_date;

  /* ---------- renewal check ---------- */
  const { data: existingClasses, error: existingClassErr } = await supabaseServer
    .from("classes")
    .select("id")
    .eq("student_id", studentId)
    .limit(1);

  if (existingClassErr) {
    return NextResponse.json(
      { error: "RENEWAL_CHECK_FAILED", message: existingClassErr.message },
      { status: 500 }
    );
  }

  const isRenewal = (existingClasses?.length ?? 0) > 0;
  const practiceOpenFrom = isRenewal ? addDaysYmd(startDate, -7) : startDate;

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
    initial_hours: qty,
    valid_from: startDate,
    valid_until: endDate,
    practice_open_from: practiceOpenFrom,
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

  return NextResponse.json({
    success: true,
    classId,
    isRenewal,
    practice_open_from: practiceOpenFrom,
    lessons: normalized.map((l) => ({
      idx: l.idx,
      lesson_date: l.lesson_date,
      lesson_time: l.lesson_time,
    })),
  });
}
