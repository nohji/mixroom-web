import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * ✅ 무료 연습실 지급 규칙 (운영 정책)
 */
const FREE_PRACTICE_BY_CLASS = {
  "1month_controller": 4,
  "1month_turntable": 5,
  "3month_controller": 12,
  "3month_turntable": 15,
} as const;

/**
 * 레슨 횟수 규칙
 */
const LESSON_COUNT_BY_CLASS = {
  "1month": 4,
  "3month": 12,
} as const;

type ClassType = "1month" | "3month";
type DeviceType = "controller" | "turntable";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDaysYMD(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYMD(d);
}
function addWeeksYMD(ymd: string, weeks: number) {
  return addDaysYMD(ymd, weeks * 7);
}
function weekdayOf(ymd: string) {
  return new Date(`${ymd}T00:00:00`).getDay();
}
function toMin(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

/**
 * 마지막 레슨 날짜 구하기
 */
function getLastLessonDate(lessons: { lesson_date: string }[]) {
  if (lessons.length === 0) return null;
  return lessons.reduce(
    (latest, l) => (l.lesson_date > latest ? l.lesson_date : latest),
    lessons[0].lesson_date
  );
}

export async function POST(req: Request) {
  try {
    /* 1) 관리자 권한 체크 */
    const guard = await requireAdmin(req);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    /* 2) body 파싱 + 검증 */
    const body = await req.json().catch(() => ({}));

    const studentId = body.studentId as string | undefined;
    const classType = body.type as ClassType | undefined;
    const weekday = Number(body.weekday);
    const time = body.time as string | undefined;

    const deviceType = (body.deviceType ?? "controller") as DeviceType;

    // ✅ 후보 선택 결과로 내려오는 값들
    const startDate = body.startDate as string | undefined; // YYYY-MM-DD
    const teacherId = body.teacherId as string | undefined;
    const roomId = body.roomId as string | undefined;

    if (!studentId || !classType || Number.isNaN(weekday) || !time) {
      return NextResponse.json({ error: "필수 값 누락" }, { status: 400 });
    }
    if (!["1month", "3month"].includes(classType)) {
      return NextResponse.json({ error: "type 오류" }, { status: 400 });
    }
    if (weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: "weekday 오류" }, { status: 400 });
    }
    if (!["controller", "turntable"].includes(deviceType)) {
      return NextResponse.json({ error: "deviceType 오류" }, { status: 400 });
    }
    if (!startDate || !teacherId || !roomId) {
      return NextResponse.json(
        { error: "startDate/teacherId/roomId 누락 (후보 선택 필요)" },
        { status: 400 }
      );
    }

    const lessonCount = LESSON_COUNT_BY_CLASS[classType];

    /* 3) startDate 요일 보정 -> firstDate */
    let firstDate = startDate;
    {
      const wd = weekdayOf(firstDate);
      const delta = (weekday - wd + 7) % 7;
      if (delta !== 0) firstDate = addDaysYMD(firstDate, delta);
    }

    /* 4) 전체 레슨 날짜 생성 */
    const lessonDates: string[] = [];
    for (let i = 0; i < lessonCount; i++) {
      lessonDates.push(addWeeksYMD(firstDate, i));
    }

    /* 5) (핵심) 전체 회차 재검증 시작 */

    
   // 5-1) teacher_availabilities: 해당 teacher가 weekday/time/deviceType 가능인지
  // ✅ both 포함
  const availDeviceTypes =
    deviceType === "controller"
      ? (["controller", "both"] as const)
      : (["turntable", "both"] as const);

  const { data: avails, error: aErr } = await supabaseServer
    .from("teacher_availabilities")
    .select("weekday, start_time, end_time, slot_minutes, is_active, device_type")
    .eq("teacher_id", teacherId)
    .eq("weekday", weekday)
    .in("device_type", [...availDeviceTypes]) // ✅ 여기!
    .eq("is_active", true);

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!avails || avails.length === 0) {
    return NextResponse.json(
      { error: "선택한 강사는 해당 요일/기기 타입에 근무시간이 없습니다." },
      { status: 400 }
    );
  }


    // time이 슬롯 조건에 맞는지(근무 범위 + slot_minutes step)
    const timeMin = toMin(time);
    const timeOk = avails.some((a: any) => {
      const s = toMin(a.start_time);
      const e = toMin(a.end_time);
      const step = Number(a.slot_minutes ?? 60);
      if (!(timeMin >= s && timeMin + step <= e)) return false;
      return ((timeMin - s) % step) === 0;
    });

    if (!timeOk) {
      return NextResponse.json({ error: "선택한 시간은 강사 근무 슬롯이 아닙니다." }, { status: 400 });
    }

    // 5-2) room 검증(활성 + device 허용)
    {
      const { data: room, error: roomErr } = await supabaseServer
        .from("practice_rooms")
        .select("id, is_active, allow_controller, allow_turntable")
        .eq("id", roomId)
        .single();

      if (roomErr || !room || room.is_active === false) {
        return NextResponse.json({ error: "유효하지 않은 룸입니다." }, { status: 400 });
      }
      if (deviceType === "controller" && !room.allow_controller) {
        return NextResponse.json({ error: "해당 룸은 컨트롤러 수업 불가" }, { status: 400 });
      }
      if (deviceType === "turntable" && !room.allow_turntable) {
        return NextResponse.json({ error: "해당 룸은 턴테이블 수업 불가" }, { status: 400 });
      }
    }

    // 5-3) 전체 날짜에 대해 같은 시간 lessons 조회 → teacher 충돌 / room 충돌 전부 체크
    const { data: busyLessons, error: lErr } = await supabaseServer
      .from("lessons")
      .select(
        `
        id,
        lesson_date,
        lesson_time,
        room_id,
        class:classes!inner ( teacher_id )
      `
      )
      .in("lesson_date", lessonDates)
      .eq("lesson_time", time);

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

    // 날짜별로 바쁜 teacher/room 셋
    const busyTeacherByDate = new Map<string, Set<string>>();
    const busyRoomByDate = new Map<string, Set<string>>();

    function getSet(map: Map<string, Set<string>>, key: string) {
      const v = map.get(key);
      if (v) return v;
      const n = new Set<string>();
      map.set(key, n);
      return n;
    }

    (busyLessons ?? []).forEach((x: any) => {
      const d = x.lesson_date as string;
      const tId = Array.isArray(x.class) ? x.class?.[0]?.teacher_id : x.class?.teacher_id;
      if (tId) getSet(busyTeacherByDate, d).add(tId);
      if (x.room_id) getSet(busyRoomByDate, d).add(x.room_id);
    });

    // teacher가 전체 날짜에서 1번이라도 바쁘면 실패
    const teacherConflictDate = lessonDates.find((d) => {
      const set = busyTeacherByDate.get(d);
      return set ? set.has(teacherId) : false;
    });
    if (teacherConflictDate) {
      return NextResponse.json(
        { error: `강사 일정 충돌: ${teacherConflictDate} ${time}` },
        { status: 400 }
      );
    }

    // room이 전체 날짜에서 1번이라도 바쁘면 실패
    const roomConflictDate = lessonDates.find((d) => {
      const set = busyRoomByDate.get(d);
      return set ? set.has(roomId) : false;
    });
    if (roomConflictDate) {
      return NextResponse.json(
        { error: `룸 일정 충돌: ${roomConflictDate} ${time}` },
        { status: 400 }
      );
    }

    /* 6) classes 생성 */
    // end_date = firstDate + (lessonCount-1)주
    const endDate = addWeeksYMD(firstDate, lessonCount - 1);

    const { data: cls, error: clsErr } = await supabaseServer
      .from("classes")
      .insert({
        student_id: studentId,
        type: classType,
        weekday,
        time,
        total_lessons: lessonCount,

        teacher_id: teacherId,
        device_type: deviceType,
        room_id: roomId,

        start_date: firstDate, // ✅ 컬럼 없으면 제거
        end_date: endDate,     // ✅ 컬럼 없으면 제거
      })
      .select("id")
      .single();

    if (clsErr || !cls) {
      return NextResponse.json({ error: clsErr?.message ?? "classes 생성 실패" }, { status: 500 });
    }

    const classId = cls.id as string;

    /* 7) lessons 생성 (전체 날짜) */
    const lessonsToInsert = lessonDates.map((d) => ({
      class_id: classId,
      lesson_date: d,
      lesson_time: time,
      status: "scheduled",
      allow_change_override: false,
      room_id: roomId,
    }));

    const { data: insertedLessons, error: lessonsErr } = await supabaseServer
      .from("lessons")
      .insert(lessonsToInsert)
      .select("lesson_date");

    if (lessonsErr || !insertedLessons) {
      return NextResponse.json({ error: lessonsErr?.message ?? "레슨 생성 실패" }, { status: 500 });
    }

    /* 8) 무료 연습실 voucher 자동 생성 */
    const inserted = (insertedLessons as { lesson_date: string }[]) ?? [];
    const lastLessonDate = getLastLessonDate(inserted);

    if (!lastLessonDate) {
      return NextResponse.json({ error: "레슨 생성 실패: 마지막 레슨 날짜 없음" }, { status: 500 });
    }

    const ruleKey = `${classType}_${deviceType}` as keyof typeof FREE_PRACTICE_BY_CLASS;
    const freeQuantity = FREE_PRACTICE_BY_CLASS[ruleKey];

    if (!freeQuantity) {
      return NextResponse.json({ error: "무료 연습실 횟수 규칙을 찾을 수 없음" }, { status: 500 });
    }

    const firstLessonDate = inserted[0]?.lesson_date;
    if (!firstLessonDate) {
      return NextResponse.json({ error: "레슨 생성 실패: 첫 레슨 날짜 없음" }, { status: 500 });
    }

    const { error: voucherErr } = await supabaseServer.from("practice_vouchers").insert({
      student_id: studentId,
      voucher_type: "free",
      quantity: freeQuantity,
      valid_from: firstLessonDate,
      valid_until: lastLessonDate,
      cancel_limit_days: 3,
      source: "class",
    });

    if (voucherErr) {
      return NextResponse.json(
        { error: `무료 연습실 voucher 생성 실패: ${voucherErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      classId,
      lessonsCreated: lessonCount,
      firstDate,
      endDate,
      teacherId,
      roomId,
      freeVoucher: {
        quantity: freeQuantity,
        valid_from: firstLessonDate,
        valid_until: lastLessonDate,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
