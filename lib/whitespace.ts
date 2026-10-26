import { PILLAR_ORDER, PRODUCTS, effectivePriority, productFor, type CatalogueProduct, type DashboardProduct } from "./products";
import { STATUSES, formatQuarter, formatUsd, lostExpired, quarterOf, type Status, type WhitespaceRow } from "./whitespace-core";

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
