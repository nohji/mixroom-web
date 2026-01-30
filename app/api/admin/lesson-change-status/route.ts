import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

function yyyyMMdd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    // 1) ✅ 관리자 권한 체크 (Bearer 토큰 기반)
    const guard = await requireAdmin(req);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = yyyyMMdd(today);
    const tomorrowStr = yyyyMMdd(tomorrow);

    // 2) ✅ service role(supabaseServer)로 전체 요청 조회
    const { data, error } = await supabaseServer
      .from("lesson_change_requests")
      .select(
        `
        id,
        created_at,
        status,
        student_id,
        from_date,
        from_time,
        to_date,
        to_time,
        handled_by_role,
        handled_at,
        admin_checked_at,
        lesson:lessons!inner (
          lesson_date,
          lesson_time,
          class:classes!inner (
            teacher_id
          )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows: any[] = data ?? [];

    // 3) ✅ student_name 붙이기: student_id -> profiles.name
    const studentIds = Array.from(new Set(rows.map((r) => r.student_id).filter(Boolean)));
    const nameMap = new Map<string, string>();

    if (studentIds.length > 0) {
      const { data: profs, error: pErr } = await supabaseServer
        .from("profiles")
        .select("id, name")
        .in("id", studentIds);

      if (pErr) {
        return NextResponse.json({ error: pErr.message }, { status: 500 });
      }

      (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.name ?? "알 수 없음"));
    }

    const rowsWithName = rows.map((r) => ({
      ...r,
      student_name: nameMap.get(r.student_id) ?? "알 수 없음",
    }));

    // 4) ✅ 요약
    const summary = {
      pending: rowsWithName.filter((r: any) => r.status === "pending").length,
      tomorrowPending: rowsWithName.filter((r: any) => {
        const lessonDate = Array.isArray(r.lesson) ? r.lesson?.[0]?.lesson_date : r.lesson?.lesson_date;
        return r.status === "pending" && lessonDate === tomorrowStr;
      }).length,
      handledToday: rowsWithName.filter((r: any) => {
        return typeof r.handled_at === "string" && r.handled_at.startsWith(todayStr);
      }).length,
    };

    return NextResponse.json({ summary, rows: rowsWithName });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
