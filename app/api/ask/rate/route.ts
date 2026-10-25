import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 👍 / 👎 on an answer (and an optional note on what was wrong).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { id?: number; rating?: number; comment?: string } | null;
  if (!body?.id || (body.rating !== 1 && body.rating !== -1)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const db = await createClient();
  const { error } = await db.from("ask_log")
    .update({ rating: body.rating, comment: body.comment?.slice(0, 1000) || null })
    .eq("id", body.id);
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}
