// app/api/student/my-lessons/options/route.ts
import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/requireStudent";
import { supabaseServer } from "@/lib/supabaseServer";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}

function clampHHMM(t: string) {
  return String(t ?? "").slice(0, 5);
}

function parseYmdLocal(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function timeToMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minToTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeDow(dbWeekday: number) {
  if (dbWeekday >= 0 && dbWeekday <= 6) return dbWeekday;
  if (dbWeekday >= 1 && dbWeekday <= 7) return dbWeekday === 7 ? 0 : dbWeekday - 1;
  return dbWeekday;
}

function normalizeReservationKind(v: any): "STUDENT" | "ADMIN_BLOCK" {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "ADMIN_BLOCK" || s === "ADMIN-BLOCK" || s === "BLOCK") {
    return "ADMIN_BLOCK";
  }
  return "STUDENT";
}

function isCanceledStatus(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "canceled" || s === "cancelled";
}

function addBlockedRangeToSet(
  target: Set<string>,
  dateStr: string,
  roomId: string,
  startTime: string,
  endTime: string
) {
  const s = timeToMin(clampHHMM(startTime));
  const e = timeToMin(clampHHMM(endTime));

  if (!dateStr || !roomId) return;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return;
  if (e <= s) return;

  for (let m = s; m < e; m += 60) {
    const t = minToTime(m);
    target.add(`${dateStr}|${t}|${roomId}`);
  }
}

function isBlockedByChangeBlock(
  slotTime: string,
  blocks: Array<{ start_time: string; end_time: string }>
) {
  const slotMin = timeToMin(slotTime);

  return blocks.some((b) => {
    const startMin = timeToMin(clampHHMM(b.start_time));
    const endMin = timeToMin(clampHHMM(b.end_time));
    return slotMin >= startMin && slotMin < endMin;
  });
}

function hasClassCoveringDate(
  studentId: string,
  dateStr: string,
  classWindowsByStudent: Map<string, Array<{ start_date: string; end_date: string }>>
) {
  const windows = classWindowsByStudent.get(studentId) ?? [];
  return windows.some((w) => w.start_date <= dateStr && dateStr <= w.end_date);
}

function hasActualLessonAtFixedSlot(
  studentId: string,
  teacherId: string,
  dateStr: string,
  time: string,
  ownerLessonsAtSlot: Set<string>
) {
  return ownerLessonsAtSlot.has(`${studentId}|${teacherId}|${dateStr}|${time}`);
}

function isProtectedSlot(
  dateStr: string,
  time: string,
  teacherId: string,
  currentStudentId: string,
  fixedSlots: any[],
  classWindowsByStudent: Map<string, Array<{ start_date: string; end_date: string }>>,
  ownerLessonsAtSlot: Set<string>
) {
  const dow = new Date(`${dateStr}T00:00:00`).getDay();

  return fixedSlots.some((slot) => {
    const slotTeacherId = String(slot.teacher_id);
    const slotStudentId = String(slot.student_id);
    const slotDow = normalizeDow(Number(slot.weekday));
    const slotTime = clampHHMM(String(slot.lesson_time ?? ""));

    if (slotTeacherId !== String(teacherId)) return false;
    if (slotDow !== dow) return false;
    if (slotTime !== time) return false;
    if (slotStudentId === String(currentStudentId)) return false;

    const inClassPeriod = hasClassCoveringDate(slotStudentId, dateStr, classWindowsByStudent);

    const hasLessonThere = hasActualLessonAtFixedSlot(
      slotStudentId,
      slotTeacherId,
      dateStr,
      time,
      ownerLessonsAtSlot
    );

    if (inClassPeriod && !hasLessonThere) {
      return false;
    }

    return true;
  });
}

export async function GET(req: Request) {
  const guard = await requireStudent();
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  const student_id = String(guard.studentUserId);

  const url = new URL(req.url);
  const teacher_id = url.searchParams.get("teacher_id") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!teacher_id) return json({ error: "TEACHER_ID_REQUIRED" }, 400);
  if (!isYmd(from) || !isYmd(to)) return json({ error: "INVALID_RANGE" }, 400);

  const [
    { data: rooms, error: roomErr },
    { data: avails, error: aErr },
    { data: lessonsAll, error: lErrAll },
    { data: adminBlocks, error: bErr },
    { data: lessonsTeacher, error: lErrTeacher },
    { data: onedayLessons, error: odErr },
    { data: changeBlocks, error: cbErr },
    { data: dateChangeBlocks, error: dcbErr },
    { data: fixedSlots, error: fsErr },
  ] = await Promise.all([
    supabaseServer
      .from("practice_rooms")
      .select("id, name")
      .order("name", { ascending: true }),

    supabaseServer
      .from("teacher_availabilities")
      .select("weekday, start_time, end_time, is_active")
      .eq("teacher_id", teacher_id)
      .eq("is_active", true),

    supabaseServer
      .from("lessons")
      .select("lesson_date, lesson_time, room_id, status")
      .gte("lesson_date", from)
      .lte("lesson_date", to),

    supabaseServer
      .from("practice_reservations")
      .select("date, start_time, end_time, room_id, status, reservation_kind")
      .gte("date", from)
      .lte("date", to)
      .in("status", ["APPROVED"]),

    supabaseServer
      .from("lessons")
      .select(`
        lesson_date,
        lesson_time,
        status,
        class:classes (
          student_id
        )
      `)
      .eq("teacher_id", teacher_id)
      .gte("lesson_date", from)
      .lte("lesson_date", to),

    supabaseServer
      .from("oneday_lessons")
      .select("lesson_date, lesson_time, teacher_id")
      .eq("teacher_id", teacher_id)
      .neq("status", "canceled")
      .gte("lesson_date", from)
      .lte("lesson_date", to),

    supabaseServer
      .from("teacher_change_blocks")
      .select("weekday, start_time, end_time, is_active")
      .eq("teacher_id", teacher_id)
      .eq("is_active", true),

    supabaseServer
      .from("teacher_change_date_blocks")
      .select("block_date, start_time, end_time, is_active")
      .eq("teacher_id", teacher_id)
      .eq("is_active", true)
      .gte("block_date", from)
      .lte("block_date", to),

    supabaseServer
      .from("fixed_schedule_slots")
      .select("student_id, teacher_id, weekday, lesson_time, hold_for_renewal")
      .eq("teacher_id", teacher_id)
      .eq("hold_for_renewal", true),
  ]);

  if (roomErr) return json({ error: roomErr.message }, 500);
  if (aErr) return json({ error: aErr.message }, 500);
  if (lErrAll) return json({ error: lErrAll.message }, 500);
  if (bErr) return json({ error: bErr.message }, 500);
  if (lErrTeacher) return json({ error: lErrTeacher.message }, 500);
  if (odErr) return json({ error: odErr.message }, 500);
  if (cbErr) return json({ error: cbErr.message }, 500);
  if (dcbErr) return json({ error: dcbErr.message }, 500);
  if (fsErr) return json({ error: fsErr.message }, 500);

  const roomIds = (rooms ?? []).map((r: any) => String(r.id));

  const fixedSlotOwnerIds = Array.from(
    new Set((fixedSlots ?? []).map((s: any) => String(s.student_id)))
  );

  const classWindowsByStudent = new Map<string, Array<{ start_date: string; end_date: string }>>();

  if (fixedSlotOwnerIds.length > 0) {
    const { data: ownerClasses, error: ocErr } = await supabaseServer
      .from("classes")
      .select("student_id, start_date, end_date")
      .in("student_id", fixedSlotOwnerIds)
      .lte("start_date", to)
      .gte("end_date", from);

    if (ocErr) return json({ error: ocErr.message }, 500);

    (ownerClasses ?? []).forEach((c: any) => {
      const sid = String(c.student_id);
      const arr = classWindowsByStudent.get(sid) ?? [];
      arr.push({
        start_date: String(c.start_date).slice(0, 10),
        end_date: String(c.end_date).slice(0, 10),
      });
      classWindowsByStudent.set(sid, arr);
    });
  }

  const availByDow = new Map<number, { s: number; e: number }[]>();
  (avails ?? []).forEach((a: any) => {
    const dow = normalizeDow(Number(a.weekday));
    const s = timeToMin(clampHHMM(a.start_time));
    const e = timeToMin(clampHHMM(a.end_time));
    const arr = availByDow.get(dow) ?? [];
    arr.push({ s, e });
    availByDow.set(dow, arr);
  });

  const lessonBlocked = new Set<string>();
  (lessonsAll ?? []).forEach((l: any) => {
    if (isCanceledStatus(l.status)) return;

    const d = String(l.lesson_date ?? "").slice(0, 10);
    const t = clampHHMM(String(l.lesson_time ?? ""));
    const rid = String(l.room_id ?? "");
    if (d && t && rid) lessonBlocked.add(`${d}|${t}|${rid}`);
  });

  const adminBlockBlocked = new Set<string>();
  (adminBlocks ?? []).forEach((r: any) => {
    const kind = normalizeReservationKind(r.reservation_kind);
    if (kind !== "ADMIN_BLOCK") return;

    addBlockedRangeToSet(
      adminBlockBlocked,
      String(r.date),
      String(r.room_id),
      r.start_time,
      r.end_time
    );
  });

  const roomBlocked = new Set([...lessonBlocked, ...adminBlockBlocked]);

  const teacherBusy = new Set<string>();
  const ownerLessonsAtSlot = new Set<string>();

  (lessonsTeacher ?? []).forEach((l: any) => {
    if (isCanceledStatus(l.status)) return;

    const d = String(l.lesson_date ?? "").slice(0, 10);
    const t = clampHHMM(String(l.lesson_time ?? ""));
    if (d && t) teacherBusy.add(`${d}|${t}`);

    const cls = Array.isArray(l.class) ? l.class[0] : l.class;
    const sid = cls?.student_id ? String(cls.student_id) : "";
    if (sid && d && t) {
      ownerLessonsAtSlot.add(`${sid}|${teacher_id}|${d}|${t}`);
    }
  });

  // 원데이 레슨에 강사가 지정된 경우, 해당 강사 시간은 학생 변경 가능 시간에서 제외
  (onedayLessons ?? []).forEach((l: any) => {
    const d = String(l.lesson_date ?? "").slice(0, 10);
    const t = clampHHMM(String(l.lesson_time ?? ""));

    if (d && t) {
      teacherBusy.add(`${d}|${t}`);
    }
  });

  const start = parseYmdLocal(from);
  const end = parseYmdLocal(to);

  const by_date: any = {};

  for (let cur = new Date(start); cur <= end; cur = addDays(cur, 1)) {
    const dateStr = ymd(cur);
    const dow = cur.getDay();
    const windows = availByDow.get(dow) ?? [];
    if (windows.length === 0) continue;

    const changeBlocksForDay = (changeBlocks ?? []).filter(
      (b: any) => normalizeDow(Number(b.weekday)) === dow
    );

    const dateChangeBlocksForDay = (dateChangeBlocks ?? []).filter(
      (b: any) => String(b.block_date).slice(0, 10) === dateStr
    );

    const times: string[] = [];
    const rooms_by_time: any = {};

    for (const w of windows) {
      for (let m = Math.ceil(w.s / 60) * 60; m + 60 <= w.e; m += 60) {
        const t = minToTime(m);

        if (teacherBusy.has(`${dateStr}|${t}`)) continue;

        if (isBlockedByChangeBlock(t, changeBlocksForDay as any)) continue;

        if (isBlockedByChangeBlock(t, dateChangeBlocksForDay as any)) continue;

        if (
          isProtectedSlot(
            dateStr,
            t,
            teacher_id,
            student_id,
            fixedSlots ?? [],
            classWindowsByStudent,
            ownerLessonsAtSlot
          )
        ) {
          continue;
        }

        const okRooms: string[] = [];
        for (const rid of roomIds) {
          if (!roomBlocked.has(`${dateStr}|${t}|${rid}`)) {
            okRooms.push(rid);
          }
        }

        if (okRooms.length > 0) {
          times.push(t);
          rooms_by_time[t] = okRooms;
        }
      }
    }

    if (times.length > 0) {
      by_date[dateStr] = { times, rooms_by_time };
    }
  }

  return json({
    ok: true,
    teacher_id,
    range: { from, to },
    rooms: rooms ?? [],
    by_date,
  });
}