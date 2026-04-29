import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireTeacher } from "@/lib/requireTeacher";
import { requireAdmin } from "@/lib/requireAdmin";

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysStr(base: string, days: number) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function hhmm(v: string | null | undefined) {
  return String(v ?? "").slice(0, 5);
}

function sortLessonKey(row: {
  lesson_date?: string | null;
  lesson_time?: string | null;
}) {
  return `${row.lesson_date ?? ""} ${hhmm(row.lesson_time)}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? todayStr();
    const to = url.searchParams.get("to") ?? addDaysStr(from, 6);

    let teacherId: string | null = null;

    const t = await requireTeacher();

    if (t.ok) {
      teacherId = t.teacherUserId;
    } else {
      const a = await requireAdmin();
      if (!a.ok) {
        return NextResponse.json(
          { error: t.error ?? a.error },
          { status: a.status ?? 401 }
        );
      }

      const qTeacherId = url.searchParams.get("teacherId");
      if (!qTeacherId) {
        return NextResponse.json(
          { error: "TEACHER_ID_REQUIRED_FOR_ADMIN" },
          { status: 400 }
        );
      }

      teacherId = qTeacherId;
    }

    const { data: teacherProfile } = await supabaseServer
      .from("profiles")
      .select("id, name")
      .eq("id", teacherId)
      .maybeSingle();

    const { data: myLessonRows, error: myErr } = await supabaseServer
      .from("lessons")
      .select(`
        id,
        class_id,
        lesson_date,
        lesson_time,
        status,
        allow_change_override,
        teacher_id,
        room_id,
        lesson_no
      `)
      .eq("teacher_id", teacherId)
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .neq("status", "canceled")
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (myErr) {
      return NextResponse.json({ error: myErr.message }, { status: 500 });
    }

    const classIds = Array.from(
      new Set((myLessonRows ?? []).map((r: any) => r.class_id).filter(Boolean))
    ) as string[];

    const roomIds = Array.from(
      new Set((myLessonRows ?? []).map((r: any) => r.room_id).filter(Boolean))
    ) as string[];

    let classRows: any[] = [];
    if (classIds.length > 0) {
      const { data, error } = await supabaseServer
        .from("classes")
        .select("id, student_id, total_lessons, type")
        .in("id", classIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      classRows = data ?? [];
    }

    const studentIds = Array.from(
      new Set(classRows.map((r: any) => r.student_id).filter(Boolean))
    ) as string[];

    let studentProfiles: any[] = [];
    if (studentIds.length > 0) {
      const { data, error } = await supabaseServer
        .from("profiles")
        .select("id, name")
        .in("id", studentIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      studentProfiles = data ?? [];
    }

    let classLessonRows: any[] = [];
    if (classIds.length > 0) {
      const { data, error } = await supabaseServer
        .from("lessons")
        .select("id, class_id, lesson_date, lesson_time, lesson_no, status")
        .in("class_id", classIds)
        .neq("status", "canceled")
        .order("lesson_date", { ascending: true })
        .order("lesson_time", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      classLessonRows = data ?? [];
    }

    const { data: otherLessonRows, error: otherErr } = await supabaseServer
      .from("lessons")
      .select(`
        id,
        lesson_date,
        lesson_time,
        status,
        teacher_id,
        room_id,
        allow_change_override
      `)
      .neq("teacher_id", teacherId)
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .neq("status", "canceled")
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (otherErr) {
      return NextResponse.json({ error: otherErr.message }, { status: 500 });
    }

    otherLessonRows?.forEach((r: any) => {
      if (r.room_id) roomIds.push(r.room_id);
    });

    const { data: practiceRows, error: practiceErr } = await supabaseServer
      .from("practice_reservations")
      .select(`
        id,
        student_id,
        room_id,
        date,
        start_time,
        end_time,
        status
      `)
      .gte("date", from)
      .lte("date", to)
      .eq("status", "APPROVED");

    if (practiceErr) {
      return NextResponse.json({ error: practiceErr.message }, { status: 500 });
    }

    const practiceStudentIds = Array.from(
      new Set((practiceRows ?? []).map((r: any) => r.student_id).filter(Boolean))
    ) as string[];

    if (practiceStudentIds.length > 0) {
      const missingIds = practiceStudentIds.filter(
        (id) => !studentProfiles.some((p: any) => p.id === id)
      );

      if (missingIds.length > 0) {
        const { data, error } = await supabaseServer
          .from("profiles")
          .select("id, name")
          .in("id", missingIds);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        studentProfiles = [...studentProfiles, ...(data ?? [])];
      }
    }

    practiceRows?.forEach((r: any) => {
      if (r.room_id) roomIds.push(r.room_id);
    });

    const uniqueRoomIds = Array.from(new Set(roomIds.filter(Boolean))) as string[];

    let roomRows: any[] = [];
    if (uniqueRoomIds.length > 0) {
      const { data, error } = await supabaseServer
        .from("practice_rooms")
        .select("id, name")
        .in("id", uniqueRoomIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      roomRows = data ?? [];
    }

    const { data: availabilityRows, error: availabilityErr } = await supabaseServer
      .from("teacher_availabilities")
      .select("teacher_id, weekday, start_time, end_time, device_type")
      .eq("teacher_id", teacherId)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (availabilityErr) {
      return NextResponse.json({ error: availabilityErr.message }, { status: 500 });
    }

    const { data: changeBlockRows, error: changeBlockErr } = await supabaseServer
      .from("teacher_change_blocks")
      .select(`
        id,
        teacher_id,
        weekday,
        start_time,
        end_time,
        reason
      `)
      .eq("teacher_id", teacherId)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (changeBlockErr) {
      return NextResponse.json({ error: changeBlockErr.message }, { status: 500 });
    }

    const classMap = new Map<string, any>(
      classRows.map((row: any) => [row.id, row])
    );

    const profileMap = new Map<string, any>(
      studentProfiles.map((row: any) => [row.id, row])
    );

    const roomMap = new Map<string, any>(
      roomRows.map((row: any) => [row.id, row])
    );

    const classLessonMap = new Map<string, any[]>();

    classLessonRows.forEach((row: any) => {
      const arr = classLessonMap.get(row.class_id) ?? [];
      arr.push(row);
      classLessonMap.set(row.class_id, arr);
    });

    classLessonMap.forEach((arr) => {
      arr.sort((a, b) => {
        const dateCompare = sortLessonKey(a).localeCompare(sortLessonKey(b));
        if (dateCompare !== 0) return dateCompare;

        return String(a.id ?? "").localeCompare(String(b.id ?? ""));
      });
    });

    const myLessons = (myLessonRows ?? []).map((row: any) => {
      const cls = row.class_id ? classMap.get(row.class_id) : null;
      const student = cls?.student_id ? profileMap.get(cls.student_id) : null;
      const room = row.room_id ? roomMap.get(row.room_id) : null;

      const allClassLessons = row.class_id
        ? classLessonMap.get(row.class_id) ?? []
        : [];

      // 연장/강제변경 후 DB lesson_no가 꼬여도
      // 선생님 화면에서는 현재 날짜/시간 순서 기준으로 회차를 다시 계산
      const idx = allClassLessons.findIndex((x: any) => x.id === row.id);

      return {
        id: row.id,
        lesson_date: row.lesson_date,
        lesson_time: hhmm(row.lesson_time),
        status: row.status,
        allow_change_override: !!row.allow_change_override,

        teacher_id: row.teacher_id ?? null,
        room_id: row.room_id ?? null,
        room_name: room?.name ?? "",

        student_id: cls?.student_id ?? null,
        student_name: student?.name ?? "이름 없음",

        lesson_no: idx >= 0 ? idx + 1 : null,
        total_lessons: cls?.total_lessons ?? allClassLessons.length ?? null,
        class_type: cls?.type ?? null,
      };
    });

    const otherLessons = (otherLessonRows ?? []).map((row: any) => {
      const room = row.room_id ? roomMap.get(row.room_id) : null;

      return {
        id: row.id,
        lesson_date: row.lesson_date,
        lesson_time: hhmm(row.lesson_time),
        status: row.status,
        allow_change_override: !!row.allow_change_override,

        teacher_id: row.teacher_id ?? null,
        room_id: row.room_id ?? null,
        room_name: room?.name ?? "",

        student_id: null,
        student_name: "수업 있음",
      };
    });

    const practiceReservations = (practiceRows ?? []).map((row: any) => {
      const room = row.room_id ? roomMap.get(row.room_id) : null;
      const sid = row.student_id ?? null;
      const student = sid ? profileMap.get(sid) : null;

      return {
        id: row.id,
        room_id: row.room_id ?? null,
        room_name: room?.name ?? "",

        date: row.date ?? null,
        start_time: hhmm(row.start_time),
        end_time: hhmm(row.end_time),

        student_id: sid,
        student_name: student?.name ?? "연습실 예약",
        status: row.status,
      };
    });

    const availability = (availabilityRows ?? []).map((row: any) => ({
      teacher_id: row.teacher_id,
      teacher_name: teacherProfile?.name ?? "강사",
      date: "",
      weekday: Number(row.weekday),
      start_time: hhmm(row.start_time),
      end_time: hhmm(row.end_time),
      device_type: row.device_type ?? "both",
    }));

    const changeBlocks = (changeBlockRows ?? []).map((row: any) => ({
      id: row.id,
      teacher_id: row.teacher_id ?? teacherId,
      weekday: Number(row.weekday),
      start_time: hhmm(row.start_time),
      end_time: hhmm(row.end_time),
      reason: row.reason ?? null,
    }));

    return NextResponse.json({
      range: { from, to },
      teacherId,
      my_lessons: myLessons,
      other_lessons: otherLessons,
      availability,
      practice_reservations: practiceReservations,
      change_blocks: changeBlocks,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}