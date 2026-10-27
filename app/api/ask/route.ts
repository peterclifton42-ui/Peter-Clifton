import { NextResponse, type NextRequest } from "next/server";
import { MODEL, askConfigured, runAsk, type AskContext, type AskEvent, type AskTurn } from "@/lib/ask/agent";
import { MAX_COMPARE } from "@/lib/metrics";
import { productBySlug } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";

// The Ask assistant. Streams newline-delimited JSON events (status, text, done,
// error) and logs every question to ask_log for the daily limit and usage.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DAILY_LIMIT = Number(process.env.ASK_DAILY_LIMIT) || 40;
const MAX_TURNS = 20;
const MAX_CHARS = 4000;

export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data: profile } = await db.from("profiles").select("role, full_name").eq("id", userId).single();
  if (!profile || profile.role === "pending") return NextResponse.json({ error: "Your account doesn't have access yet." }, { status: 403 });
  if (!askConfigured()) return NextResponse.json({ error: "The assistant isn't switched on yet: ANTHROPIC_API_KEY is not set in Vercel." }, { status: 503 });

  const body = await request.json().catch(() => null) as { messages?: AskTurn[]; context?: { kind?: string; slug?: string } } | null;
  const history = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!history.length || history[history.length - 1].role !== "user") return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  while (history[0]?.role !== "user") history.shift();

  let context: AskContext = null;
  if (body?.context?.kind === "bank" && body.context.slug) {
    const { data } = await db.from("institutions").select("slug, name").eq("slug", body.context.slug).maybeSingle();
    if (data) context = { kind: "bank", slug: data.slug, name: data.name };
  } else if (body?.context?.kind === "compare" && body.context.slug) {
    const ids = [...new Set(body.context.slug.split(","))].slice(0, MAX_COMPARE);
    const { data } = await db.from("institutions").select("slug, name").in("slug", ids);
    const names = new Map((data ?? []).map((i) => [i.slug as string, i.name as string]));
    const found = ids.filter((s) => names.has(s));
    if (found.length) context = { kind: "compare", slug: found.join(","), name: found.map((s) => `${names.get(s)} (${s})`).join(", ") };
  } else if (body?.context?.kind === "product" && body.context.slug) {
    const p = productBySlug(body.context.slug);
    if (p) context = { kind: "product", slug: p.slug, name: p.name };
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("ask_log").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json({ error: `You've reached the limit of ${DAILY_LIMIT} questions in 24 hours. It resets on a rolling basis.` }, { status: 429 });
  }

  const question = history[history.length - 1].content;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AskEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // The browser went away; request.signal stops the run, which is still logged.
        }
      };
      const result = await runAsk({ db, userId, userName: profile.full_name, history, context, emit, signal: request.signal });
      const { data: logged } = await db.from("ask_log").insert({
        user_id: userId, context: context ? `${context.kind}:${context.slug}` : null, question,
        answer: result.answer || null, model: MODEL, tools_used: result.tools,
        input_tokens: result.inputTokens, output_tokens: result.outputTokens, cache_read_tokens: result.cacheReadTokens,
        cost_usd: Number(result.costUsd.toFixed(5)), status: result.status, error: result.error ?? null,
      }).select("id").single();
      if (result.status === "error") emit({ type: "error", message: result.error ?? "Something went wrong." });
      emit({ type: "done", logId: logged?.id ?? null });
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
