import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EVENT_COLUMNS, addDays, todayISO } from "../earnings";
import {
  INSIGHT_COLUMNS, angleResults, inScope, objectionResults, parseScope, productDemand, themeResults,
  type InsightInput,
} from "../insights";
import { compareDashboards } from "../changes";
import { METRICS } from "../metrics";
import { PRODUCTS, effectivePriority, productBySlug, productFor, sellerBlocks, statusLabel } from "../products";
import {
  EVENT_COLUMNS as WS_EVENT_COLUMNS, STATUSES, WHITESPACE_COLUMNS, bookOf, describeChange, formatQuarter, lostExpired,
  type WhitespaceEvent, type WhitespaceRow,
} from "../whitespace";

// The assistant's tools: read-only lookups into the app's own data, run with the
// signed-in seller's Supabase client, so row-level security applies to every call.

// Top-level sections of a dashboard (the D object) the assistant may read.
export const SECTIONS = [
  "meta", "basic", "demo", "structure", "metrics", "finOverview", "healthRating", "healthNote",
  "strategy", "strategyIntro", "strategyPillars", "swot", "curinosAngle", "salesTiming", "salesPlaybook",
  "products", "dnrProducts", "productSequencing", "maturity", "maturityProfile", "decisionIntelligence",
  "capabilityGaps", "siloAssessment", "techPlatforms", "businessSegments", "contacts", "peers", "funding",
  "liquidity", "loans", "nimTrend", "news", "sources", "charts",
] as const;
type Section = (typeof SECTIONS)[number];
const DEFAULT_SECTIONS: Section[] = [
  "meta", "basic", "metrics", "finOverview", "healthRating", "swot", "strategyPillars",
  "curinosAngle", "salesTiming", "products",
];

const MAX_RESULT = 60_000; // characters per tool result

function clip(value: unknown, max = MAX_RESULT) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}… [truncated: ask for fewer sections or institutions]` : text;
}

// Product cards without their scoring traces, which are long and internal.
function slimProducts(products: unknown) {
  if (!Array.isArray(products)) return products;
  return products.map((p) => {
    if (!p || typeof p !== "object") return p;
    const { scoring: _scoring, ...rest } = p as Record<string, unknown>;
    return rest;
  });
}

function productSummary(products: unknown) {
  if (!Array.isArray(products)) return products;
  return products.map((p) => {
    const r = (p ?? {}) as Record<string, unknown>;
    return { name: r.name, priority: r.pri, fit: r.fit, why: r.why };
  });
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const bool = (v: unknown) => v === true;
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_institutions",
    description: "List the banks and credit unions in the app (58 institutions), optionally filtered by a name/ticker/HQ search, type, or to the ones the user follows. Returns each one's slug (needed by the other tools), size, opportunity rating, latest quarter, research date, sales theme and whether the user follows it. Call this first whenever you need slugs.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Part of a name, ticker or HQ city/state, e.g. 'Valley', 'TX', 'BECU'." },
        category: { type: "string", enum: ["bank", "credit_union"] },
        followed_only: { type: "boolean", description: "Only institutions the user follows ('my banks')." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_dashboard",
    description: `Read one institution's research dashboard. Without sections you get an overview (key metrics, sales theme, SWOT, strategy pillars, Curinos angle, sales timing, product fit and data maturity). Ask for specific sections for depth. Sections: ${SECTIONS.join(", ")}. 'contacts' holds named executives; 'maturity'/'maturityProfile'/'decisionIntelligence'/'capabilityGaps'/'techPlatforms' cover data and analytics maturity and vendors; 'salesPlaybook' holds the meeting agenda, objections and action plan; 'news' is the dashboard's own news section.`,
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        sections: { type: "array", items: { type: "string", enum: [...SECTIONS] } },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "scan_dashboards",
    description: "Read ONE dashboard section across many institutions at once, for cross-bank questions (e.g. 'which banks have low data maturity', 'who uses nCino', 'who has a CD maturity wall'). Defaults to every institution; narrow with slugs or followed_only. Long sections are shortened per institution.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: "string", enum: [...SECTIONS] },
        slugs: { type: "array", items: { type: "string" } },
        followed_only: { type: "boolean" },
      },
      required: ["section"],
      additionalProperties: false,
    },
  },
  {
    name: "get_news",
    description: "News items the app has collected (weekly job plus on-demand refreshes), kept permanently: headline, why it matters, publisher, date, URL. For one institution it returns the whole history by default, so you can describe how the story has developed. Filter by keyword (e.g. 'merger', 'CEO', 'deposit') or to the user's followed institutions.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        followed_only: { type: "boolean" },
        query: { type: "string", description: "Keyword to match in headline or summary." },
        days: { type: "integer", description: "How far back. Default: all history for one institution, 30 days otherwise." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_calendar",
    description: "Earnings and call-report dates: reported, confirmed (scheduled) or estimated, with source links. Defaults to 30 days back through 90 days ahead.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        followed_only: { type: "boolean" },
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_official_metrics",
    description: "Official quarterly figures from FDIC call reports (banks, all charters of the holding company combined) and NCUA call reports (credit unions): net interest margin, cost of deposits, loan-to-deposit (loan-to-share), 1-year deposit growth, efficiency ratio, ROA, assets, deposits. Consistent across institutions, unlike the dashboards' own metric cards. Up to 9 quarters.",
    input_schema: {
      type: "object",
      properties: {
        slugs: { type: "array", items: { type: "string" }, description: "Institutions to compare (up to 12)." },
        quarters: { type: "integer", description: "How many recent quarters, default 4." },
      },
      required: ["slugs"],
      additionalProperties: false,
    },
  },
  {
    name: "get_dashboard_history",
    description: "Every version of one institution's dashboard (research date, quarter, source) and what changed between consecutive versions: headline metrics, opportunity and health ratings, sales theme, product priorities and new news. Use it for 'what has changed', trends over quarters, or how the pitch has moved.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_market_insights",
    description: "Cross-bank insights computed from every dashboard: market themes (counted as threat, opportunity, strategic priority, urgent now), product demand, the most common lead angles and objection types with rebuttals. Pass a theme key for the quoted evidence behind it. Theme keys: deposit-pricing, margin, cd-repricing, funding-gap, credit, ma, efficiency, digital, commercial, fees, network, rates, regulation, leadership, competitors.",
    input_schema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["all", "banks", "credit-unions", "following"] },
        theme: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_product",
    description: `One Curinos product: catalogue description, availability status, fit signals, and its target list (institutions ranking it priority 1-2 with each dashboard's reason and opening line), plus priority 3, ruled-out institutions and objections with answers. Products: ${PRODUCTS.map((p) => p.slug).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string", description: "Product slug or name." },
        followed_only: { type: "boolean" },
      },
      required: ["product"],
      additionalProperties: false,
    },
  },
  {
    name: "get_whitespace",
    description: "The account teams' whitespace: for each institution and product, a shared status set by sellers - validated whitespace (target quarter, ACV in USD), in play (pipeline, ACV), recently lost pipeline (within 12 months) or renewal (within 24 months, avoid for now), current client, or not a fit; anything else is not reviewed. With no arguments: the user's book (the banks they follow) with totals, by-quarter and by-bank rollups, next steps and changes in the last 30 days. Narrow with slug (one institution) or product (one product across the book, or across all banks with all_banks).",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "One institution's slug." },
        product: { type: "string", description: "Product slug or name." },
        all_banks: { type: "boolean", description: "Include every institution, not only the user's book." },
      },
      additionalProperties: false,
    },
  },
];

type Ctx = { db: SupabaseClient; userId: string };

async function followed(ctx: Ctx) {
  const { data } = await ctx.db.from("favourites").select("slug").eq("user_id", ctx.userId);
  return new Set((data ?? []).map((f) => f.slug as string));
}

async function institutions(ctx: Ctx) {
  const [{ data: inst }, { data: sum }] = await Promise.all([
    ctx.db.from("institutions").select("slug, name, category, type_label, ticker, hq, assets_b, opportunity, latest_quarter, current_snapshot_id").order("name"),
    ctx.db.from("institution_summaries").select("slug, sales_theme, researched_at"),
  ]);
  const extra = new Map((sum ?? []).map((s) => [s.slug as string, s]));
  return (inst ?? []).map((i) => ({ ...i, sales_theme: extra.get(i.slug)?.sales_theme ?? null, researched_at: extra.get(i.slug)?.researched_at ?? null }));
}

const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  find_institutions: (i) => (i.query ? `Searching for “${i.query}”` : i.followed_only ? "Listing the banks you follow" : "Listing institutions"),
  get_dashboard: (i) => `Reading the ${i.slug} dashboard`,
  scan_dashboards: (i) => `Scanning ${i.section} across dashboards`,
  get_news: (i) => (i.slug ? `Checking news for ${i.slug}` : "Checking recent news"),
  get_calendar: () => "Checking the earnings calendar",
  get_official_metrics: () => "Pulling call report figures",
  get_dashboard_history: (i) => `Reading the version history of ${i.slug}`,
  get_market_insights: (i) => (i.theme ? `Reading the evidence for “${i.theme}”` : "Reading market insights"),
  get_product: (i) => `Looking up ${i.product}`,
  get_whitespace: (i) => (i.slug ? `Checking whitespace at ${i.slug}` : i.product ? `Checking whitespace for ${i.product}` : "Checking your whitespace"),
};

export function toolLabel(name: string, input: unknown) {
  const f = TOOL_LABELS[name];
  return f ? f((input ?? {}) as Record<string, unknown>).replace(/-/g, " ") : name;
}

export async function runTool(name: string, rawInput: unknown, ctx: Ctx): Promise<string> {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  switch (name) {
    case "find_institutions": {
      const follows = await followed(ctx);
      const q = str(input.query)?.toLowerCase();
      const rows = (await institutions(ctx))
        .filter((i) => !q || [i.name, i.ticker, i.hq, i.slug].some((v) => typeof v === "string" && v.toLowerCase().includes(q)))
        .filter((i) => !str(input.category) || i.category === input.category)
        .filter((i) => !bool(input.followed_only) || follows.has(i.slug))
        .map(({ current_snapshot_id: _id, ...i }) => ({ ...i, followed: follows.has(i.slug) }));
      return clip({ count: rows.length, institutions: rows });
    }

    case "get_dashboard": {
      const slug = str(input.slug);
      if (!slug) return "Error: slug is required.";
      const wanted = strList(input.sections).filter((s): s is Section => (SECTIONS as readonly string[]).includes(s));
      const sections = wanted.length ? wanted : DEFAULT_SECTIONS;
      const { data: inst } = await ctx.db.from("institutions").select("slug, name, current_snapshot_id").eq("slug", slug).maybeSingle();
      if (!inst?.current_snapshot_id) return `No institution with slug "${slug}". Use find_institutions to get slugs.`;
      const { data: snap } = await ctx.db.from("snapshots")
        .select(`loaded_at, ${sections.map((s) => `${s}:data->${s}`).join(", ")}`)
        .eq("id", inst.current_snapshot_id).single();
      const row = (snap ?? {}) as Record<string, unknown>;
      const out: Record<string, unknown> = { institution: inst.name, slug, page: `/banks/${slug}`, researched_at: row.loaded_at };
      for (const s of sections) {
        if (s !== "products") out[s] = row[s];
        // The overview lists products briefly; ask for "products" explicitly for full cards.
        else out[s] = wanted.length ? slimProducts(row[s]) : productSummary(row[s]);
      }
      if (!wanted.length) out.more_sections = SECTIONS.filter((x) => !sections.includes(x));
      return clip(out);
    }

    case "scan_dashboards": {
      const section = str(input.section) as Section | undefined;
      if (!section || !(SECTIONS as readonly string[]).includes(section)) return "Error: unknown section.";
      const follows = bool(input.followed_only) ? await followed(ctx) : null;
      const only = new Set(strList(input.slugs));
      const list = (await institutions(ctx)).filter((i) => (!only.size || only.has(i.slug)) && (!follows || follows.has(i.slug)) && i.current_snapshot_id);
      if (!list.length) return "No institutions match.";
      const { data } = await ctx.db.from("snapshots").select(`id, part:data->${section}`).in("id", list.map((i) => i.current_snapshot_id));
      const byId = new Map((data ?? []).map((r) => [r.id as number, (r as { part: unknown }).part]));
      const perItem = Math.max(600, Math.floor(MAX_RESULT / list.length) - 350);
      const rows = list.map((i) => {
        const raw = byId.get(i.current_snapshot_id as number);
        const part = section === "products" ? productSummary(raw) : raw;
        const text = part == null ? "" : JSON.stringify(part);
        return { slug: i.slug, name: i.name, [section]: part == null ? null : text.length > perItem ? clip(text, perItem) : part };
      });
      return clip({ section, count: rows.length, institutions: rows });
    }

    case "get_news": {
      const days = Math.min(Math.max(Number(input.days) || (str(input.slug) ? 3650 : 30), 1), 3650);
      let q = ctx.db.from("news_items").select("slug, published_on, headline, summary, source_name, url")
        .gte("published_on", addDays(todayISO(), -days)).order("published_on", { ascending: false }).limit(150);
      if (str(input.slug)) q = q.eq("slug", str(input.slug)!);
      else if (bool(input.followed_only)) q = q.in("slug", [...(await followed(ctx))]);
      const term = str(input.query)?.replace(/[%,()]/g, " ");
      if (term) q = q.or(`headline.ilike.%${term}%,summary.ilike.%${term}%`);
      const { data } = await q;
      return clip({
        days, items: data ?? [],
        note: "Collected weekly and on demand (\"Refresh news\" on a bank page); history is kept. Each dashboard also has its own research-time news (get_dashboard sections ['news']). Full list: /banks/<slug>/news.",
      });
    }

    case "get_calendar": {
      const from = str(input.from) ?? addDays(todayISO(), -30);
      const to = str(input.to) ?? addDays(todayISO(), 90);
      let q = ctx.db.from("earnings_events").select(`${EVENT_COLUMNS}, institutions(name)`)
        .gte("event_date", from).lte("event_date", to).order("event_date");
      if (str(input.slug)) q = q.eq("slug", str(input.slug)!);
      else if (bool(input.followed_only)) q = q.in("slug", [...(await followed(ctx))]);
      const { data } = await q;
      return clip({ today: todayISO(), from, to, events: data ?? [] });
    }

    case "get_official_metrics": {
      const slugs = strList(input.slugs).slice(0, 12);
      if (!slugs.length) return "Error: give at least one slug.";
      const n = Math.min(Math.max(Number(input.quarters) || 4, 1), 9);
      const [{ data: rows }, { data: ents }] = await Promise.all([
        ctx.db.from("regulatory_metrics").select("slug, period, source, assets_b, deposits_b, nim, deposit_cost, ldr, deposit_growth, efficiency, roa").in("slug", slugs).order("period", { ascending: false }),
        ctx.db.from("regulatory_entities").select("slug, source, ids, names, holding_company").in("slug", slugs),
      ]);
      const bySlug = slugs.map((slug) => ({
        slug,
        filings: (ents ?? []).find((e) => e.slug === slug) ?? null,
        quarters: (rows ?? []).filter((r) => r.slug === slug).slice(0, n),
      }));
      const definitions = Object.fromEntries(Object.entries(METRICS).map(([k, m]) => [k, `${m.label} (${m.unit}): ${m.definition}`]));
      return clip({ compare_page: `/compare?ids=${slugs.slice(0, 6).join(",")}`, definitions, institutions: bySlug });
    }

    case "get_dashboard_history": {
      const slug = str(input.slug);
      if (!slug) return "Error: slug is required.";
      const { data: snaps } = await ctx.db.from("snapshots")
        .select("id, quarter, source, loaded_at, data").eq("slug", slug).order("loaded_at");
      if (!snaps?.length) return `No dashboard versions for "${slug}".`;
      const versions = snaps.map((s, i) => ({
        version: i + 1, researched_at: s.loaded_at, quarter: s.quarter, source: s.source,
        ...(i > 0 ? { changes_from_previous: compareDashboards(snaps[i - 1].data, s.data) } : {}),
      }));
      return clip({ slug, versions, page: `/banks/${slug}/changes` });
    }

    case "get_market_insights": {
      const scope = parseScope(str(input.scope));
      const [{ data }, follows] = await Promise.all([ctx.db.from("insight_inputs").select(INSIGHT_COLUMNS), followed(ctx)]);
      const rows = inScope((data ?? []) as InsightInput[], scope, follows);
      const themes = themeResults(rows);
      const theme = str(input.theme);
      if (theme) {
        const t = themes.find((x) => x.key === theme);
        return t ? clip({ scope, institutions: rows.length, theme: t, page: "/insights" }) : `Unknown theme "${theme}".`;
      }
      return clip({
        scope, institutions: rows.length, page: `/insights${scope === "all" ? "" : `?scope=${scope}`}`,
        themes: themes.map(({ evidence: _e, ...t }) => t),
        product_demand: productDemand(rows).slice(0, 15),
        lead_angles: angleResults(rows).slice(0, 5).map((a) => ({ title: a.title, institutions: a.banks.length, examples: a.banks.slice(0, 2).map((b) => ({ name: b.name, body: b.body })) })),
        objections: objectionResults(rows).map((o) => ({ type: o.label, institutions: o.banks, examples: o.examples.slice(0, 3) })),
      });
    }

    case "get_product": {
      const key = str(input.product) ?? "";
      const product = productBySlug(key) ?? productFor(key) ?? PRODUCTS.find((p) => p.name.toLowerCase().includes(key.toLowerCase()));
      if (!product) return `Unknown product "${key}". Products: ${PRODUCTS.map((p) => p.name).join("; ")}`;
      const [{ data }, follows] = await Promise.all([
        ctx.db.from("insight_inputs").select("slug, name, category, assets_b, products, dnr_products"),
        followed(ctx),
      ]);
      const rows = inScope((data ?? []) as InsightInput[], bool(input.followed_only) ? "following" : "all", follows);
      const entries = rows.flatMap((r) => {
        const dp = (r.products ?? []).find((p) => productFor(p.name)?.slug === product.slug);
        const pri = dp && effectivePriority(product, dp);
        return dp && pri ? [{ slug: r.slug, name: r.name, priority: pri, fit: dp.fit, why: dp.why, opening_line: dp.talk, timing: dp.time, objections: dp.objections }] : [];
      }).sort((a, b) => a.priority - b.priority || (b.fit ?? 0) - (a.fit ?? 0));
      const blocks = sellerBlocks(product.body).map((b) => (b.kind === "para" ? b.text : `${b.title ?? ""}\n- ${b.items.join("\n- ")}`));
      return clip({
        product: product.name, slug: product.slug, page: `/products/${product.slug}`, pillar: product.pillar,
        status: statusLabel(product)?.label ?? "Available",
        catalogue: blocks.join("\n\n"),
        targets: entries.filter((e) => e.priority <= 2).map(({ objections: _o, ...e }) => e),
        priority_3: entries.filter((e) => e.priority === 3).map((e) => e.name),
        ruled_out: rows.flatMap((r) => (r.dnr_products ?? []).filter((d) => productFor(d.name)?.slug === product.slug).map((d) => ({ name: r.name, reason: d.reason }))),
        objections: entries.flatMap((e) => (e.objections ?? []).map((o) => ({ ...o, institution: e.name }))).slice(0, 12),
      });
    }

    case "get_whitespace": {
      const slug = str(input.slug);
      const productKey = str(input.product);
      const product = productKey ? productBySlug(productKey) ?? productFor(productKey) ?? PRODUCTS.find((p) => p.name.toLowerCase().includes(productKey.toLowerCase())) : null;
      if (productKey && !product) return `Unknown product "${productKey}".`;
      const follows = await followed(ctx);
      const scope = slug ? [slug] : bool(input.all_banks) ? null : [...follows];
      if (scope && scope.length === 0) return "The user follows no banks, so their book is empty. Suggest following banks (the star on Banks) and setting statuses on the Whitespace page.";
      let q = ctx.db.from("whitespace").select(WHITESPACE_COLUMNS);
      let iq = ctx.db.from("institutions").select("slug, name, category, assets_b");
      let rq = ctx.db.from("insight_inputs").select("slug, products, dnr_products");
      let eq = ctx.db.from("whitespace_events").select(WS_EVENT_COLUMNS).gte("at", new Date(Date.now() - 30 * 86400 * 1000).toISOString()).order("at", { ascending: false }).limit(60);
      if (scope) { q = q.in("slug", scope); iq = iq.in("slug", scope); rq = rq.in("slug", scope); eq = eq.in("slug", scope); }
      if (product) { q = q.eq("product_slug", product.slug); eq = eq.eq("product_slug", product.slug); }
      const [{ data: rows }, { data: insts }, { data: research }, { data: events }] = await Promise.all([q, iq, rq, eq]);
      const names = new Map((insts ?? []).map((i) => [i.slug as string, i.name as string]));
      const pname = (p: string) => productBySlug(p)?.name ?? p;
      const list = ((rows ?? []) as WhitespaceRow[]).map((r) => ({
        institution: names.get(r.slug) ?? r.slug, page: `/banks/${r.slug}/whitespace`, product: pname(r.product_slug),
        status: lostExpired(r) ? "eligible again (loss window passed)" : STATUSES[r.status].label,
        quarter: r.target_quarter ? formatQuarter(r.target_quarter) : undefined, acv_usd: r.acv_usd ?? undefined,
        lost: r.lost_on ?? undefined, note: r.note ?? undefined, updated: r.updated_at.slice(0, 10), demo: r.is_demo || undefined,
      }));
      const book = slug || product ? null : bookOf({ institutions: (insts ?? []) as never, research: (research ?? []) as never, rows: (rows ?? []) as WhitespaceRow[] });
      return clip({
        scope: slug ? names.get(slug) ?? slug : bool(input.all_banks) ? "all institutions" : "the user's book (followed banks)",
        note: "Statuses are shared by the account team; ACV is annual contract value in USD. Rows marked demo are sample data.",
        ...(book && {
          totals: { validated_acv: book.totals.validated.acv, validated: book.totals.validated.count, in_play_acv: book.totals.inPlay.acv, in_play: book.totals.inPlay.count, recently_lost: book.totals.lost, due_by_this_quarter: book.totals.dueThisQuarter, reviewed: `${book.reviewed} of ${book.applicable} applicable` },
          by_quarter: book.byQuarter.map((x) => ({ quarter: x.label, validated_acv: x.pair.validated, in_play_acv: x.pair.inPlay })),
          by_bank: book.byBank.map((x) => ({ institution: x.name, validated_acv: x.pair.validated, in_play_acv: x.pair.inPlay })),
          next_steps: book.steps.map((x) => x.text),
          not_reviewed_but_research_backed: book.banks.map((i) => ({ institution: i.name, products: book.lines.get(i.slug)!.filter((l) => l.applies.ok && !l.row && l.priority != null && l.priority <= 2).map((l) => `${l.product.name} (P${l.priority})`) })).filter((x) => x.products.length),
        }),
        statuses: list,
        changes_last_30_days: ((events ?? []) as WhitespaceEvent[]).map((e) => ({ when: e.at.slice(0, 10), institution: names.get(e.slug) ?? e.slug, product: pname(e.product_slug), change: describeChange(e) })),
      });
    }

    default:
      return `Unknown tool ${name}.`;
  }
}
