import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * ✅ KST 기준 Date 만들기 유틸
 * - DB가 YYYY-MM-DD / HH:mm 형태라 "KST(+09:00)"로 해석해서 비교
 */
function toKstDate(ymd: string, hm: string) {
  // 예: "2026-01-20T19:00:00+09:00"
  return new Date(`${ymd}T${hm}:00+09:00`);
}

function todayStrKst() {
  const now = new Date();
  // KST 날짜 문자열 만들기
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

/**
 * ✅ classes.student_id가 profiles.id일 수도 있고 students.id일 수도 있어서
 * - students 테이블에서 "profile_id = auth.userId" 형태로 매핑이 있으면 studentRowId를 가져옴
 * - 없다면 null로 두고, 비교는 (auth.userId || studentRowId) 둘 다 허용
 *
 * ⚠️ 만약 students 테이블에 profile_id 컬럼이 없다면:
 * - 아래 select("id")의 eq("profile_id", ...) 부분에서 에러가 날 수 있음
 * - 그 경우 너 DB 구조에 맞춰 컬럼명을 알려줘. (예: user_id, profile_id 등)
 */
async function getStudentRowIdByProfileId(profileId: string) {
  const { data, error } = await supabaseServer
    .from("students")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();

  // students 테이블이 없거나 컬럼이 없으면 error가 뜰 수 있음 → 그냥 null 처리
  if (error) return null;
  return data?.id ?? null;
}

function toMin(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

export async function POST(req: Request) {
  try {
    const auth = await requireStudent(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const lessonId = body.lessonId as string | undefined;
    const to_date = body.to_date as string | undefined; // YYYY-MM-DD
    const to_time = body.to_time as string | undefined; // HH:mm

    if (!lessonId || !to_date || !to_time) {
      return NextResponse.json({ error: "lessonId/to_date/to_time 누락" }, { status: 400 });
    }

    // ✅ 오늘/과거로 변경 금지 (KST 기준)
    if (to_date <= todayStrKst()) {
      return NextResponse.json({ error: "오늘/과거 날짜로는 변경 불가" }, { status: 400 });
    }

    /**
     * 1) lesson + class 정보 가져오기
     * - 여기서 class의 student_id/teacher_id + (start/end_date)까지 같이 가져오자
     */
    const { data: lesson, error: lErr } = await supabaseServer
      .from("lessons")
      .select(
        `
        id,
        lesson_date,
        lesson_time,
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
      .eq("id", lessonId)
      .single();

    if (lErr || !lesson) return NextResponse.json({ error: "레슨 없음" }, { status: 404 });

    const classRow = Array.isArray((lesson as any).class)
      ? (lesson as any).class?.[0]
      : (lesson as any).class;

    if (!classRow) {
      return NextResponse.json({ error: "레슨의 class 정보 없음" }, { status: 500 });
    }

    /**
     * 1-1) ✅ "내 레슨인지" 판별 (ID 불일치 대응)
     */
    const studentRowId = await getStudentRowIdByProfileId(auth.userId);

    const classStudentId = classRow.student_id as string | null;

    const isMine =
      classStudentId === auth.userId ||
      (!!studentRowId && classStudentId === studentRowId);

    if (!isMine) {
      return NextResponse.json(
        {
          error: "내 레슨이 아님",
          debug: {
            authUserId: auth.userId,
            studentRowId,
            classStudentId,
          },
        },
        { status: 403 }
      );
    }

    const teacherId = classRow.teacher_id as string | null;
    if (!teacherId) {
      return NextResponse.json({ error: "담당 강사 정보 없음" }, { status: 400 });
    }

    /**
     * 1-2) ✅ 수강권 기간 안인지 체크 (start_date~end_date)
     */
    const startDate = classRow.start_date as string | null;
    const endDate = classRow.end_date as string | null;

    if (startDate && to_date < startDate) {
      return NextResponse.json({ error: "수강권 기간 시작 이전 날짜로는 변경 불가" }, { status: 400 });
    }
    if (endDate && to_date > endDate) {
      return NextResponse.json({ error: "수강권 기간 종료 이후 날짜로는 변경 불가" }, { status: 400 });
    }

    /**
     * 1-3) ✅ D-1 23:59 룰 (단, allow_change_override=true면 예외 허용)
     */
    const allowOverride = !!(lesson as any).allow_change_override;
    if (!allowOverride) {
      // lesson_date 기준 전날 23:59:59 (KST)
      const lessonStartKst = toKstDate((lesson as any).lesson_date, "00:00");
      const cutoff = new Date(lessonStartKst.getTime() - 1000); // 전날 23:59:59

      const now = new Date(); // 현재
      // now를 KST로 비교하려고 +09로 만든 기준과 비교해도 JS Date는 UTC epoch라 문제 없음.
      if (now.getTime() > cutoff.getTime()) {
        return NextResponse.json(
          { error: "레슨 전날 23:59 이후에는 변경 요청 불가 (예외허용 OFF)" },
          { status: 400 }
        );
      }
    }

    /**
     * 2) 강사 가능한 슬롯인지 확인 (teacher_availabilities)
     */
    const { data: slots, error: sErr } = await supabaseServer
      .from("teacher_availabilities")
      .select("weekday, start_time, end_time, slot_minutes, is_active")
      .eq("teacher_id", teacherId)
      .eq("is_active", true);

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    const wd = new Date(`${to_date}T00:00:00`).getDay();
    const toM = toMin(to_time);

    const okSlot = (slots ?? []).some((a: any) => {
      if (a.weekday !== wd) return false;
      const step = Number(a.slot_minutes ?? 60);
      const s = toMin(a.start_time);
      const e = toMin(a.end_time);
      // 수업 60분 기준으로 막으려면 여기서 60 사용해도 됨
      if (!(toM >= s && toM + step <= e)) return false;
      return ((toM - s) % step) === 0;
    });

    if (!okSlot) {
      return NextResponse.json({ error: "강사 근무시간 슬롯이 아닙니다." }, { status: 400 });
    }

    /**
     * 3) 강사 레슨 충돌 체크
     * - lessons(lesson_date,lesson_time) + classes.teacher_id 가 같은게 있으면 불가
     */
    const { data: conflict, error: cErr } = await supabaseServer
      .from("lessons")
      .select(`id, class:classes!inner(teacher_id)`)
      .eq("lesson_date", to_date)
      .eq("lesson_time", to_time)
      .eq("class.teacher_id", teacherId)
      .limit(1);

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    if ((conflict ?? []).length > 0) {
      return NextResponse.json({ error: "해당 시간에 이미 레슨이 있습니다." }, { status: 400 });
    }

    /**
     * 4) 변경요청 insert
     */
    const { error: insErr } = await supabaseServer.from("lesson_change_requests").insert({
      lesson_id: lessonId,
      student_id: auth.userId, // ✅ 요청자는 profiles.id로 저장 (권장)
      from_date: (lesson as any).lesson_date,
      from_time: (lesson as any).lesson_time,
      to_date,
      to_time,
      status: "pending",
    });

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
