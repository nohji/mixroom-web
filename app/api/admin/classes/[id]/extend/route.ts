import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.status }
      );
    }

    const { id } = await ctx.params;
    const classId = id;

    const body = await req.json().catch(() => ({}));
    const days = Number(body?.days ?? 7);

    if (!days || days <= 0) {
      return NextResponse.json({ error: "INVALID_DAYS" }, { status: 400 });
    }

    // voucher 조회
    const { data: voucher, error: vErr } = await supabaseServer
      .from("practice_vouchers")
      .select("id, valid_from, practice_open_from")
      .eq("class_id", classId)
      .single();

    if (vErr || !voucher) {
      return NextResponse.json(
        { error: "VOUCHER_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (!voucher.valid_from) {
      return NextResponse.json(
        { error: "VALID_FROM_REQUIRED" },
        { status: 400 }
      );
    }

    // 기준 날짜:
    // 1) 이미 practice_open_from 있으면 그 날짜 기준으로 더 앞으로 당김
    // 2) 없으면 valid_from 기준으로 앞으로 당김
    const baseDate = voucher.practice_open_from
      ? new Date(voucher.practice_open_from)
      : new Date(voucher.valid_from);

    const newPracticeOpenFrom = new Date(baseDate);
    newPracticeOpenFrom.setDate(newPracticeOpenFrom.getDate() - days);

    const { error: uErr } = await supabaseServer
      .from("practice_vouchers")
      .update({
        practice_open_from: ymd(newPracticeOpenFrom),
      })
      .eq("id", voucher.id);

    if (uErr) {
      return NextResponse.json(
        { error: uErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      class_id: classId,
      opened_days_before: days,
      valid_from: voucher.valid_from,
      prev_practice_open_from: voucher.practice_open_from,
      new_practice_open_from: ymd(newPracticeOpenFrom),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}