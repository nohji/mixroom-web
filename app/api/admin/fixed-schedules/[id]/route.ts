import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  hold_for_renewal?: boolean;
  memo?: string | null;
  room_id?: string | null;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Body;

    const patch: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.hold_for_renewal === "boolean") {
      patch.hold_for_renewal = body.hold_for_renewal;
    }

    if ("memo" in body) {
      patch.memo = body.memo ?? null;
    }

    if ("room_id" in body) {
      const roomId =
        body.room_id && String(body.room_id).trim()
          ? String(body.room_id).trim()
          : null;

      if (roomId) {
        const { data: room, error: roomErr } = await supabaseServer
          .from("practice_rooms")
          .select("id")
          .eq("id", roomId)
          .single();

        if (roomErr || !room) {
          return NextResponse.json({ error: "invalid room_id" }, { status: 400 });
        }
      }

      patch.room_id = roomId;
    }

    const { data, error } = await supabaseServer
      .from("fixed_schedule_slots")
      .update(patch)
      .eq("id", id)
      .select(`
        id,
        student_id,
        teacher_id,
        room_id,
        weekday,
        lesson_time,
        hold_for_renewal,
        memo,
        created_at,
        updated_at,
        student:profiles!fixed_schedule_slots_student_id_fkey (
          id,
          name
        ),
        teacher:profiles!fixed_schedule_slots_teacher_id_fkey (
          id,
          name
        ),
        room:practice_rooms!fixed_schedule_slots_room_id_fkey (
          id,
          name
        )
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { id } = await params;

    const { error } = await supabaseServer
      .from("fixed_schedule_slots")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}