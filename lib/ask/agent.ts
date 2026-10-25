import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "../earnings";
import { TOOLS, runTool, toolLabel } from "./tools";

export const MODEL = "claude-opus-5-5";
const MAX_TURNS = 10;

// Opus 5.5 list prices per million tokens: input, output, cache write, cache read.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };

export function askConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You are the research assistant inside Bank Intelligence, an internal app for Curinos sellers. Curinos sells data, analytics, optimisation software and advisory to US banks and credit unions. The app holds a research dashboard for each of about 58 institutions, weekly news, an earnings calendar, official FDIC/NCUA call report figures, cross-bank insights and the Curinos product catalogue. Your tools read all of it.

How to answer:
- Use the tools for every factual claim. Answer only from what they return; if the app does not hold something, say so plainly and suggest where the seller could look. Never invent figures, names, dates or quotes.
- Start with find_institutions when you need slugs. For questions across many banks, prefer scan_dashboards or get_market_insights over reading dashboards one by one.
- Link your sources inline with markdown: bank pages as [Name](/banks/<slug>), products as [Product](/products/<slug>), comparisons as [compare](/compare?ids=a,b), insights as [Insights](/insights), and news or filings by their own URL. Say how current a fact is when it matters (the quarter, the research date or the news date).
- Write for a seller preparing a call: lead with the answer, then the evidence, in short paragraphs or bullets. Keep it under about 250 words unless asked for more. Use tables only for side-by-side numbers.
- Dashboard metric cards can define figures differently from bank to bank; for like-for-like numbers use get_official_metrics and say they are call report figures (which lag earnings releases by about a month).
- Named contacts and executives come from the dashboards and may be shared with the seller.

Curinos product rules (apply them even if a dashboard says otherwise):
- Curinos One Commit, Conserve and Calibrate are roadmap ("coming soon"): never present them as available.
- Profitability Optimizer, Lenders Optimizer and Commercial Digital Analyzer are unlisted: say availability must be confirmed with Product Marketing.
- eBenchmarkers – Banking is UK-only and never fits a US institution. Amplero and Treasury Strategies are retired.
- Credit unions have members, not customers; avoid "margin extraction" and "cross-sell" for them.
- Only quote proof points and figures that appear in the tool results.`;

export type AskTurn = { role: "user" | "assistant"; content: string };
export type AskContext = { kind: "bank" | "product"; slug: string; name: string } | null;
export type AskEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "done"; logId: number | null }
  | { type: "error"; message: string };

export type AskResult = {
  answer: string; tools: string[]; status: "ok" | "error" | "refused";
  error?: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; costUsd: number;
};

export async function runAsk(opts: {
  db: SupabaseClient; userId: string; userName: string | null; history: AskTurn[]; context: AskContext;
  emit: (e: AskEvent) => void; signal?: AbortSignal;
}): Promise<AskResult> {
  const client = new Anthropic();
  const ctx = { db: opts.db, userId: opts.userId };

  // What the seller is looking at, and today's date, ride on the latest question so
  // the system prompt and tool list stay identical (and cached) across requests.
  const where = opts.context
    ? `The user is on the ${opts.context.kind} page for ${opts.context.name} (slug ${opts.context.slug}); "this bank" or "this product" means it.`
    : "The user is on the Ask page (whole market).";
  const preface = `[Today is ${todayISO()}. ${opts.userName ? `The user is ${opts.userName}. ` : ""}${where}]`;
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.history.map((t, i) => ({
    role: t.role,
    content: i === opts.history.length - 1 ? `${preface}\n\n${t.content}` : t.content,
  }));

  const result: AskResult = { answer: "", tools: [], status: "ok", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 };
  let cacheWrite = 0;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        system: SYSTEM,
        tools: TOOLS,
        messages,
        cache_control: { type: "ephemeral" },
        output_config: { effort: "medium" },
        // If a safety classifier declines, the API retries on a suitable model itself.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      }, { signal: opts.signal });
      stream.on("text", (delta) => {
        result.answer += delta;
        opts.emit({ type: "text", text: delta });
      });
      const message = await stream.finalMessage();

      result.inputTokens += message.usage.input_tokens;
      result.outputTokens += message.usage.output_tokens;
      result.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
      cacheWrite += message.usage.cache_creation_input_tokens ?? 0;

      if (message.stop_reason === "refusal") {
        result.status = "refused";
        const note = "\n\nI can't help with that one. Try rephrasing the question around the banks, products or market data in the app.";
        result.answer += note;
        opts.emit({ type: "text", text: note });
        break;
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || calls.length === 0) break;

      messages.push({ role: "assistant", content: message.content });
      for (const c of calls) {
        result.tools.push(c.name);
        opts.emit({ type: "status", text: toolLabel(c.name, c.input) });
      }
      // Independent lookups run together; all results go back in one message.
      const outputs = await Promise.all(calls.map(async (c) => {
        try {
          return { c, content: await runTool(c.name, c.input, ctx), isError: false };
        } catch (e) {
          return { c, content: `Tool failed: ${e instanceof Error ? e.message : String(e)}`, isError: true };
        }
      }));
      messages.push({
        role: "user",
        content: outputs.map(({ c, content, isError }) => ({ type: "tool_result" as const, tool_use_id: c.id, content, is_error: isError || undefined })),
      });
      if (result.answer && !result.answer.endsWith("\n")) {
        result.answer += "\n\n";
        opts.emit({ type: "text", text: "\n\n" });
      }
      if (turn === MAX_TURNS - 1) {
        const note = "\n\n(I stopped after several lookups. Ask a narrower question for a complete answer.)";
        result.answer += note;
        opts.emit({ type: "text", text: note });
      }
    }
  } catch (e) {
    result.status = "error";
    if (e instanceof Anthropic.AuthenticationError) result.error = "The Claude API key was rejected. Check ANTHROPIC_API_KEY in Vercel.";
    else if (e instanceof Anthropic.RateLimitError) result.error = "The assistant is busy right now. Try again in a minute.";
    else if (e instanceof Anthropic.APIError) result.error = `Claude API error ${e.status ?? ""}: ${e.message}`.trim();
    else result.error = e instanceof Error ? e.message : String(e);
  }

  result.costUsd = (result.inputTokens * PRICE.input + result.outputTokens * PRICE.output
    + cacheWrite * PRICE.cacheWrite + result.cacheReadTokens * PRICE.cacheRead) / 1e6;
  return result;
}
