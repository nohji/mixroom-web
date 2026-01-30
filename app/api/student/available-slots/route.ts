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

function toMin(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}
function toHHMM(min: number) {
  const hh = String(Math.floor(min / 60)).padStart(2, "0");
  const mm = String(min % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function weekdayOf(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).getDay(); // 0~6
}
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(req: Request) {
  try {
    const auth = await requireStudent(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(req.url);
    const teacherId = url.searchParams.get("teacherId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!teacherId || !from || !to) {
      return NextResponse.json({ error: "teacherId/from/to 누락" }, { status: 400 });
    }

    // ✅ 오늘로 변경 금지 → 슬롯도 기본적으로 내일부터만 주는 게 편함
    const minDate = addDays(todayStr(), 1);
    const from2 = from < minDate ? minDate : from;

    // 1) 강사 근무시간(weekly rules)
    const { data: avs, error: avErr } = await supabaseServer
      .from("teacher_availabilities")
      .select("weekday, start_time, end_time, slot_minutes, is_active")
      .eq("teacher_id", teacherId)
      .eq("is_active", true);

    if (avErr) return NextResponse.json({ error: avErr.message }, { status: 500 });

    // 2) 이미 잡힌 레슨(해당 강사)
    const { data: busyLessons, error: busyErr } = await supabaseServer
      .from("lessons")
      .select(
        `
        lesson_date,
        lesson_time,
        class:classes!inner ( teacher_id )
      `
      )
      .eq("class.teacher_id", teacherId)
      .gte("lesson_date", from2)
      .lte("lesson_date", to);

    if (busyErr) return NextResponse.json({ error: busyErr.message }, { status: 500 });

    const busySet = new Set<string>();
    (busyLessons ?? []).forEach((r: any) => {
      const d = r.lesson_date;
      const t = r.lesson_time;
      if (d && t) busySet.add(`${d} ${t}`);
    });

    // 3) from~to 날짜를 돌면서 weekly rule로 슬롯 생성
    const days: string[] = [];
    for (let cur = from2; cur <= to; cur = addDays(cur, 1)) days.push(cur);

    const slots: { date: string; time: string }[] = [];

    for (const date of days) {
      const wd = weekdayOf(date);
      const matches = (avs ?? []).filter((a: any) => a.weekday === wd);

      for (const a of matches) {
        const step = Number(a.slot_minutes ?? 60); // 30/60
        const start = toMin(a.start_time);
        const end = toMin(a.end_time);

        for (let m = start; m + step <= end; m += step) {
          const time = toHHMM(m);
          const key = `${date} ${time}`;

          // 이미 레슨이 잡힌 시간은 제외
          if (busySet.has(key)) continue;

          slots.push({ date, time });
        }
      }
    }

    return NextResponse.json({ rows: slots });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
