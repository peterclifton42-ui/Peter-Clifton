import { themeResults, type InsightInput } from "./insights";
import { PRODUCTS, effectivePriority, productFor, type CatalogueProduct, type DashboardProduct } from "./products";
import { applicability, lostExpired, type WhitespaceRow } from "./whitespace";

// "Next best plays" and the product summary dashboard: where each product is
// needed, how well it fits, what to lead with and what gets a yes. Everything
// comes from the dashboards' own product priorities, fit scores, talk tracks
// and objections, plus the team's whitespace.

export type Play = {
  slug: string; bankName: string; assets: number | null; category: string;
  product: CatalogueProduct; pri: number; fit: number | null; why: string | null; talk: string | null;
};

// Research-backed P1/P2 products at these institutions that nobody has reviewed in
// whitespace yet (or whose loss window has passed), best first.
export function nextPlays(rows: InsightInput[], whitespace: WhitespaceRow[], limit = 10, today = new Date()): Play[] {
  const reviewed = new Set(whitespace.filter((w) => !lostExpired(w, today)).map((w) => `${w.slug}|${w.product_slug}`));
  const plays: Play[] = [];
  for (const r of rows) {
    const ruledOut = new Set((r.dnr_products ?? []).map((d) => productFor(d.name)?.slug).filter(Boolean));
    const seen = new Set<string>();
    for (const dp of r.products ?? []) {
      const product = productFor(dp.name);
      if (!product || seen.has(product.slug)) continue;
      seen.add(product.slug);
      const pri = effectivePriority(product, dp);
      if (!pri || pri > 2 || ruledOut.has(product.slug) || reviewed.has(`${r.slug}|${product.slug}`)) continue;
      if (!applicability(product, r).ok) continue;
      plays.push({
        slug: r.slug, bankName: r.name, assets: r.assets_b, category: r.category, product, pri,
        fit: typeof dp.fit === "number" ? dp.fit : null, why: dp.why ?? null, talk: dp.talk ?? null,
      });
    }
  }
  plays.sort((a, b) => a.pri - b.pri || (b.fit ?? 0) - (a.fit ?? 0) || Number(b.assets ?? 0) - Number(a.assets ?? 0));
  // Spread the list across banks: each bank's best play first, then the next best, and so on.
  const round = new Map<string, number>();
  const ranked = plays.map((p, i) => {
    const n = round.get(p.slug) ?? 0;
    round.set(p.slug, n + 1);
    return { p, n, i };
  });
  return ranked.sort((a, b) => a.n - b.n || a.i - b.i).slice(0, limit).map((x) => x.p);
}

// The first sentence (or two short ones) of a longer text.
export function firstSentence(text: string | null | undefined, max = 150) {
  if (!text) return null;
  const trimmed = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const clean = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  const m = clean.match(/^(.{20,}?[.!?])(\s|$)/);
  const s = m ? m[1] : clean;
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[,;:\s-]+$/, "")}…` : s;
}

export type Target = { r: InsightInput; dp: DashboardProduct; pri: number };

// The themes that set this product's buyers apart: common among them, and more
// common than across the whole market (so a theme every bank raises doesn't win).
export function resonance(targets: InsightInput[], market: InsightInput[], n = 3) {
  if (!targets.length) return [];
  const base = new Map(themeResults(market).map((t) => [t.key, t.banks / Math.max(1, market.length)]));
  return themeResults(targets)
    .filter((t) => t.banks / targets.length >= 0.25)
    .map((t) => {
      const share = t.banks / targets.length;
      return { key: t.key, label: t.label, blurb: t.blurb, banks: t.banks, share, score: share * (share / Math.max(0.05, base.get(t.key) ?? share)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export type ProductSummary = {
  product: CatalogueProduct;
  targets: Target[]; // P1 and P2, best first
  p1: number; p2: number; p3: number;
  avgFit: number | null;
  value: string | null;
  leadWith: { label: string; banks: number }[]; // themes that come up most where it's needed
  objection: { q: string; a: string; slug: string; name: string; count: number } | null;
  pipeline: number; // validated + in play ACV across visible whitespace
  pursuits: number;
};

// One summary per catalogue product across a set of dashboards.
export function productSummaries(rows: InsightInput[], whitespace: WhitespaceRow[], today = new Date()): ProductSummary[] {
  const live = whitespace.filter((w) => !lostExpired(w, today) && (w.status === "validated" || w.status === "in_play"));
  return PRODUCTS.map((product) => {
    const all: Target[] = [];
    for (const r of rows) {
      const dp = (r.products ?? []).find((p) => productFor(p.name)?.slug === product.slug);
      const pri = dp && effectivePriority(product, dp);
      if (dp && pri) all.push({ r, dp, pri });
    }
    all.sort((a, b) => a.pri - b.pri || (b.dp.fit ?? 0) - (a.dp.fit ?? 0));
    const targets = all.filter((t) => t.pri <= 2);
    const fits = targets.map((t) => t.dp.fit).filter((f): f is number => typeof f === "number");

    const leadWith = resonance(targets.map((t) => t.r), rows).map((t) => ({ label: t.label, banks: t.banks }));

    // The objection raised most often for this product, with the first answer given.
    const objections = new Map<string, { q: string; a: string; slug: string; name: string; count: number }>();
    for (const { r, dp } of targets) {
      for (const o of dp.objections ?? []) {
        if (!o.q || !o.a) continue;
        const key = o.q.toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter((w) => w.length > 3).slice(0, 4).join(" ");
        const e = objections.get(key);
        if (e) e.count++;
        else objections.set(key, { q: o.q, a: o.a, slug: r.slug, name: r.name, count: 1 });
      }
    }
    const objection = [...objections.values()].sort((a, b) => b.count - a.count)[0] ?? null;

    const core = product.body.match(/\*\*(?:Core value(?: \(UK\))?|What it does|Site card)\*\*:?\s*(.+)/)?.[1];
    const value = firstSentence(core) ?? firstSentence(all.find((t) => t.dp.what)?.dp.what);
    const mine = live.filter((w) => w.product_slug === product.slug);

    return {
      product, targets,
      p1: all.filter((t) => t.pri === 1).length, p2: all.filter((t) => t.pri === 2).length, p3: all.filter((t) => t.pri === 3).length,
      avgFit: fits.length ? Math.round(fits.reduce((a, b) => a + b, 0) / fits.length) : null,
      value, leadWith, objection,
      pipeline: mine.reduce((s, w) => s + Number(w.acv_usd ?? 0), 0), pursuits: mine.length,
    };
  });
}
