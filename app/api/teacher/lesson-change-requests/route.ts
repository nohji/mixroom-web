import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function pickOne<T>(x: any): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] as T) : (x as T);
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // role=teacher 체크
    const { data: profile, error: pErr } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (pErr || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    if (profile.role !== "teacher") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const teacherId = user.id;

    // teacher가 맡은 class id 목록
    const { data: classes, error: cErr } = await supabaseServer
      .from("classes")
      .select("id, student_id")
      .eq("teacher_id", teacherId);

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    const classIds = (classes ?? []).map((c: any) => c.id).filter(Boolean);
    if (classIds.length === 0) return NextResponse.json({ rows: [] });

    // pending 요청 전부 가져오되, lesson join 포함
    const { data: reqs, error: rErr } = await supabaseServer
      .from("lesson_change_requests")
      .select(`
        id,
        created_at,
        status,
        student_id,
        lesson_id,
        from_date,
        from_time,
        to_date,
        to_time,
        lesson:lessons!inner (
          id,
          class_id,
          lesson_date,
          lesson_time
        )
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    // ✅ 핵심: lesson이 배열/객체 둘 다 대응
    const filtered = (reqs ?? []).filter((r: any) => {
      const lesson = pickOne<{ class_id: string }>(r.lesson);
      const classId = lesson?.class_id ?? null;
      return classId ? classIds.includes(classId) : false;
    });

    // student_name 붙이기 (profiles)
    const studentIds = Array.from(
      new Set(filtered.map((r: any) => r.student_id).filter(Boolean))
    ) as string[];

    const nameMap = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: profs, error: profErr } = await supabaseServer
        .from("profiles")
        .select("id, name")
        .in("id", studentIds);

      if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

      (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.name ?? "알 수 없음"));
    }

    const rows = filtered.map((r: any) => ({
      ...r,
      // 프론트에서 lesson_date 등 쓰기 쉽게 lesson도 객체로 정규화해줌
      lesson: pickOne(r.lesson),
      student_name: nameMap.get(r.student_id) ?? "알 수 없음",
    }));

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
