import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}

// ✅ KST 기준 오늘
function todayYmdKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

async function requireStudent(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: "Unauthorized (no token)" };

  const { data: userData } = await supabaseServer.auth.getUser(token);
  const user = userData?.user;
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized (invalid token)" };

  const { data: me, error: meErr } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr) return { ok: false as const, status: 500, error: meErr.message };
  if (!me || me.role !== "student") return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, userId: user.id };
}

// students 테이블에 profile_id가 있는 경우만 대응 (없으면 null)
async function getStudentRowIdByProfileId(profileId: string) {
  const { data, error } = await supabaseServer
    .from("students")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) return null;
  return data?.id ?? null;
}

type RawLesson = any;

function normalizeLessonRows(rows: RawLesson[]) {
  return (rows ?? []).map((r: any) => {
    const c = r.class;
    const classRow = Array.isArray(c) ? c?.[0] : c;

    const teacherRel = Array.isArray(r.teacher) ? r.teacher?.[0] : r.teacher;
    const roomRel = Array.isArray(r.room) ? r.room?.[0] : r.room;

    return {
      id: r.id,
      lesson_date: String(r.lesson_date).slice(0, 10),
      lesson_time: String(r.lesson_time),
      status: r.status,
      allow_change_override: !!r.allow_change_override,

      class_id: classRow?.id ?? null,
      teacher_id: classRow?.teacher_id ?? null,
      student_id: classRow?.student_id ?? null,
      class_start_date: classRow?.start_date ? String(classRow.start_date).slice(0, 10) : null,
      class_end_date: classRow?.end_date ? String(classRow.end_date).slice(0, 10) : null,

      teacher_name: teacherRel?.name ?? null,
      room_name: roomRel?.name ?? null,
      room_id: r.room_id ?? null,
    };
  });
}

export async function GET(req: Request) {
  try {
    const auth = await requireStudent(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const url = new URL(req.url);
    const today = todayYmdKST();

    const from = url.searchParams.get("from") ?? today;
    const to = url.searchParams.get("to");

    if (!isYmd(from) || (to && !isYmd(to))) {
      return json({ error: "INVALID_RANGE" }, 400);
    }

    const profileId = auth.userId;
    const studentRowId = await getStudentRowIdByProfileId(profileId);

    const baseSelect = `
      id,
      lesson_date,
      lesson_time,
      status,
      allow_change_override,
      room_id,
      class:classes!inner (
        id,
        student_id,
        teacher_id,
        start_date,
        end_date
      ),
      teacher:profiles!lessons_teacher_id_fkey(name),
      room:practice_rooms!lessons_room_id_fkey(name)
    `;

    let q1 = supabaseServer
      .from("lessons")
      .select(baseSelect)
      .eq("class.student_id", profileId)
      .gte("lesson_date", from)
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (to) q1 = q1.lte("lesson_date", to);

    let q2:
      | Promise<{ data: any[] | null; error: { message: string } | null }>
      | null = null;

    if (studentRowId) {
      let query2 = supabaseServer
        .from("lessons")
        .select(baseSelect)
        .eq("class.student_id", studentRowId)
        .gte("lesson_date", from)
        .order("lesson_date", { ascending: true })
        .order("lesson_time", { ascending: true });

      if (to) query2 = query2.lte("lesson_date", to);

      q2 = query2 as unknown as Promise<{ data: any[] | null; error: { message: string } | null }>;
    }

    const [r1, r2] = await Promise.all([
      q1,
      q2 ?? Promise.resolve({ data: [], error: null }),
    ]);

    if (r1.error) return json({ error: r1.error.message }, 500);
    if (r2.error) return json({ error: r2.error.message }, 500);

    const merged = [...(r1.data ?? []), ...(r2.data ?? [])];

    const seen = new Set<string>();
    const uniq = merged.filter((x: any) => {
      const id = String(x.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const rows = normalizeLessonRows(uniq);

    return json({
      ok: true,
      rows,
      debug: {
        today,
        from,
        to: to ?? null,
        profileId,
        studentRowId,
        count: rows.length,
      },
    });
  } catch (e: any) {
    return json({ error: e?.message ?? "서버 오류" }, 500);
  }
}