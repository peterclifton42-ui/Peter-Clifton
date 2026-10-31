import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "../earnings";

// On-demand news for one institution: Claude searches the web and records what a
// seller would care about through the save_news tool. Writes use the secret-key
// client; the news_items insert trigger alerts the institution's followers.

const MODEL = "claude-opus-5-5";
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, perSearch: 0.01 };
export const NEWS_COOLDOWN_HOURS = 3;

const SAVE_NEWS: Anthropic.Beta.BetaTool = {
  name: "save_news",
  description: "Record the news items you found. Call it once, at the end, with every item worth keeping (an empty list if nothing qualifies).",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            published_on: { type: "string", description: "YYYY-MM-DD, the article's own date" },
            headline: { type: "string", description: "Headline as published" },
            summary: { type: "string", description: "One plain sentence on why it matters to a Curinos seller" },
            source_name: { type: "string", description: "Publisher" },
            url: { type: "string", description: "The article URL exactly as found" },
            tag: { type: "string", enum: ["earnings", "strategy", "digital", "partnership", "risk"], description: "What kind of news it is" },
            sales_angle: { type: "string", description: "One sentence on how a Curinos seller could use it in a conversation (no product claims beyond the facts)" },
            important: { type: "boolean", description: "True for results, M&A, leadership changes, regulatory or credit-risk issues, ratings actions and major strategy moves; false for routine items (awards, community news, small hires, product promotions)" },
          },
          required: ["published_on", "headline", "summary", "source_name", "url", "tag", "sales_angle", "important"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};

type Item = { published_on: string; headline: string; summary: string; source_name: string; url: string; tag: string; sales_angle: string; important?: boolean };
const TAGS = ["earnings", "strategy", "digital", "partnership", "risk"];

// Why an item can't be saved, or null if it can. Dates may come back with a time
// part; only the day matters.
function rejection(i: Partial<Item>, since: string, today: string): string | null {
  if (typeof i?.headline !== "string" || i.headline.trim().length < 6) return "no headline";
  if (typeof i.url !== "string" || !/^https?:\/\/\S+$/.test(i.url)) return "no usable URL";
  const day = typeof i.published_on === "string" ? i.published_on.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return `unreadable date "${i.published_on}"`;
  if (day > today) return `date ${day} is in the future`;
  if (day < since) return `older than the window (${day})`;
  return null;
}

export async function refreshNews(opts: {
  admin: SupabaseClient; slug: string; name: string; isCreditUnion: boolean; userId: string | null; days?: number;
}) {
  const { admin, slug, name } = opts;
  const today = todayISO();
  const since = addDays(today, -(opts.days ?? 30));
  const { data: run } = await admin.from("news_refreshes")
    .insert({ slug, requested_by: opts.userId }).select("id").single();
  const { data: known } = await admin.from("news_items").select("headline, url").eq("slug", slug);
  const knownUrls = new Set((known ?? []).map((k) => k.url));

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: "user",
    content: `Today is ${today}. Find news about ${name}${opts.isCreditUnion ? " (a US credit union)" : " (a US bank holding company)"} published between ${since} and ${today}.

Search well: try the name with "news", with its ticker, with "announces", and with the current month; company press releases and investor-relations announcements count. Keep at most 6 items a Curinos seller (deposit pricing, analytics and advisory for banks) would care about: results and guidance, M&A, leadership changes, product or digital launches, branch openings or closures, deposit or pricing moves, regulatory actions, analyst rating changes. Skip share-price noise, listicles, and anything not clearly about ${name}.${opts.isCreditUnion ? " Credit unions have members, not customers." : ""}
Only use articles you actually found, with their real URLs and dates. Never invent a headline, date or figure. Already recorded (skip these): ${(known ?? []).slice(0, 40).map((k) => k.headline).join(" | ") || "none"}.
When done, call save_news once with the items.`,
  }];

  let usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 };
  let items: Item[] = [];
  let raw: unknown[] = [];
  const rejected: { headline: unknown; reason: string }[] = [];
  try {
    for (let turn = 0; turn < 6; turn++) {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }, SAVE_NEWS],
        messages,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        ...(process.env.ANTHROPIC_WORKSPACE_ID ? { workspace_id: process.env.ANTHROPIC_WORKSPACE_ID } : {}),
      });
      usage = {
        input: usage.input + res.usage.input_tokens,
        output: usage.output + res.usage.output_tokens,
        cacheRead: usage.cacheRead + (res.usage.cache_read_input_tokens ?? 0),
        cacheWrite: usage.cacheWrite + (res.usage.cache_creation_input_tokens ?? 0),
        searches: usage.searches + (res.usage.server_tool_use?.web_search_requests ?? 0),
      };
      if (res.stop_reason === "refusal") throw new Error("The request was declined.");
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      const save = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "save_news");
      if (save && res.stop_reason !== "max_tokens") {
        raw = (save.input as { items?: unknown[] }).items ?? [];
        for (const r of raw) {
          const i = r as Partial<Item>;
          const why = rejection(i, since, today) ?? (knownUrls.has(i.url!) ? "already saved" : null);
          if (why) rejected.push({ headline: i?.headline, reason: why });
          else items.push({ ...(i as Item), published_on: i.published_on!.slice(0, 10) });
        }
        items = items.slice(0, 6);
        break;
      }
      if (res.stop_reason !== "tool_use") {
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: "Call save_news now with what you found (an empty list is fine)." });
      }
    }

    let added = 0;
    for (const i of items) {
      const { data } = await admin.from("news_items").upsert({
        slug, published_on: i.published_on, headline: i.headline.trim(), summary: i.summary.trim(),
        source_name: i.source_name.trim(), url: i.url,
        tag: TAGS.includes(i.tag) ? i.tag : "strategy", sales_angle: i.sales_angle?.trim() || null,
        importance: i.important ? "high" : "normal",
      }, { onConflict: "slug,headline", ignoreDuplicates: true }).select("id");
      added += data?.length ?? 0;
    }
    const cost = cost$(usage);
    await admin.from("news_refreshes").update({
      status: "done", finished_at: new Date().toISOString(), items_found: raw.length, items_added: added,
      searches: usage.searches, cost_usd: cost, raw_items: raw, rejected,
    }).eq("id", run?.id);
    return { ok: true as const, added, found: raw.length, rejected: rejected.length, searches: usage.searches };
  } catch (e) {
    const message = e instanceof Anthropic.APIError ? `Claude API error ${e.status ?? ""}: ${(e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message}` : e instanceof Error ? e.message : String(e);
    await admin.from("news_refreshes").update({
      status: "failed", finished_at: new Date().toISOString(), error: message.slice(0, 500), searches: usage.searches, cost_usd: cost$(usage),
    }).eq("id", run?.id);
    return { ok: false as const, error: message };
  }
}

function cost$(u: { input: number; output: number; cacheRead: number; cacheWrite: number; searches: number }) {
  return Number(((u.input * PRICE.input + u.output * PRICE.output + u.cacheRead * PRICE.cacheRead + u.cacheWrite * PRICE.cacheWrite) / 1e6 + u.searches * PRICE.perSearch).toFixed(5));
}
