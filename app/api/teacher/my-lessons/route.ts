import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData, error: userErr } = await supabaseServer.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile, error: pErr } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (pErr || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    if (profile.role !== "teacher") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // 1) teacher classes
    const { data: classes, error: cErr } = await supabaseServer
      .from("classes")
      .select("id, student_id")
      .eq("teacher_id", user.id);

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    const classIds = (classes ?? []).map((c) => c.id);
    if (classIds.length === 0) return NextResponse.json({ rows: [] });

    // 2) lessons
    let q = supabaseServer
      .from("lessons")
      .select("id, class_id, lesson_date, lesson_time, status, allow_change_override, room_id")
      .in("class_id", classIds)
      .order("lesson_date", { ascending: true })
      .order("lesson_time", { ascending: true });

    if (from) q = q.gte("lesson_date", from);
    if (to) q = q.lte("lesson_date", to);

    const { data: lessons, error: lErr } = await q;
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

    // 3) map student names from profiles
    const studentIds = Array.from(new Set((classes ?? []).map((c: any) => c.student_id).filter(Boolean)));

    const studentNameMap = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: students, error: sErr } = await supabaseServer
        .from("profiles") // ✅ 학생도 profiles
        .select("id, name")
        .in("id", studentIds);

      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

      (students ?? []).forEach((s: any) => {
        studentNameMap.set(s.id, s.name ?? "알 수 없음");
      });
    }

    const classStudentIdMap = new Map<string, string>();
    (classes ?? []).forEach((c: any) => classStudentIdMap.set(c.id, c.student_id));

    const rows = (lessons ?? []).map((l: any) => {
      const sid = classStudentIdMap.get(l.class_id);
      return {
        ...l,
        student_name: sid ? studentNameMap.get(sid) ?? "알 수 없음" : "알 수 없음",
      };
    });

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
