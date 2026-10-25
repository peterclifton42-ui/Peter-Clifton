// The metric dictionary for Compare: what each figure means and where it comes
// from. Values live in regulatory_metrics, loaded by pipeline/regulatory.py.

export type MetricKey = "nim" | "deposit_cost" | "ldr" | "deposit_growth" | "efficiency" | "roa" | "assets_b" | "deposits_b";

export type MetricRow = { slug: string; period: string; source: "fdic" | "ncua" } & Record<MetricKey, number | null>;

export type MetricDef = {
  label: string;
  unit: "%" | "$B";
  decimals: number;
  better: "higher" | "lower" | null; // null = neither is "better" (size, balance)
  definition: string;
  bank: string;
  creditUnion: string;
};

export const METRICS: Record<MetricKey, MetricDef> = {
  nim: {
    label: "Net interest margin", unit: "%", decimals: 2, better: "higher",
    definition: "What the institution earns on its loans and investments after paying for deposits and borrowing.",
    bank: "FDIC call report net interest margin (net interest income ÷ average earning assets), weighted across the holding company's banks by earning assets.",
    creditUnion: "NCUA 5300: (interest income − interest expense) ÷ total assets, annualised. NCUA measures margin against assets, so a credit union's figure reads slightly lower than a bank's would.",
  },
  deposit_cost: {
    label: "Cost of deposits", unit: "%", decimals: 2, better: "lower",
    definition: "Interest paid on deposits as a share of all deposits, including those that pay nothing. A direct read on deposit pricing pressure.",
    bank: "FDIC call report interest expense on deposits, year to date and annualised, ÷ total deposits.",
    creditUnion: "NCUA 5300: dividends on shares plus interest on deposits, year to date and annualised, ÷ total shares and deposits.",
  },
  ldr: {
    label: "Loan-to-deposit", unit: "%", decimals: 1, better: null,
    definition: "Loans as a share of deposits (loan-to-share for credit unions). High means funding is tight and deposit gathering matters; low means spare liquidity to lend.",
    bank: "FDIC call report net loans and leases ÷ total deposits.",
    creditUnion: "NCUA 5300: total loans and leases ÷ total shares and deposits (loan-to-share).",
  },
  deposit_growth: {
    label: "Deposit growth (1 yr)", unit: "%", decimals: 1, better: "higher",
    definition: "Change in total deposits against the same quarter a year earlier. Reported growth: it includes acquisitions and charter mergers.",
    bank: "FDIC call report total deposits, summed across the holding company's current banks.",
    creditUnion: "NCUA 5300 total shares and deposits.",
  },
  efficiency: {
    label: "Efficiency ratio", unit: "%", decimals: 1, better: "lower",
    definition: "Operating costs per dollar of revenue. Lower is leaner; a high ratio points to cost pressure and appetite for productivity tools.",
    bank: "FDIC call report efficiency ratio (non-interest expense ÷ net interest income plus non-interest income), weighted by revenue.",
    creditUnion: "NCUA 5300: non-interest expense ÷ (net interest income + non-interest income).",
  },
  roa: {
    label: "Return on assets", unit: "%", decimals: 2, better: "higher",
    definition: "Profit as a share of assets, year to date and annualised.",
    bank: "FDIC call report return on assets, weighted by assets.",
    creditUnion: "NCUA 5300: net income, annualised, ÷ total assets.",
  },
  assets_b: {
    label: "Total assets", unit: "$B", decimals: 1, better: null,
    definition: "Size of the balance sheet.",
    bank: "FDIC call report total assets, summed across the holding company's banks.",
    creditUnion: "NCUA 5300 total assets.",
  },
  deposits_b: {
    label: "Total deposits", unit: "$B", decimals: 1, better: null,
    definition: "Deposits for banks; shares and deposits for credit unions.",
    bank: "FDIC call report total deposits, summed across the holding company's banks.",
    creditUnion: "NCUA 5300 total shares and deposits.",
  },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];
export const DEFAULT_METRICS: MetricKey[] = ["nim", "deposit_cost", "ldr", "deposit_growth", "efficiency"];
export const MAX_COMPARE = 6;

// Growth this large almost always means an acquisition or charter merger.
export const MERGER_GROWTH = 40;

export function formatMetric(key: MetricKey, value: number | null | undefined) {
  if (value == null) return "—";
  const m = METRICS[key];
  return m.unit === "$B" ? `$${value.toFixed(m.decimals)}B` : `${key === "deposit_growth" && value > 0 ? "+" : ""}${value.toFixed(m.decimals)}%`;
}

export function quarterLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `Q${Math.ceil(m / 3)} ${y}`;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Nearest institutions by size within the same category: a sensible starting peer set.
export function suggestPeers<T extends { slug: string; category: string; assets_b: number | null }>(slug: string, all: T[], n = 4) {
  const me = all.find((i) => i.slug === slug);
  if (!me) return [];
  return all
    .filter((i) => i.slug !== slug && i.category === me.category && i.assets_b != null)
    .sort((a, b) => Math.abs(Math.log((a.assets_b ?? 1) / (me.assets_b ?? 1))) - Math.abs(Math.log((b.assets_b ?? 1) / (me.assets_b ?? 1))))
    .slice(0, n)
    .map((i) => i.slug);
}
