import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { MODEL, askConfigured } from "@/lib/ask/agent";
import { PLAN_DAILY_LIMIT, planInput, writePlan } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

// Writes an engagement plan for one pursuit. Streams the plan as plain text,
// then saves it to engagement_plans (which also counts toward the daily limit).
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).single();
  if (!profile || profile.role === "pending") return NextResponse.json({ error: "Your account doesn't have access yet." }, { status: 403 });
  if (!askConfigured()) return NextResponse.json({ error: "AI isn't switched on yet: ANTHROPIC_API_KEY is not set in Vercel." }, { status: 503 });

  const body = await request.json().catch(() => null) as { slug?: string; product?: string } | null;
  const slug = String(body?.slug ?? "");
  const productSlug = String(body?.product ?? "");
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("engagement_plans").select("id", { count: "exact", head: true }).eq("created_by", userId).gte("created_at", since);
  if ((count ?? 0) >= PLAN_DAILY_LIMIT) {
    return NextResponse.json({ error: `You've written ${PLAN_DAILY_LIMIT} plans in the last 24 hours, the daily limit. Saved plans still open.` }, { status: 429 });
  }
  const input = await planInput(db, slug, productSlug);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (t: string) => {
        try { controller.enqueue(encoder.encode(t)); } catch { /* the browser went away */ }
      };
      const result = await writePlan(input, send, request.signal);
      if (result.error || !result.text.trim()) {
        send(`\n\n[[error]]${result.error ?? "The plan came back empty. Try again."}`);
      } else {
        const { error } = await db.from("engagement_plans").insert({
          slug, product_slug: productSlug, plan: result.text, model: MODEL, created_by: userId,
          input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: Number(result.costUsd.toFixed(5)),
        });
        if (error) send(`\n\n[[error]]The plan was written but couldn't be saved: ${error.message}`);
        revalidatePath("/", "layout");
      }
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
