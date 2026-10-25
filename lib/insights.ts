// Cross-bank insights, worked out from the dashboards themselves (the
// insight_inputs view). Themes and objection types are matched with plain
// keyword rules, so every count can show the sentence that put a bank in it.

import { effectivePriority, productFor, type DashboardProduct } from "./products";

export type InsightInput = {
  slug: string; name: string; category: string; assets_b: number | null; opportunity: string | null;
  latest_quarter: string | null; researched_at: string; health_rating: string | null;
  products: DashboardProduct[] | null;
  dnr_products: { name?: string; reason?: string }[] | null;
  swot: { threats?: string[]; opportunities?: string[]; strengths?: string[]; weaknesses?: string[] } | null;
  landmines: { objection?: string; rebuttal?: string; competitor?: string }[] | null;
  angle: { title?: string; body?: string } | null;
  timing: { label?: string; body?: string }[] | null;
  pillars: { title?: string; body?: string }[] | null;
  sales_theme: string | null;
};

export const INSIGHT_COLUMNS = "slug, name, category, assets_b, opportunity, latest_quarter, researched_at, health_rating, products, dnr_products, swot, landmines, angle, timing, pillars, sales_theme";

// ---- Themes

export type Source = "threat" | "opportunity" | "priority" | "now";
export const SOURCES: { key: Source; label: string; hint: string }[] = [
  { key: "threat", label: "Named as a threat", hint: "SWOT threats" },
  { key: "opportunity", label: "Named as an opportunity", hint: "SWOT opportunities" },
  { key: "priority", label: "Strategic priority", hint: "the bank's own strategy pillars" },
  { key: "now", label: "Urgent now", hint: "the dashboard's “now” sales timing" },
];

type Theme = { key: string; label: string; blurb: string; pattern: RegExp; banksOnly?: boolean };

export const THEMES: Theme[] = [
  { key: "deposit-pricing", label: "Deposit competition and pricing", blurb: "Rising deposit costs, betas, promotional rates and rate shoppers.",
    pattern: /deposit (competition|costs?|pricing|rates?|betas?)|funding (competition|costs?)|\bbetas?\b|promotional|rate[- ]shop|commoditi[sz]|cost of (deposits|funds)|high[- ]yield (savings|accounts?)/i },
  { key: "margin", label: "Margin and net interest income", blurb: "NIM compression, margin targets and NII guidance.",
    pattern: /\bNIM\b|net interest (margin|income)|\bNII\b|margin (pressure|compression|defen[cs]e|recovery|rebuild|expansion|guid)/i },
  { key: "cd-repricing", label: "CD and time-deposit repricing", blurb: "Certificates and time deposits rolling over and repricing.",
    pattern: /\bCDs?\b|time deposits?|certificates? (reprice|repricing|maturit|book|mix)|maturity wall|share certificates?/i },
  { key: "funding-gap", label: "Funding gap and liquidity", blurb: "Loans growing faster than deposits, high loan-to-deposit ratios, wholesale funding.",
    pattern: /loan-to-(deposit|share)|\bLDR\b|wholesale|brokered|\bFHLB\b|liquidity|funding gap|loan growth (above|outpac|ahead)|outpac\w* deposit/i },
  { key: "credit", label: "Credit quality and CRE concentration", blurb: "Commercial real estate exposure, criticised loans, charge-offs.",
    pattern: /\bCRE\b|commercial real estate|credit (quality|stress|risk|concentration|costs?)|charge-offs?|non-?performing|\bNP[AL]s?\b|critici[sz]ed|classified|delinquen|office (loans?|exposure)/i },
  { key: "ma", label: "M&A and integration", blurb: "Deals announced or closing, integrations, conversions and harmonisation.",
    pattern: /merger|acqui(re|red|sition)|integrat|conversion|\bM&A\b|combination|synerg|harmoni[sz]/i },
  { key: "efficiency", label: "Cost and efficiency", blurb: "Efficiency ratios, expense programmes and operating leverage.",
    pattern: /efficiency|expenses?\b|cost[- ]sav|operating leverage|productivity/i },
  { key: "digital", label: "Digital, data and technology", blurb: "Digital channels, core modernisation, data platforms and AI.",
    pattern: /digital|technology|core (system|conversion|moderni[sz]|platform|banking)|\bAI\b|data platform|cloud|mobile app|onboarding/i },
  { key: "commercial", label: "Commercial, C&I and treasury growth", blurb: "Commercial banking, treasury management and small business.",
    pattern: /commercial (bank|deposit|client|franchise|pipeline|lending|growth)|\bC&I\b|treasury management|business (banking|deposits|services)|small[- ]business|\bSBA\b/i },
  { key: "fees", label: "Fee income and wealth", blurb: "Wealth, fiduciary, capital markets and other fee lines.",
    pattern: /fee (income|lines?|revenue)|wealth|non-?interest income|fiduciary|capital markets|mortgage (revenue|banking|banking income)/i },
  { key: "network", label: "Branches and new markets", blurb: "Branch openings and closures, de novo expansion and new footprints.",
    pattern: /branch|de novo|new markets?|expansion market|footprint|financial cent(er|re)s?|\bLPO\b|market entry/i },
  { key: "rates", label: "Rate path and balance-sheet sensitivity", blurb: "Fed path, AOCI, asset or liability sensitivity and reinvestment.",
    pattern: /rate (path|cuts?|hikes?|cycle|environment|increase)|\bFed\b|\bAOCI\b|asset[- ]sensitiv|liability[- ]sensitiv|unreali[sz]ed loss|reinvestment/i },
  { key: "regulation", label: "Regulation and capital", blurb: "Capital ratios, regulatory thresholds and supervisory actions.",
    pattern: /regulat|\bCET1\b|capital (ratio|plan|requirement|return|deploy)|Basel|\$100\s?B|threshold|consent order|\bCFPB\b|\bFINRA\b/i },
  { key: "leadership", label: "Leadership change", blurb: "New executives, reorganisations and succession.",
    pattern: /\bnew (CEO|CFO|CIO|president|chief)|\b(CEO|CFO) (transition|succession|change|appoint)|leadership (change|transition)|reorgani[sz]|co-presidents?|succession/i },
  { key: "competitors", label: "Competition from big banks, fintechs and credit unions", blurb: "Pressure from larger banks, digital banks, fintechs and (for banks) credit unions.",
    pattern: /fintech|neobank|megabank|national banks|large(r)? banks|money[- ]cent(er|re)|credit unions?|non-?bank|private credit|online (banks?|competitors?)|direct banks?/i, banksOnly: true },
];

export type Evidence = { slug: string; name: string; source: Source; text: string };
export type ThemeResult = { key: string; label: string; blurb: string; counts: Record<Source, number>; banks: number; evidence: Evidence[] };

function textsBySource(r: InsightInput): [Source, string][] {
  return [
    ...(r.swot?.threats ?? []).map((t): [Source, string] => ["threat", t]),
    ...(r.swot?.opportunities ?? []).map((t): [Source, string] => ["opportunity", t]),
    ...(r.pillars ?? []).map((p): [Source, string] => ["priority", [p.title, p.body].filter(Boolean).join(" — ")]),
    ...(r.timing?.[0]?.body ? [["now", r.timing[0].body] as [Source, string]] : []),
  ].filter(([, t]) => typeof t === "string" && t.trim().length > 0);
}

// The sentence of a longer text that matched, so evidence stays short.
function excerpt(text: string, pattern: RegExp) {
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const hit = sentences.find((s) => pattern.test(s)) ?? text;
  return hit.length > 260 ? `${hit.slice(0, 257).trimEnd()}…` : hit;
}

export function themeResults(rows: InsightInput[]): ThemeResult[] {
  return THEMES.map((theme) => {
    const counts: Record<Source, number> = { threat: 0, opportunity: 0, priority: 0, now: 0 };
    const evidence: Evidence[] = [];
    const banks = new Set<string>();
    for (const r of rows) {
      if (theme.banksOnly && r.category === "credit_union") continue;
      const seen = new Set<Source>();
      for (const [source, text] of textsBySource(r)) {
        if (seen.has(source) || !theme.pattern.test(text)) continue;
        seen.add(source);
        counts[source]++;
        banks.add(r.slug);
        evidence.push({ slug: r.slug, name: r.name, source, text: excerpt(text, theme.pattern) });
      }
    }
    return { key: theme.key, label: theme.label, blurb: theme.blurb, counts, banks: banks.size, evidence };
  }).sort((a, b) => b.banks - a.banks || b.counts.threat - a.counts.threat);
}

// ---- Objections and how to answer them

type ObjectionType = { key: string; label: string; pattern: RegExp };

export const OBJECTION_TYPES: ObjectionType[] = [
  // The playbooks also list things a seller should never say; they are checked first.
  { key: "avoid", label: "Lines that backfire (don't open with these)", pattern: /^(?!you (are (telling|about to)|have noticed))(you\b|your(?! colleague)\b)|^(pitching|framing the pitch|citing|leading with|calling it|any suggestion|seller )/i },
  { key: "availability", label: "“Can we have the roadmap product?”", pattern: /available|roadmap|coming soon|released|can we (see|buy|get)|primacy module|full (retail deposit )?optimizer|profitability optimizer|commercial digital analyzer|handle retention|\b(commit|conserve|calibrate)\b/i },
  { key: "member", label: "“We're a cooperative, not a bank”", pattern: /member|cooperative|co-op|not-for-profit|margin extraction/i },
  { key: "bandwidth", label: "“Not now — we're busy”", pattern: /conversion|integration|systems merger|no more projects|bandwidth|busy|not (the )?right time|next year|after the (merger|deal)|freeze|on our plate|take (anything|nothing) (else|on)|cannot take|can't take|new team|planning cycle|wait until|until .+ (is live|in the seat)|priority this year/i },
  { key: "vendor", label: "“We already have a vendor”", pattern: /already (use|have|subscribe)|vendor|technology partner|core (or digital banking )?provider|core programme|Thought Machine|Accenture|Salesforce|S&P|RateWatch|Moebs|Datatrac|\bFIS\b|nCino|Bankrate|competitor (product|tool)/i },
  { key: "in-house", label: "“We do this ourselves”", pattern: /own (models?|tools|data|platform|team|analytics|deposit behaviou?r)|in-house|internal(ly)?|build (our own|this|it)|building our own|already know competitor rates|ourselves|ALM (model|vendor|system)|branch managers|call reports|tracks? competitor rates|rate[- ]shop|finance team|treasury team|hire someone|AI writes|analytical capab|buy more deposits/i },
  { key: "cost", label: "“It costs too much”", pattern: /cost of (the|a|your)|budget|subscription|expensive|price tag|\bROI\b|afford|spend/i },
  { key: "performing", label: "“We're already performing well”", pattern: /already (the )?lowest|lowest (among|of)|in line with|cheaper than|ahead of|above peers|expand|grew|growing|efficien|run lean|best[- ]in[- ]class|outperform|record|\bfine\b|strong|healthy|improved|don'?t need|why would we|what problem|where is the problem|NIM is|margin is|best in our peer|better than peers|above the benchmark|don't have a [a-z]+ problem|flat at|reflects? our/i },
];

export type ObjectionExample = { slug: string; name: string; objection: string; rebuttal: string };
export type ObjectionResult = { key: string; label: string; banks: number; examples: ObjectionExample[] };

export function objectionResults(rows: InsightInput[]): ObjectionResult[] {
  const results = OBJECTION_TYPES.map((t) => ({ key: t.key, label: t.label, banks: new Set<string>(), examples: [] as ObjectionExample[] }));
  const other = { key: "other", label: "Other objections", banks: new Set<string>(), examples: [] as ObjectionExample[] };
  for (const r of rows) {
    for (const l of r.landmines ?? []) {
      const objection = l.objection?.trim().replace(/^["'“‘]|["'”’]$/g, "");
      if (!objection || !l.rebuttal) continue;
      const i = OBJECTION_TYPES.findIndex((t) => t.pattern.test(objection));
      const bucket = i >= 0 ? results[i] : other;
      bucket.banks.add(r.slug);
      bucket.examples.push({ slug: r.slug, name: r.name, objection, rebuttal: l.rebuttal.trim() });
    }
  }
  return [...results, other]
    .map((b) => ({ key: b.key, label: b.label, banks: b.banks.size, examples: b.examples }))
    .filter((b) => b.banks > 0)
    .sort((a, b) => (a.key === "other" ? 1 : b.key === "other" ? -1 : b.banks - a.banks));
}

// ---- Lead angles: the dashboards' "Curinos angle" headlines, grouped.

export type AngleResult = { title: string; banks: { slug: string; name: string; body: string }[] };

export function angleResults(rows: InsightInput[]): AngleResult[] {
  const groups = new Map<string, AngleResult>();
  for (const r of rows) {
    const title = r.angle?.title?.trim();
    if (!title) continue;
    // "The Data Gap No Internal Team Can Close -- What the Market Is Paying" groups with its stem.
    const stem = title.split(/\s*(?:--|—|:)\s+/)[0].replace(/\s+Before .+$/i, "").trim();
    const g = groups.get(stem.toLowerCase()) ?? { title: stem, banks: [] };
    g.banks.push({ slug: r.slug, name: r.name, body: r.angle?.body ?? "" });
    groups.set(stem.toLowerCase(), g);
  }
  return [...groups.values()].sort((a, b) => b.banks.length - a.banks.length);
}

// ---- Product demand across the market

export type Demand = { slug: string; name: string; p1: number; p2: number; p3: number; avgFit: number | null };

export function productDemand(rows: InsightInput[]): Demand[] {
  const by = new Map<string, { name: string; p: [number, number, number]; fits: number[] }>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const dp of r.products ?? []) {
      const product = productFor(dp.name);
      const pri = product && effectivePriority(product, dp);
      if (!product || !pri || seen.has(product.slug)) continue;
      seen.add(product.slug);
      const e = by.get(product.slug) ?? { name: product.name, p: [0, 0, 0] as [number, number, number], fits: [] };
      e.p[pri - 1]++;
      if (typeof dp.fit === "number") e.fits.push(dp.fit);
      by.set(product.slug, e);
    }
  }
  return [...by.entries()].map(([slug, e]) => ({
    slug, name: e.name, p1: e.p[0], p2: e.p[1], p3: e.p[2],
    avgFit: e.fits.length ? Math.round(e.fits.reduce((a, b) => a + b, 0) / e.fits.length) : null,
  })).sort((a, b) => b.p1 - a.p1 || b.p2 - a.p2);
}

// ---- Scope filter shared by Insights and Products

export type Scope = "all" | "banks" | "credit-unions" | "following";
export const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "All" }, { key: "banks", label: "Banks" },
  { key: "credit-unions", label: "Credit unions" }, { key: "following", label: "Following" },
];

export function inScope<T extends { slug: string; category: string }>(rows: T[], scope: Scope, followed: Set<string>) {
  if (scope === "banks") return rows.filter((r) => r.category !== "credit_union");
  if (scope === "credit-unions") return rows.filter((r) => r.category === "credit_union");
  if (scope === "following") return rows.filter((r) => followed.has(r.slug));
  return rows;
}

export function parseScope(value: string | undefined): Scope {
  return SCOPES.some((s) => s.key === value) ? (value as Scope) : "all";
}
