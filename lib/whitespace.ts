import { PILLAR_ORDER, PRODUCTS, effectivePriority, productFor, type CatalogueProduct, type DashboardProduct } from "./products";
import { LOST_WINDOW_MONTHS, STATUSES, STATUS_KEYS, addToPair, emptyPair, formatQuarter, formatUsd, lostExpired, monthsAgo, quarterOf, type Pair, type Status, type WhitespaceRow } from "./whitespace-core";

export * from "./whitespace-core";

// Whitespace: the account team's view of each Curinos product at each
// institution. Statuses live in the whitespace table (no row = not reviewed);
// every change is logged in whitespace_events.

// ---- Which products apply to an institution, from the catalogue's own rules.

export type Institution = { slug: string; name: string; category: string; assets_b: number | null };
export type Applicability = { ok: true; note?: string } | { ok: false; reason: string };

export function applicability(p: CatalogueProduct, inst: Pick<Institution, "category" | "assets_b">): Applicability {
  const cu = inst.category === "credit_union";
  const assets = Number(inst.assets_b ?? 0);
  if (!p.countries.split("/").includes("US")) return { ok: false, reason: `${p.countries} only` };
  const types = p.types.toLowerCase();
  if (cu && (types.startsWith("banks") || (types.includes("commercial bank") && !types.includes("credit union")))) {
    return { ok: false, reason: "Banks and thrifts only" };
  }
  const hard = p.sizeGate.match(/^([≥<])(\d+) hard(?: \(CU [≥<](\d+)\))?/);
  if (hard) {
    const limit = Number(cu && hard[3] ? hard[3] : hard[2]);
    if (hard[1] === "≥" && assets < limit) return { ok: false, reason: `For institutions over $${limit}B` };
    if (hard[1] === "<" && assets >= limit) return { ok: false, reason: `For institutions under $${limit}B` };
  }
  if (p.status === "roadmap") return { ok: true, note: "Coming soon" };
  if (p.status === "unlisted") return { ok: true, note: "Confirm availability" };
  return { ok: true };
}

// ---- One institution's product list: catalogue x research x team status.

export type ProductLine = {
  product: CatalogueProduct;
  applies: Applicability;
  priority: number | null; // the dashboard's P1-P3, after catalogue caps
  fit: number | null;
  ruledOut: string | null; // the research's "do not recommend now" reason
  row: WhitespaceRow | null;
  expired: boolean;
};

type ResearchProduct = DashboardProduct;
type RuledOut = { name?: string; reason?: string };

export function productLines(inst: Institution, research: ResearchProduct[] | null, ruledOut: RuledOut[] | null, rows: WhitespaceRow[], today = new Date()): ProductLine[] {
  const bySlug = new Map(rows.map((r) => [r.product_slug, r]));
  const dash = new Map<string, ResearchProduct>();
  for (const dp of research ?? []) {
    const p = productFor(dp.name);
    if (p && !dash.has(p.slug)) dash.set(p.slug, dp);
  }
  const dnr = new Map<string, string>();
  for (const d of ruledOut ?? []) {
    const p = productFor(d.name);
    if (p && !dnr.has(p.slug)) dnr.set(p.slug, d.reason ?? "");
  }
  return PRODUCTS.map((product) => {
    const dp = dash.get(product.slug);
    const row = bySlug.get(product.slug) ?? null;
    return {
      product,
      applies: applicability(product, inst),
      priority: dp ? effectivePriority(product, dp) : null,
      fit: typeof dp?.fit === "number" ? dp.fit : null,
      ruledOut: dnr.get(product.slug) ?? null,
      row,
      expired: row ? lostExpired(row, today) : false,
    };
  }).sort((a, b) => PILLAR_ORDER.indexOf(a.product.pillar) - PILLAR_ORDER.indexOf(b.product.pillar)
    || (a.priority ?? 9) - (b.priority ?? 9) || (b.fit ?? 0) - (a.fit ?? 0) || a.product.name.localeCompare(b.product.name));
}

// ---- Totals for a set of rows (the bank summary, the book of business).

export function totals(rows: WhitespaceRow[], today = new Date()) {
  const live = rows.filter((r) => !lostExpired(r, today));
  const sum = (s: Status) => live.filter((r) => r.status === s).reduce((t, r) => t + Number(r.acv_usd ?? 0), 0);
  const count = (s: Status) => live.filter((r) => r.status === s).length;
  const thisQuarter = quarterOf(today);
  return {
    validated: { count: count("validated"), acv: sum("validated") },
    inPlay: { count: count("in_play"), acv: sum("in_play") },
    lost: count("lost_pipeline") + count("lost_renewal"),
    clients: count("client"),
    dueThisQuarter: live.filter((r) => r.status === "validated" && r.target_quarter && r.target_quarter <= thisQuarter).length,
  };
}

// ---- History

export type WhitespaceEvent = {
  slug: string; product_slug: string; actor: string | null; at: string;
  old_status: Status | null; new_status: Status | null; old_acv: number | null; new_acv: number | null;
  old_quarter: string | null; new_quarter: string | null; note: string | null; is_demo: boolean;
};
export const EVENT_COLUMNS = "slug, product_slug, actor, at, old_status, new_status, old_acv, new_acv, old_quarter, new_quarter, note, is_demo";

// "set to Validated (Q1 2027, $250K)", "moved from Validated to In play", "cleared".
export function describeChange(e: WhitespaceEvent) {
  const label = (s: Status | null) => (s ? STATUSES[s].short : "Not reviewed");
  const extras = [e.new_quarter && formatQuarter(e.new_quarter), e.new_acv != null && formatUsd(e.new_acv)].filter(Boolean).join(", ");
  if (!e.new_status) return `cleared (was ${label(e.old_status)})`;
  if (!e.old_status) return `set to ${label(e.new_status)}${extras ? ` (${extras})` : ""}`;
  if (e.old_status !== e.new_status) return `moved from ${label(e.old_status)} to ${label(e.new_status)}${extras ? ` (${extras})` : ""}`;
  return `updated ${label(e.new_status)}${extras ? ` (${extras})` : ""}`;
}

// ---- The book of business: what the Whitespace page, Home and Ask summarise.

export type BookInput = {
  institutions: Institution[];
  research: { slug: string; products: DashboardProduct[] | null; dnr_products: { name?: string; reason?: string }[] | null }[];
  rows: WhitespaceRow[];
};

export function bookOf(input: BookInput, today = new Date()) {
  const researchBy = new Map(input.research.map((r) => [r.slug, r]));
  const banks = [...input.institutions].sort((a, b) => Number(b.assets_b ?? 0) - Number(a.assets_b ?? 0));
  const lines = new Map(banks.map((i) => [i.slug, productLines(
    i, researchBy.get(i.slug)?.products ?? null, researchBy.get(i.slug)?.dnr_products ?? null,
    input.rows.filter((r) => r.slug === i.slug), today,
  )]));
  const live = input.rows.filter((r) => !lostExpired(r, today));
  const now = quarterOf(today);

  const quarters = new Map<string, Pair>();
  const perBank = new Map<string, Pair>();
  const perPillar = new Map<string, Pair>();
  for (const r of live) {
    if (r.status !== "validated" && r.status !== "in_play") continue;
    const q = r.target_quarter ?? "none";
    addToPair(quarters.get(q) ?? quarters.set(q, emptyPair()).get(q)!, r.status, r.acv_usd);
    addToPair(perBank.get(r.slug) ?? perBank.set(r.slug, emptyPair()).get(r.slug)!, r.status, r.acv_usd);
    const pillar = PRODUCTS.find((p) => p.slug === r.product_slug)?.pillar ?? "Other";
    addToPair(perPillar.get(pillar) ?? perPillar.set(pillar, emptyPair()).get(pillar)!, r.status, r.acv_usd);
  }
  const quarterKeys = [...quarters.keys()].filter((q) => q !== "none").sort();
  const byQuarter = [
    ...quarterKeys.map((q) => ({ label: q < now ? `${formatQuarter(q)} (past)` : formatQuarter(q), key: q, pair: quarters.get(q)! })),
    ...(quarters.has("none") ? [{ label: "No date", key: "none", pair: quarters.get("none")! }] : []),
  ];
  const total = (p: Pair) => p.validated + p.inPlay;
  const byBank = banks.map((i) => ({ slug: i.slug, name: i.name, pair: perBank.get(i.slug) ?? emptyPair() }))
    .sort((a, b) => total(b.pair) - total(a.pair));
  const byPillar = PILLAR_ORDER.filter((p) => perPillar.has(p)).map((p) => ({ pillar: p, pair: perPillar.get(p)! }))
    .sort((a, b) => total(b.pair) - total(a.pair));

  const applicable = banks.flatMap((i) => lines.get(i.slug)!.filter((l) => l.applies.ok).map((l) => ({ i, l })));
  const reviewed = applicable.filter(({ l }) => l.row && !l.expired).length;
  const statusCounts = Object.fromEntries(STATUS_KEYS.map((s) => [s, live.filter((r) => r.status === s)]));

  // Next steps, most useful first.
  const steps: { tone: "warn" | "info" | "good"; text: string; href: string }[] = [];
  for (const { i, n } of banks.map((i) => ({ i, n: lines.get(i.slug)!.filter((l) => l.applies.ok && !l.row && l.priority != null && l.priority <= 2 && l.ruledOut == null).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3)) {
    steps.push({ tone: "info", text: `Review ${n} research-backed ${n === 1 ? "product" : "products"} at ${i.name}`, href: `/banks/${i.slug}/whitespace` });
  }
  const overdue = live.filter((r) => r.status === "validated" && r.target_quarter && r.target_quarter < now);
  if (overdue.length) steps.unshift({ tone: "warn", text: `${overdue.length} validated ${overdue.length === 1 ? "pursuit is" : "pursuits are"} past their quarter: move to In play or re-date`, href: `/banks/${overdue[0].slug}/whitespace` });
  const due = live.filter((r) => r.status === "validated" && r.target_quarter === now);
  if (due.length) steps.unshift({ tone: "good", text: `${due.length} ${due.length === 1 ? "pursuit is" : "pursuits are"} planned for ${formatQuarter(now)}: worth a call this month`, href: `/banks/${due[0].slug}/whitespace` });
  const soon = input.rows.filter((r) => {
    const w = LOST_WINDOW_MONTHS[r.status];
    return w && r.lost_on && !lostExpired(r, today) && monthsAgo(r.lost_on, today) >= w - 3;
  });
  if (soon.length) steps.push({ tone: "info", text: `${soon.length} lost ${soon.length === 1 ? "deal turns" : "deals turn"} back into whitespace within 3 months`, href: `/banks/${soon[0].slug}/whitespace` });
  const stale = live.filter((r) => r.status === "in_play" && Date.now() - new Date(r.updated_at).getTime() > 60 * 86400 * 1000);
  if (stale.length) steps.push({ tone: "warn", text: `${stale.length} in-play ${stale.length === 1 ? "deal hasn't" : "deals haven't"} been updated in 60 days`, href: `/banks/${stale[0].slug}/whitespace` });

  return { banks, lines, totals: totals(input.rows, today), byQuarter, byBank, byPillar, applicable: applicable.length, reviewed, statusCounts, steps };
}

// Weekly totals for a set of banks, from whitespace_snapshots rows.
export function weeklyTrend(snaps: { week: string; status: string; acv_usd: number | null }[]) {
  const by = new Map<string, Pair>();
  for (const s of snaps) addToPair(by.get(s.week) ?? by.set(s.week, emptyPair()).get(s.week)!, s.status, s.acv_usd);
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, p]) => ({ week, ...p }));
}
