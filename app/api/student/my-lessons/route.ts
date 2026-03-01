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

  const { data: me, error: meErr } = await supabaseServer.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (meErr) return { ok: false as const, status: 500, error: meErr.message };
  if (!me || me.role !== "student") return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, userId: user.id };
}

// students 테이블에 profile_id가 있는 경우만 대응 (없으면 null)
async function getStudentRowIdByProfileId(profileId: string) {
  const { data, error } = await supabaseServer.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}

type RawLesson = any;

function normalizeLessonRows(rows: RawLesson[]) {
  return (rows ?? []).map((r: any) => {
    const c = r.class; // join alias
    const classRow = Array.isArray(c) ? c?.[0] : c;

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

      // optional joins
      teacher_name: r.teacher?.name ?? null,
      room_name: r.room?.name ?? null,
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
    const to = url.searchParams.get("to"); // optional

    if (!isYmd(from) || (to && !isYmd(to))) return json({ error: "INVALID_RANGE" }, 400);

    const profileId = auth.userId;
    const studentRowId = await getStudentRowIdByProfileId(profileId);

    // ✅ 공통 select (teacher/room 이름까지 같이)
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

    // 1) classes.student_id = profiles.id
    let q1 = supabaseServer
      .from("lessons")
      .select(baseSelect)
      .eq("class.student_id", profileId)
      .gte("lesson_date", from)
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (to) q1 = q1.lte("lesson_date", to);

    const r1 = await q1;
    if (r1.error) return json({ error: r1.error.message }, 500);

    // 2) classes.student_id = students.id (옵션)
    let r2Data: any[] = [];
    if (studentRowId) {
      let q2 = supabaseServer
        .from("lessons")
        .select(baseSelect)
        .eq("class.student_id", studentRowId)
        .gte("lesson_date", from)
        .order("lesson_date", { ascending: true })
        .order("lesson_time", { ascending: true });

      if (to) q2 = q2.lte("lesson_date", to);

      const r2 = await q2;
      if (r2.error) return json({ error: r2.error.message }, 500);
      r2Data = r2.data ?? [];
    }

    const merged = [...(r1.data ?? []), ...(r2Data ?? [])];
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