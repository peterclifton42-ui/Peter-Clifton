import catalogue from "./catalogue.json";

// Curinos products from the catalogue (lib/catalogue.json, built by
// pipeline/catalogue.py), and how the names on older dashboards map to them.

export type CatalogueProduct = (typeof catalogue.products)[number];
export const PRODUCTS: CatalogueProduct[] = catalogue.products;
export const CATALOGUE_SOURCE = catalogue.source;
export const PILLAR_ORDER = ["Curinos One", "Intelligent Data", "Comparative Analytics", "Optimization Platforms", "Advisory"];

const BY_NAME = new Map(PRODUCTS.map((p) => [p.name.toLowerCase(), p]));
const BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));

// Names used by dashboards written before catalogue V4. null = retired or not a
// catalogue product, so it is left out.
const ALIASES: Record<string, string | null> = {
  "distribution optimizer -- us": "Distribution Optimizer",
  "distribution optimizer - us": "Distribution Optimizer",
  "pricing data -- retail deposits": "Pricing Data",
  "lendersbenchmark analyzer -- mortgage & consumer": "LendersBenchmark Analyzer",
  "curinos one conserve (roadmap)": "Curinos One Conserve",
  "ebenchmarkers": "eBenchmarkers - Banking",
  "strategic consulting -- pricing and distribution strategy": "Advisory: Pricing Strategy & Optimization",
  "network optimization advisory / distribution optimizer": "Advisory: Network Optimization",
  "amplero personalization optimizer": null,
};

export function productFor(name: string | undefined | null): CatalogueProduct | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (key in ALIASES) return ALIASES[key] ? BY_NAME.get(ALIASES[key]!.toLowerCase()) ?? null : null;
  return BY_NAME.get(key) ?? null;
}

export function productBySlug(slug: string) {
  return BY_SLUG.get(slug) ?? null;
}

// The catalogue's guardrails, enforced wherever a product is shown.
export function statusLabel(p: CatalogueProduct): { label: string; tone: "ok" | "warn" | "info" } | null {
  if (p.status === "roadmap") return { label: "Roadmap — not yet available", tone: "warn" };
  if (p.status === "unlisted") return { label: "Availability to be confirmed", tone: "warn" };
  if (p.countries === "UK") return { label: "UK only", tone: "info" };
  return null;
}

// ---- What a seller needs from a catalogue section: the value, when it fits and
// the hooks. Scoring mechanics and internal notes are left out.

export type Block = { kind: "para"; text: string } | { kind: "list"; title: string | null; items: string[] };

const SKIP_LABELS = /^(URL|Pillar|Min assets|Institution types|Maturity|Floor|Gate|Scoring need metrics?|Timing themes|Required segments?|Required function|Functions required|Country|Countries|Size|Status)\b/i;
const SKIP_TEXT = /\bV3\b|score_v4|`[a-z_]+`|\(C[0-9]\)|capped at P[0-9]|Section [A-Z]/;

export function sellerBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let list: { kind: "list"; title: string | null; items: string[] } | null = null;
  const flush = () => { if (list && list.items.length) blocks.push(list); list = null; };

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("|") || line.startsWith("#")) { flush(); continue; }
    if (/^[-*] /.test(line)) {
      const item = line.slice(2).trim();
      if (SKIP_TEXT.test(item)) continue;
      if (!list) list = { kind: "list", title: null, items: [] };
      list.items.push(item);
      continue;
    }
    flush();
    const heading = line.match(/^\*\*([^*]+?):?\*\*:?\s*$/);
    if (heading) {
      if (SKIP_LABELS.test(heading[1])) continue;
      list = { kind: "list", title: heading[1].replace(/:$/, ""), items: [] };
      continue;
    }
    // "**Label**: text · **Label**: text" lines: keep the parts sellers use.
    const parts = line.split(" · ").filter((part) => {
      const label = part.match(/^\*\*([^*]+)\*\*/)?.[1] ?? "";
      return !SKIP_LABELS.test(label) && !SKIP_TEXT.test(part);
    });
    if (parts.length) blocks.push({ kind: "para", text: parts.join(" · ") });
  }
  flush();
  return blocks;
}

// Renders **bold** inside catalogue text.
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t) =>
    t.startsWith("**") ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false });
}

// ---- One product as it appears on one institution's dashboard.

export type DashboardProduct = {
  name?: string; cat?: string; pri?: number | string; fit?: number;
  what?: string; why?: string; need?: string; talk?: string; time?: string; roi?: string;
  use?: string[]; objections?: { q?: string; a?: string }[];
};

export function priority(p: DashboardProduct) {
  const n = Number(p.pri);
  return n >= 1 && n <= 3 ? n : null;
}

// Priority after the catalogue's caps, which older dashboards may predate:
// roadmap and unlisted products go no higher than P3, and a UK-only product is
// never recommended to a US institution.
export function effectivePriority(product: CatalogueProduct, dp: DashboardProduct) {
  const pri = priority(dp);
  if (pri == null || product.countries === "UK") return null;
  return product.status === "roadmap" || product.status === "unlisted" ? Math.max(pri, 3) : pri;
}
