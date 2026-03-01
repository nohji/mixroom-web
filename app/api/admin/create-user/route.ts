import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

function normalizePhone(input: string) {
  return input.replace(/\D/g, "");
}
function phoneToEmail(phoneDigits: string) {
  return `${phoneDigits}@mixroom.local`;
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await req.json().catch(() => ({}));
    const name = (body.name ?? "") as string;
    const phoneRaw = (body.phone ?? "") as string;
    const role = (body.role ?? "") as "student" | "teacher";
    const password = "0000"; // ✅ 서버에서 고정

    const phone = normalizePhone(phoneRaw);

    if (!name || !phone || !role) {
      return NextResponse.json({ error: "name/phone/role 필수" }, { status: 400 });
    }
    if (phone.length < 10 || phone.length > 11) {
      return NextResponse.json({ error: "휴대폰 번호는 10~11자리" }, { status: 400 });
    }
    if (role !== "student" && role !== "teacher" && role !== "admin") {
      return NextResponse.json({ error: "role은 student/teacher/admin만 가능" }, { status: 400 });
    }
    if (!password || password.length < 4) {
      return NextResponse.json({ error: "비밀번호는 최소 4자리" }, { status: 400 });
    }

    const email = phoneToEmail(phone);

    // 1) Auth 유저 생성 (Service Role)
    const { data, error } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? "Auth 생성 실패" }, { status: 500 });
    }

    // 2) profiles에 insert
    const { error: pErr } = await supabaseServer.from("profiles").insert({
      id: data.user.id,
      role,
      name,
      phone, // profiles에 phone 컬럼 없으면 아래 SQL 추가 파트 참고
      must_change_password: true,
    });

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      userId: data.user.id,
      role,
      phone,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
