import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function parseDate(s: string) {
  // s: YYYY-MM-DD
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toYmd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function timeToMinutes(t: string) {
  // "HH:mm:ss" or "HH:mm"
  const [hh, mm] = t.split(":").map((x) => Number(x));
  return hh * 60 + mm;
}

function minutesToHHmm(m: number) {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teacherId = url.searchParams.get("teacherId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!teacherId || !from || !to) {
      return NextResponse.json({ error: "teacherId/from/to 누락" }, { status: 400 });
    }

    const fromD = parseDate(from);
    const toD = parseDate(to);
    if (!fromD || !toD || fromD > toD) {
      return NextResponse.json({ error: "날짜 범위 오류" }, { status: 400 });
    }

    // 1) 정규 근무시간
    const { data: avails, error: aErr } = await supabaseServer
      .from("teacher_availabilities")
      .select("weekday,start_time,end_time,slot_minutes,is_active")
      .eq("teacher_id", teacherId)
      .eq("is_active", true);

    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

    // 2) 예외 open 슬롯
    const { data: openSlots, error: oErr } = await supabaseServer
      .from("teacher_open_slots")
      .select("slot_date,slot_time,minutes,is_open")
      .eq("teacher_id", teacherId)
      .gte("slot_date", from)
      .lte("slot_date", to)
      .eq("is_open", true);

    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

    // 3) 이미 잡힌 레슨(막기)
    // - lessons에서 teacherId를 바로 필터링하기 어렵다면 classes.teacher_id 기반으로 classIds를 뽑아야 함
    const { data: classes, error: cErr } = await supabaseServer
      .from("classes")
      .select("id")
      .eq("teacher_id", teacherId);

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    const classIds = (classes ?? []).map((c: any) => c.id);
    let blockedSet = new Set<string>();

    if (classIds.length > 0) {
      const { data: lessons, error: lErr } = await supabaseServer
        .from("lessons")
        .select("lesson_date,lesson_time")
        .in("class_id", classIds)
        .gte("lesson_date", from)
        .lte("lesson_date", to);

      if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

      (lessons ?? []).forEach((l: any) => {
        // lesson_time이 "HH:mm:ss"일 수 있어 HH:mm로 통일
        const hhmm = String(l.lesson_time).slice(0, 5);
        blockedSet.add(`${l.lesson_date} ${hhmm}`);
      });
    }

    // 4) 정규 슬롯 생성
    const slots: { date: string; time: string; source: "regular" | "open" }[] = [];

    // avail을 weekday별로 빠르게 찾기
    const byWeekday = new Map<number, any[]>();
    (avails ?? []).forEach((a: any) => {
      const list = byWeekday.get(a.weekday) ?? [];
      list.push(a);
      byWeekday.set(a.weekday, list);
    });

    const cursor = new Date(fromD);
    while (cursor <= toD) {
      const ymd = toYmd(cursor);
      const wd = cursor.getDay(); // 0~6

      const dayAvails = byWeekday.get(wd) ?? [];
      for (const a of dayAvails) {
        const startM = timeToMinutes(String(a.start_time).slice(0, 5));
        const endM = timeToMinutes(String(a.end_time).slice(0, 5));
        const step = Number(a.slot_minutes) || 60;

        for (let m = startM; m + step <= endM; m += step) {
          const hhmm = minutesToHHmm(m);
          const key = `${ymd} ${hhmm}`;
          if (!blockedSet.has(key)) {
            slots.push({ date: ymd, time: hhmm, source: "regular" });
          }
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    // 5) open 슬롯 추가(정규와 겹쳐도 한 번만)
    const exists = new Set(slots.map((s) => `${s.date} ${s.time}`));
    (openSlots ?? []).forEach((o: any) => {
      const date = String(o.slot_date);
      const time = String(o.slot_time).slice(0, 5);
      const key = `${date} ${time}`;
      if (blockedSet.has(key)) return;
      if (exists.has(key)) return;
      slots.push({ date, time, source: "open" });
    });

    // 정렬
    slots.sort((a, b) => {
      const ak = `${a.date} ${a.time}`;
      const bk = `${b.date} ${b.time}`;
      return ak.localeCompare(bk);
    });

    return NextResponse.json({ rows: slots });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
