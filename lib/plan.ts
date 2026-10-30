import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL } from "./ask/agent";
import { EVENT_COLUMNS as CAL_COLUMNS, todayISO } from "./earnings";
import { productBySlug, productFor, statusLabel, type CatalogueProduct } from "./products";
import { STATUSES, WHITESPACE_COLUMNS, formatQuarter, formatUsd, quarterOf, type WhitespaceRow } from "./whitespace";

// Engagement plans: a one-page, AI-written plan for one pursuit (institution x
// product), built from that bank's dashboard, news, calendar and the account
// team's whitespace notes. One call, no tools: everything goes in the prompt.

export const PLAN_DAILY_LIMIT = Number(process.env.PLAN_DAILY_LIMIT) || 20;
const PRICE = { input: 4, output: 20 }; // Opus per million tokens
const MAX_CONTEXT = 90_000; // characters of research

// The dashboard sections a plan draws on.
const SECTIONS = [
  "meta", "basic", "metrics", "finOverview", "healthRating", "strategyPillars", "swot", "curinosAngle",
  "salesTiming", "salesPlaybook", "contacts", "decisionIntelligence", "capabilityGaps", "techPlatforms",
  "productSequencing", "products",
] as const;

const SYSTEM = `You write engagement plans for Curinos sellers. Curinos sells data, analytics, optimisation software and advisory to US banks and credit unions. You get one institution's research dashboard, recent news, results calendar, the account team's whitespace notes and the Curinos catalogue entry for one product. Write the plan for selling that product to that institution.

Format (markdown, about 600-800 words, no preamble, start with the first heading):
## Objective
One or two sentences: what we want to close, by when (the target quarter), and the value if known.
## Why now
3-4 bullets, each a specific fact from the research (a figure, a strategic priority, a news item or a results date) and why it makes this product timely. Say how current each fact is when it matters.
## Who to engage
A short table: Name | Role | Angle for them. Use only named contacts from the research; if there are none, name the roles to find and say so.
## Plan to the target quarter
A dated, week-by-week (or fortnight-by-fortnight) sequence from today to the end of the target quarter: the meeting or action, who, and the goal of each step. Work around results dates in the calendar.
## Opening talk track
Two or three sentences the seller can say on the first call.
## Likely objections
2-3 objections with short answers.
## Proof points
Only proof points and figures that appear in the catalogue entry or research; if none, say none are on file.
## Next three actions
A numbered list of the three things to do this week.

Rules:
- Use only facts in the material provided. Never invent names, figures, dates, quotes or proof points.
- Curinos One Commit, Conserve and Calibrate are roadmap: never present them as available. Profitability Optimizer, Lenders Optimizer and Commercial Digital Analyzer are unlisted: say availability must be confirmed with Product Marketing.
- Credit unions have members, not customers; avoid "margin extraction" and "cross-sell" for them.
- If the research rates this product low or rules it out, say so plainly under Objective and plan a discovery conversation instead of a pitch.`;

export type PlanInput = { system: string; prompt: string; product: CatalogueProduct; bankName: string };

// Gathers everything the plan needs. Returns an error message when the pursuit can't be planned.
export async function planInput(db: SupabaseClient, slug: string, productSlug: string): Promise<PlanInput | string> {
  const { data: inst } = await db.from("institutions").select("slug, name, category, assets_b, current_snapshot_id").eq("slug", slug).maybeSingle();
  if (!inst?.current_snapshot_id) return "Unknown institution.";
  const [{ data: snap }, { data: ws }, { data: news }, { data: cal }] = await Promise.all([
    db.from("snapshots").select(`loaded_at, ${SECTIONS.map((s) => `${s}:data->${s}`).join(", ")}`).eq("id", inst.current_snapshot_id).single(),
    db.from("whitespace").select(WHITESPACE_COLUMNS).eq("slug", slug),
    db.from("news_items").select("published_on, headline, summary").eq("slug", slug).order("published_on", { ascending: false }).limit(8),
    db.from("earnings_events").select(CAL_COLUMNS).eq("slug", slug).gte("event_date", todayISO()).order("event_date").limit(3),
  ]);
  const dash = (snap ?? {}) as Record<string, unknown>;
  const rows = (ws ?? []) as WhitespaceRow[];
  const row = rows.find((r) => r.product_slug === productSlug);
  const products = Array.isArray(dash.products) ? (dash.products as Record<string, unknown>[]) : [];
  const card = products.find((p) => productFor(String(p.name ?? ""))?.slug === productSlug);
  const product = productBySlug(productSlug);
  if (!product) return "Unknown product.";

  // The product's own card in full; the others in brief (they matter for sequencing).
  const { scoring: _s, ...cardText } = (card ?? {}) as Record<string, unknown>;
  const research: Record<string, unknown> = { researched_at: dash.loaded_at };
  for (const s of SECTIONS) {
    if (s === "products") research.other_products = products.filter((p) => p !== card).map((p) => ({ name: p.name, priority: p.pri, fit: p.fit }));
    else research[s] = dash[s];
  }
  const researchText = JSON.stringify(research);
  const today = new Date();
  const quarter = row?.target_quarter ?? quarterOf(today);
  const account = rows.filter((r) => r.product_slug !== productSlug)
    .map((r) => `${productBySlug(r.product_slug)?.name ?? r.product_slug}: ${STATUSES[r.status].short}${r.note ? ` (${r.note})` : ""}`);

  const prompt = [
    `Today is ${todayISO()}. Write the engagement plan for **${product.name}** at **${inst.name}** (${inst.category === "credit_union" ? "credit union" : "bank"}, $${inst.assets_b}B assets).`,
    `Pursuit: ${row ? `${STATUSES[row.status].label}` : "not yet in whitespace"}; target quarter ${formatQuarter(quarter)}${row?.acv_usd ? `; value ${formatUsd(row.acv_usd)} ACV` : ""}${row?.note ? `; team note: "${row.note}"` : ""}.`,
    account.length ? `Other products at this account (whitespace): ${account.join("; ")}.` : "",
    `<catalogue product="${product.name}" status="${statusLabel(product)?.label ?? "available"}">\n${product.body.slice(0, 12_000)}\n</catalogue>`,
    `<product_card>\n${card ? JSON.stringify(cardText) : "The research has no card for this product."}\n</product_card>`,
    `<calendar>\n${JSON.stringify(cal ?? [])}\n</calendar>`,
    `<news>\n${JSON.stringify(news ?? [])}\n</news>`,
    `<research>\n${researchText.length > MAX_CONTEXT ? `${researchText.slice(0, MAX_CONTEXT)}…` : researchText}\n</research>`,
  ].filter(Boolean).join("\n\n");
  return { system: SYSTEM, prompt, product, bankName: inst.name };
}

export type PlanResult = { text: string; inputTokens: number; outputTokens: number; costUsd: number; error?: string };

// Streams the plan; onText gets each piece as it arrives.
export async function writePlan(input: PlanInput, onText: (t: string) => void, signal?: AbortSignal): Promise<PlanResult> {
  const out: PlanResult = { text: "", inputTokens: 0, outputTokens: 0, costUsd: 0 };
  try {
    const stream = new Anthropic().beta.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { workspace_id: process.env.ANTHROPIC_WORKSPACE_ID } : {}),
    }, { signal });
    stream.on("text", (t) => { out.text += t; onText(t); });
    const message = await stream.finalMessage();
    out.inputTokens = message.usage.input_tokens;
    out.outputTokens = message.usage.output_tokens;
    if (message.stop_reason === "refusal") out.error = "The plan couldn't be written for this pursuit.";
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) out.error = "The Claude API key was rejected. Check ANTHROPIC_API_KEY in Vercel.";
    else if (e instanceof Anthropic.RateLimitError) out.error = "The assistant is busy right now. Try again in a minute.";
    else out.error = e instanceof Error ? e.message : String(e);
  }
  out.costUsd = (out.inputTokens * PRICE.input + out.outputTokens * PRICE.output) / 1e6;
  return out;
}
