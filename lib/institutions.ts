export type Institution = {
  slug: string;
  name: string;
  category: "bank" | "credit_union";
  type_label: string | null;
  ticker: string | null;
  hq: string | null;
  assets_b: number | null;
  latest_quarter: string | null;
  opportunity: string | null;
  updated_at: string;
};

export const INSTITUTION_COLUMNS =
  "slug, name, category, type_label, ticker, hq, assets_b, latest_quarter, opportunity, updated_at";

export function categoryLabel(category: Institution["category"]) {
  return category === "credit_union" ? "Credit union" : "Bank";
}

export function formatAssets(assetsB: number | null) {
  if (assetsB == null) return "–";
  return `$${assetsB.toFixed(1)}B`;
}

// Quarters arrive as "Q2 2026" or with a note, e.g. "Q2 2026 (NCUA 5300, 30 Jun 2026)".
export function shortQuarter(quarter: string | null) {
  return quarter?.replace(/\s*\(.*\)\s*$/, "") ?? "–";
}
