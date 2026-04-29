import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateOnly(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nextDateByWeekday(baseDate: string, weekday: number) {
  const d = new Date(`${baseDate}T00:00:00+09:00`);
  const current = d.getDay();
  const diff = (weekday - current + 7) % 7;
  d.setDate(d.getDate() + diff);
  return toDateOnly(d);
}

function getWeekday(ymd: string) {
  return new Date(`${ymd}T00:00:00+09:00`).getDay();
}

function normalizeTime(t: string | null | undefined) {
  return String(t ?? "").slice(0, 5);
}

type Body = {
  fromDate?: string;
  roomId?: string | null;
  teacherId?: string | null;
  weekday?: number | null;
  lessonTime?: string | null;
  dryRun?: boolean;
  force?: boolean;
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin();

    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { id } = await ctx.params;
    const classId = id;

    const [{ data: rooms }, { data: teachers }, { data: lessons }] =
      await Promise.all([
        supabaseServer.from("practice_rooms").select("id, name").order("name"),
        supabaseServer
          .from("profiles")
          .select("id, name")
          .eq("role", "teacher")
          .eq("is_active", true)
          .order("name"),
        supabaseServer
          .from("lessons")
          .select("id, lesson_date, lesson_time, room_id, teacher_id, status")
          .eq("class_id", classId)
          .order("lesson_date")
          .order("lesson_time"),
      ]);

    return NextResponse.json({
      rooms: rooms ?? [],
      teachers: teachers ?? [],
      lessons: lessons ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin();

    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { id } = await ctx.params;
    const classId = id;

    const body = (await req.json().catch(() => ({}))) as Body;

    const fromDate = body.fromDate || toDateOnly(new Date());
    const dryRun = body.dryRun !== false;
    const force = body.force === true;

    const roomId = body.roomId || null;
    const teacherId = body.teacherId || null;
    const weekday =
      typeof body.weekday === "number" && body.weekday >= 0 && body.weekday <= 6
        ? body.weekday
        : null;
    const lessonTime = body.lessonTime || null;

    if (!roomId && !teacherId && weekday === null && !lessonTime) {
      return NextResponse.json(
        { error: "변경할 항목이 없습니다." },
        { status: 400 }
      );
    }

    const { data: targetLessons, error: targetErr } = await supabaseServer
      .from("lessons")
      .select("id, class_id, lesson_date, lesson_time, room_id, teacher_id, status")
      .eq("class_id", classId)
      .gte("lesson_date", fromDate)
      .order("lesson_date")
      .order("lesson_time");

    if (targetErr) {
      return NextResponse.json({ error: targetErr.message }, { status: 500 });
    }

    const activeTargets = (targetLessons ?? []).filter(
      (l) => l.status !== "canceled"
    );

    if (activeTargets.length === 0) {
      return NextResponse.json({
        ok: true,
        dryRun,
        message: "변경할 레슨이 없습니다.",
        count: 0,
        conflicts: [],
      });
    }

    const nextLessons = activeTargets.map((l) => ({
      id: l.id,
      lesson_date:
        weekday === null
          ? l.lesson_date
          : nextDateByWeekday(l.lesson_date, weekday),
      lesson_time: lessonTime || l.lesson_time,
      room_id: roomId || l.room_id,
      teacher_id: teacherId || l.teacher_id,
    }));

    const dates = [...new Set(nextLessons.map((l) => l.lesson_date))];

    const { data: otherLessons, error: otherErr } = await supabaseServer
      .from("lessons")
      .select("id, class_id, lesson_date, lesson_time, room_id, teacher_id, status")
      .in("lesson_date", dates)
      .neq("class_id", classId);

    if (otherErr) {
      return NextResponse.json({ error: otherErr.message }, { status: 500 });
    }

    const activeOthers = (otherLessons ?? []).filter(
      (l) => l.status !== "canceled"
    );

    const otherClassIds = [...new Set(activeOthers.map((l) => l.class_id))];
    const otherRoomIds = [...new Set(activeOthers.map((l) => l.room_id))];
    const otherTeacherIds = [...new Set(activeOthers.map((l) => l.teacher_id))];

    const targetTeacherIds = [...new Set(nextLessons.map((l) => l.teacher_id))];
    const targetRoomIds = [...new Set(nextLessons.map((l) => l.room_id))];

    const allTeacherIds = [...new Set([...otherTeacherIds, ...targetTeacherIds])];
    const allRoomIds = [...new Set([...otherRoomIds, ...targetRoomIds])];

    const [{ data: classRows }, { data: roomRows }, { data: teacherRows }] =
      await Promise.all([
        otherClassIds.length
          ? supabaseServer.from("classes").select("id, student_id").in("id", otherClassIds)
          : Promise.resolve({ data: [] }),

        allRoomIds.length
          ? supabaseServer.from("practice_rooms").select("id, name").in("id", allRoomIds)
          : Promise.resolve({ data: [] }),

        allTeacherIds.length
          ? supabaseServer.from("profiles").select("id, name").in("id", allTeacherIds)
          : Promise.resolve({ data: [] }),
      ]);

    const studentIds = [...new Set((classRows ?? []).map((c) => c.student_id))];

    const { data: studentRows } = studentIds.length
      ? await supabaseServer.from("profiles").select("id, name").in("id", studentIds)
      : { data: [] };

    const { data: availabilityRows, error: availabilityErr } =
      targetTeacherIds.length
        ? await supabaseServer
            .from("teacher_availabilities")
            .select("teacher_id, weekday, start_time, end_time")
            .in("teacher_id", targetTeacherIds)
        : { data: [], error: null };

    if (availabilityErr) {
      return NextResponse.json({ error: availabilityErr.message }, { status: 500 });
    }

    const { data: teacherChangeBlocks, error: teacherChangeBlockErr } =
      targetTeacherIds.length
        ? await supabaseServer
        .from("teacher_change_blocks")
        .select("id, teacher_id, weekday, start_time, end_time, reason")
            .in("teacher_id", targetTeacherIds)
        : { data: [], error: null };

    if (teacherChangeBlockErr) {
      return NextResponse.json(
        { error: teacherChangeBlockErr.message },
        { status: 500 }
      );
    }

    const { data: fixedRows, error: fixedErr } = await supabaseServer
      .from("fixed_schedule_slots")
      .select("id, student_id, teacher_id, weekday, lesson_time, hold_for_renewal, memo");

    if (fixedErr) {
      return NextResponse.json({ error: fixedErr.message }, { status: 500 });
    }

    const { data: adminBlocks, error: blockErr } = await supabaseServer
      .from("practice_reservations")
      .select("id, date, start_time, end_time, room_id, status, reservation_kind, admin_block_reason")
      .in("date", dates)
      .neq("status", "CANCELED");

    if (blockErr) {
      return NextResponse.json({ error: blockErr.message }, { status: 500 });
    }

    const classMap = new Map((classRows ?? []).map((c) => [c.id, c]));
    const roomMap = new Map((roomRows ?? []).map((r) => [r.id, r]));
    const teacherMap = new Map((teacherRows ?? []).map((t) => [t.id, t]));
    const studentMap = new Map((studentRows ?? []).map((s) => [s.id, s]));

    const getStudentName = (row: any) => {
      const cls = classMap.get(row.class_id);
      const student = cls ? studentMap.get(cls.student_id) : null;
      return student?.name ?? "-";
    };

    const getTeacherName = (row: any) => {
      return teacherMap.get(row.teacher_id)?.name ?? "-";
    };

    const getRoomName = (row: any) => {
      return roomMap.get(row.room_id)?.name ?? "-";
    };

    const isTeacherAvailable = (
      targetTeacherId: string,
      targetDate: string,
      targetTime: string
    ) => {
      const wd = getWeekday(targetDate);
      const time = normalizeTime(targetTime);

      return (availabilityRows ?? []).some((a: any) => {
        return (
          a.teacher_id === targetTeacherId &&
          Number(a.weekday) === wd &&
          normalizeTime(a.start_time) <= time &&
          time < normalizeTime(a.end_time)
        );
      });
    };

    const findTeacherChangeBlock = (
        targetTeacherId: string,
        targetDate: string,
        targetTime: string
      ) => {
        const wd = getWeekday(targetDate);
        const time = normalizeTime(targetTime);
      
        return (teacherChangeBlocks ?? []).find((b: any) => {
          return (
            b.teacher_id === targetTeacherId &&
            Number(b.weekday) === wd &&
            normalizeTime(b.start_time) <= time &&
            time < normalizeTime(b.end_time)
          );
        });
      };

    const findFixedSlot = (
      targetTeacherId: string,
      targetDate: string,
      targetTime: string
    ) => {
      const wd = getWeekday(targetDate);
      const time = normalizeTime(targetTime);

      return (fixedRows ?? []).find((p: any) => {
        return (
          p.teacher_id === targetTeacherId &&
          Number(p.weekday) === wd &&
          normalizeTime(p.lesson_time) === time
        );
      });
    };

    const findAdminBlock = (
      targetRoomId: string,
      targetDate: string,
      targetTime: string
    ) => {
      const time = normalizeTime(targetTime);

      return (adminBlocks ?? []).find((b: any) => {
        const kind = String(b.reservation_kind ?? "").toUpperCase();

        return (
          kind === "ADMIN_BLOCK" &&
          b.room_id === targetRoomId &&
          b.date === targetDate &&
          normalizeTime(b.start_time) <= time &&
          time < normalizeTime(b.end_time)
        );
      });
    };

    const conflicts: any[] = [];

    for (const next of nextLessons) {
      if (!isTeacherAvailable(next.teacher_id, next.lesson_date, next.lesson_time)) {
        conflicts.push({
          type: "TEACHER_AVAILABILITY_CONFLICT",
          lessonId: next.id,
          lessonDate: next.lesson_date,
          lessonTime: next.lesson_time,
          conflictLessonId: null,
          conflictStudentName: "-",
          conflictTeacherName: getTeacherName({ teacher_id: next.teacher_id }),
          conflictRoomName: getRoomName({ room_id: next.room_id }),
          message: `${next.lesson_date} ${next.lesson_time}에 해당 선생님 근무시간이 아닙니다.`,
        });
      }

      const teacherChangeBlock = findTeacherChangeBlock(
        next.teacher_id,
        next.lesson_date,
        next.lesson_time
      );

      if (teacherChangeBlock) {
        conflicts.push({
          type: "TEACHER_CHANGE_BLOCK_CONFLICT",
          lessonId: next.id,
          lessonDate: next.lesson_date,
          lessonTime: next.lesson_time,
          conflictLessonId: teacherChangeBlock.id,
          conflictStudentName: "-",
          conflictTeacherName: getTeacherName({ teacher_id: next.teacher_id }),
          conflictRoomName: getRoomName({ room_id: next.room_id }),
          message: `${next.lesson_date} ${next.lesson_time}은 선생님 변경 차단 시간입니다.${
            teacherChangeBlock.reason ? ` (${teacherChangeBlock.reason})` : ""
          }`,
        });
      }

      const fixedSlot = findFixedSlot(
        next.teacher_id,
        next.lesson_date,
        next.lesson_time
      );

      if (fixedSlot) {
        conflicts.push({
          type: fixedSlot.hold_for_renewal
            ? "PROTECTED_FIXED_SCHEDULE_CONFLICT"
            : "FIXED_SCHEDULE_BLOCK_CONFLICT",
          lessonId: next.id,
          lessonDate: next.lesson_date,
          lessonTime: next.lesson_time,
          conflictLessonId: fixedSlot.id,
          conflictStudentName: "-",
          conflictTeacherName: getTeacherName({ teacher_id: next.teacher_id }),
          conflictRoomName: getRoomName({ room_id: next.room_id }),
          message: fixedSlot.hold_for_renewal
            ? `${next.lesson_date} ${next.lesson_time}은 보호 중인 고정 스케줄입니다.`
            : `${next.lesson_date} ${next.lesson_time}은 변경 차단 시간입니다.`,
        });
      }

      const adminBlock = findAdminBlock(
        next.room_id,
        next.lesson_date,
        next.lesson_time
      );

      if (adminBlock) {
        conflicts.push({
          type: "ADMIN_BLOCK_CONFLICT",
          lessonId: next.id,
          lessonDate: next.lesson_date,
          lessonTime: next.lesson_time,
          conflictLessonId: adminBlock.id,
          conflictStudentName: "-",
          conflictTeacherName: getTeacherName({ teacher_id: next.teacher_id }),
          conflictRoomName: getRoomName({ room_id: next.room_id }),
          message: `${next.lesson_date} ${next.lesson_time}은 운영 차단된 시간입니다. (${
            adminBlock.admin_block_reason ?? "사유 없음"
          })`,
        });
      }

      const roomConflict = activeOthers.find(
        (o) =>
          o.lesson_date === next.lesson_date &&
          o.lesson_time === next.lesson_time &&
          o.room_id === next.room_id
      );

      if (roomConflict) {
        conflicts.push({
          type: "ROOM_CONFLICT",
          lessonId: next.id,
          lessonDate: next.lesson_date,
          lessonTime: next.lesson_time,
          conflictLessonId: roomConflict.id,
          conflictStudentName: getStudentName(roomConflict),
          conflictTeacherName: getTeacherName(roomConflict),
          conflictRoomName: getRoomName(roomConflict),
          message: `${next.lesson_date} ${next.lesson_time}에 같은 홀 레슨이 있습니다.`,
        });
      }

      const teacherConflict = activeOthers.find(
        (o) =>
          o.lesson_date === next.lesson_date &&
          o.lesson_time === next.lesson_time &&
          o.teacher_id === next.teacher_id
      );

      if (teacherConflict) {
        conflicts.push({
          type: "TEACHER_CONFLICT",
          lessonId: next.id,
          lessonDate: next.lesson_date,
          lessonTime: next.lesson_time,
          conflictLessonId: teacherConflict.id,
          conflictStudentName: getStudentName(teacherConflict),
          conflictTeacherName: getTeacherName(teacherConflict),
          conflictRoomName: getRoomName(teacherConflict),
          message: `${next.lesson_date} ${next.lesson_time}에 같은 선생님 레슨이 있습니다.`,
        });
      }
    }

    if (conflicts.length > 0 && !force) {
      return NextResponse.json(
        {
          ok: false,
          needsConfirm: true,
          dryRun: true,
          count: nextLessons.length,
          conflicts,
        },
        { status: 409 }
      );
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        count: nextLessons.length,
        conflicts,
        nextLessons,
      });
    }

    for (const next of nextLessons) {
      const { error } = await supabaseServer
        .from("lessons")
        .update({
          lesson_date: next.lesson_date,
          lesson_time: next.lesson_time,
          room_id: next.room_id,
          teacher_id: next.teacher_id,
          status: "admin_changed",
          changed_at: new Date().toISOString(),
        })
        .eq("id", next.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      count: nextLessons.length,
      conflicts,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}