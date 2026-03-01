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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? todayStr();
    const to = url.searchParams.get("to") ?? addDaysStr(from, 6);

    // ✅ teacherId 확정 (TEACHER 우선, 아니면 ADMIN도 허용 + teacherId 쿼리 필요)
    let teacherId: string | null = null;

    // ✅ 너 프로젝트는 쿠키 기반 세션 → requireTeacher()는 req 인자 없음
    const t = await requireTeacher();

    if (t.ok) {
      teacherId = t.teacherUserId; // ✅ 통일: teacherUserId
    } else {
      // TEACHER 아니면 ADMIN인지 체크
      const a = await requireAdmin();
      if (!a.ok) {
        // teacher guard / admin guard 둘 다 실패면 401/403
        return NextResponse.json({ error: t.error ?? a.error }, { status: a.status ?? 401 });
      }

      const qTeacherId = url.searchParams.get("teacherId");
      if (!qTeacherId) {
        return NextResponse.json({ error: "TEACHER_ID_REQUIRED_FOR_ADMIN" }, { status: 400 });
      }
      teacherId = qTeacherId;
    }

    // ===== “강사용 주간 스케줄” 데이터 조회 =====

    // 1) 내 레슨 (teacherId 기준)
    const { data: lessons, error: lErr } = await supabaseServer
      .from("lessons")
      .select(
        `
        id,
        lesson_date,
        lesson_time,
        status,
        room_id,
        teacher_id,
        class:classes!inner (
          student_id
        )
      `
      )
      .eq("teacher_id", teacherId)
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

    // 2) 다른 선생님 레슨 (회색 블록용)
    const { data: otherLessons, error: oErr } = await supabaseServer
      .from("lessons")
      .select("id, lesson_date, lesson_time, status, room_id, teacher_id")
      .neq("teacher_id", teacherId)
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .neq("status", "canceled")
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

    // 3) 연습실 확정 예약(오렌지 블록)
    // ✅ “확정된 예약권만” = approved 만
    const { data: practice, error: pErr } = await supabaseServer
      .from("practice_reservations")
      .select("id, date, start_time, end_time, status, room_id")
      .gte("date", from)
      .lte("date", to)
      .eq("status", "approved");

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    return NextResponse.json({
      range: { from, to },
      teacherId,
      lessons: lessons ?? [],
      other_lessons: otherLessons ?? [],
      practice_reservations: practice ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}