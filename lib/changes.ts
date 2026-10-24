// Compare two versions of a bank's dashboard data (the D object) and list what a
// seller would notice: headline metrics, ratings, product priorities, sales theme
// and news.

type Metric = { l?: string; v?: string; s?: string };
type Product = { name?: string; pri?: number | string; fit?: number };
type NewsItem = { title?: string; date?: string; source?: string; url?: string };
type Dashboard = {
  meta?: { opportunity?: string; latestQuarter?: string };
  healthRating?: string;
  metrics?: Metric[];
  products?: Product[];
  finOverview?: { salesTheme?: string };
  news?: { items?: NewsItem[] };
};

export type MetricChange = { label: string; before: string | null; after: string | null; asOf: string | null };
export type ProductChange = {
  name: string;
  before: number | null; // priority 1-3, null = not recommended
  after: number | null;
  fitBefore: number | null;
  fitAfter: number | null;
};
export type Changes = {
  quarterBefore: string | null;
  quarterAfter: string | null;
  opportunity: { before: string | null; after: string | null } | null;
  health: { before: string | null; after: string | null } | null;
  theme: { before: string | null; after: string | null } | null;
  metrics: MetricChange[];
  products: ProductChange[];
  newNews: NewsItem[];
};

function priority(p: Product | undefined) {
  const n = Number(p?.pri);
  return n >= 1 && n <= 3 ? n : null;
}

function theme(d: Dashboard) {
  return d.finOverview?.salesTheme?.replace(/^\s*PRIMARY SALES THEME:\s*/i, "").trim() || null;
}

function changed<T>(before: T | null | undefined, after: T | null | undefined) {
  return (before ?? null) !== (after ?? null) ? { before: before ?? null, after: after ?? null } : null;
}

export function compareDashboards(before: Dashboard, after: Dashboard): Changes {
  const oldMetrics = new Map((before.metrics ?? []).filter((m) => m.l).map((m) => [m.l!, m]));
  const metrics: MetricChange[] = (after.metrics ?? [])
    .filter((m) => m.l)
    .map((m) => ({ label: m.l!, before: oldMetrics.get(m.l!)?.v ?? null, after: m.v ?? null, asOf: m.s ?? null }));

  const oldProducts = new Map((before.products ?? []).filter((p) => p.name).map((p) => [p.name!, p]));
  const newProducts = new Map((after.products ?? []).filter((p) => p.name).map((p) => [p.name!, p]));
  const products: ProductChange[] = [...new Set([...oldProducts.keys(), ...newProducts.keys()])]
    .map((name) => {
      const b = oldProducts.get(name), a = newProducts.get(name);
      return {
        name,
        before: priority(b), after: priority(a),
        fitBefore: b?.fit ?? null, fitAfter: a?.fit ?? null,
      };
    })
    .filter((p) => p.before !== p.after || p.fitBefore !== p.fitAfter)
    .sort((x, y) => (x.after ?? 9) - (y.after ?? 9) || (y.fitAfter ?? 0) - (x.fitAfter ?? 0));

  const oldHeadlines = new Set((before.news?.items ?? []).map((n) => n.title));
  const newNews = (after.news?.items ?? []).filter((n) => n.title && !oldHeadlines.has(n.title));

  return {
    quarterBefore: before.meta?.latestQuarter ?? null,
    quarterAfter: after.meta?.latestQuarter ?? null,
    opportunity: changed(before.meta?.opportunity, after.meta?.opportunity),
    health: changed(before.healthRating, after.healthRating),
    theme: changed(theme(before), theme(after)),
    metrics,
    products,
    newNews,
  };
}
