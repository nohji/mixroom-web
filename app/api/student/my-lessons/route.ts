import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function requireStudent(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: "Unauthorized (no token)" };

  const { data: userData } = await supabaseServer.auth.getUser(token);
  const user = userData?.user;
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized (invalid token)" };

  const { data: me } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!me || me.role !== "student") return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, userId: user.id };
}

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

export async function GET(req: Request) {
  try {
    const auth = await requireStudent(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? todayStr();
    const to = url.searchParams.get("to"); // optional

    // ✅ profiles.id 기준(권장)
    const profileId = auth.userId;

    // ✅ 혹시 classes.student_id가 students.id로 저장된 케이스 대비
    const studentRowId = await getStudentRowIdByProfileId(profileId);

    // 1) classes.student_id = profiles.id 인 레슨
    let q1 = supabaseServer
      .from("lessons")
      .select(
        `
        id,
        lesson_date,
        lesson_time,
        status,
        allow_change_override,
        class:classes!inner (
          id,
          student_id,
          teacher_id,
          start_date,
          end_date
        )
      `
      )
      .eq("class.student_id", profileId)
      .gte("lesson_date", from)
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (to) q1 = q1.lte("lesson_date", to);

    const { data: data1, error: err1 } = await q1;
    if (err1) return NextResponse.json({ error: err1.message }, { status: 500 });

    // 2) classes.student_id = students.id 인 레슨 (가능한 경우만)
    let data2: any[] = [];
    if (studentRowId) {
      let q2 = supabaseServer
        .from("lessons")
        .select(
          `
          id,
          lesson_date,
          lesson_time,
          status,
          allow_change_override,
          class:classes!inner (
            id,
            student_id,
            teacher_id,
            start_date,
            end_date
          )
        `
        )
        .eq("class.student_id", studentRowId)
        .gte("lesson_date", from)
        .order("lesson_date", { ascending: true })
        .order("lesson_time", { ascending: true });

      if (to) q2 = q2.lte("lesson_date", to);

      const r2 = await q2;
      if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 });
      data2 = r2.data ?? [];
    }

    // ✅ 합치고 중복 제거
    const merged = [...(data1 ?? []), ...(data2 ?? [])];
    const seen = new Set<string>();
    const uniq = merged.filter((r: any) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    const rows = uniq.map((r: any) => {
      const c = r.class;
      const classRow = Array.isArray(c) ? c?.[0] : c;

      return {
        id: r.id,
        lesson_date: r.lesson_date,
        lesson_time: r.lesson_time,
        status: r.status,
        allow_change_override: r.allow_change_override,
        // 변경 페이지에서 필요
        class_id: classRow?.id ?? null,
        teacher_id: classRow?.teacher_id ?? null,
        class_start_date: classRow?.start_date ?? null,
        class_end_date: classRow?.end_date ?? null,
      };
    });

    return NextResponse.json({
      rows,
      debug: {
        profileId,
        studentRowId,
        count: rows.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
