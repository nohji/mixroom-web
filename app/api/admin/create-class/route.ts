// /api/admin/room-suggest/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type DeviceType = "controller" | "turntable";

/* ===================== utils ===================== */

function toMin(t: string) {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function isHHMM(v: string) {
  return /^\d{2}:\d{2}$/.test(String(v).slice(0, 5));
}

function weekdayOf(ymd: string) {
  return new Date(`${ymd}T00:00:00`).getDay();
}

/* ===================== handler ===================== */

export async function POST(req: Request) {
  try {
    /* 1) 관리자 권한 체크 */
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    /* 2) body 파싱 + 검증 */
    const body = await req.json().catch(() => ({}));

    const deviceType = (body.deviceType ?? "controller") as DeviceType;
    const lessonDate = body.lessonDate as string | undefined; // YYYY-MM-DD
    const lessonTime = body.lessonTime as string | undefined; // HH:mm
    const teacherId = body.teacherId as string | undefined;

    if (!lessonDate || !lessonTime || !teacherId) {
      return NextResponse.json({ error: "필수 값 누락(lessonDate/lessonTime/teacherId)" }, { status: 400 });
    }
    if (!["controller", "turntable"].includes(deviceType)) {
      return NextResponse.json({ error: "deviceType 오류" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lessonDate)) {
      return NextResponse.json({ error: "lessonDate 형식 오류(YYYY-MM-DD)" }, { status: 400 });
    }
    if (!isHHMM(lessonTime)) {
      return NextResponse.json({ error: "lessonTime 형식 오류(HH:mm)" }, { status: 400 });
    }

    const weekday = weekdayOf(lessonDate);
    const reasons: string[] = [];

    /* 3) teacher_availabilities 확인(경고용/선택) */
    const availDeviceTypes =
      deviceType === "controller"
        ? (["controller", "both"] as const)
        : (["turntable", "both"] as const);

    const { data: avails, error: avErr } = await supabaseServer
      .from("teacher_availabilities")
      .select("start_time, end_time, slot_minutes, is_active, device_type, effective_from, effective_until")
      .eq("teacher_id", teacherId)
      .eq("weekday", weekday)
      .in("device_type", [...availDeviceTypes])
      .eq("is_active", true);

    if (avErr) return NextResponse.json({ error: avErr.message }, { status: 500 });

    // 근무기간/근무시간/슬롯 정렬 체크 (create-class 로직과 동일 계열)
    const m = toMin(lessonTime);
    const teacherWithinAvail = (avails ?? []).some((a: any) => {
      const ef = a.effective_from ? String(a.effective_from) : null;
      const eu = a.effective_until ? String(a.effective_until) : null;
      if (ef && lessonDate < ef) return false;
      if (eu && lessonDate > eu) return false;

      const s = toMin(a.start_time);
      const e = toMin(a.end_time);
      const step = Number(a.slot_minutes ?? 60);

      // 시간 범위 + slot 정렬
      if (!(m >= s && m + step <= e)) return false;
      return ((m - s) % step) === 0;
    });

    if (!teacherWithinAvail) {
      reasons.push("강사 근무시간(availability) 범위 밖이거나 슬롯 정렬이 맞지 않습니다.");
    }

    /* 4) 강사 레슨 충돌 체크 (lessons -> classes join) */
    const { data: teacherClash, error: tErr } = await supabaseServer
      .from("lessons")
      .select(
        `
        id,
        status,
        class:classes!inner ( teacher_id )
      `
      )
      .eq("lesson_date", lessonDate)
      .eq("lesson_time", lessonTime)
      .neq("status", "canceled")
      .eq("class.teacher_id", teacherId)
      .limit(1);

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    const teacherOk = (teacherClash?.length ?? 0) === 0;
    if (!teacherOk) reasons.push("해당 시간에 강사 레슨 충돌이 있습니다.");

    /* 5) 룸 후보(활성 + 기기 허용) */
    const roomFilterCol = deviceType === "controller" ? "allow_controller" : "allow_turntable";
    const { data: rooms, error: rErr } = await supabaseServer
      .from("practice_rooms")
      .select("id, name")
      .eq("is_active", true)
      .eq(roomFilterCol, true)
      .order("name", { ascending: true });

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    if (!rooms || rooms.length === 0) {
      return NextResponse.json(
        {
          teacherOk,
          roomOk: false,
          reasons: [...reasons, "사용 가능한 룸이 없습니다."],
          rooms: [],
        },
        { status: 200 }
      );
    }

    /* 6) 해당 date/time 점유 룸 조회 */
    const { data: busyLessons, error: bErr } = await supabaseServer
      .from("lessons")
      .select("room_id, status")
      .eq("lesson_date", lessonDate)
      .eq("lesson_time", lessonTime)
      .neq("status", "canceled");

    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

    const busyRoomIds = new Set((busyLessons ?? []).map((x: any) => x.room_id).filter(Boolean));

    /* 7) 빈 룸 추천 리스트 */
    const availableRooms = rooms
      .filter((r: any) => !busyRoomIds.has(r.id))
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        reason: "해당 시간대 비어있음",
      }));

    const roomOk = availableRooms.length > 0;
    if (!roomOk) reasons.push("해당 시간에 가능한 룸이 없습니다.");

    return NextResponse.json({
      ok: teacherOk && roomOk && teacherWithinAvail,
      teacherOk,
      roomOk,
      teacherWithinAvail,
      reasons,
      rooms: availableRooms, // 필요하면 slice(0, 3)
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
