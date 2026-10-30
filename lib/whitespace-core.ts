// Statuses, quarters and money for whitespace: safe to use in the browser
// (no catalogue). lib/whitespace.ts adds the product logic.

export const STATUSES = {
  validated: { label: "Validated whitespace", short: "Validated", code: "V", group: "pursuit" },
  in_play: { label: "In play", short: "In play", code: "IP", group: "pipeline" },
  lost_pipeline: { label: "Recently lost: pipeline", short: "Lost pipeline", code: "LP", group: "avoid" },
  lost_renewal: { label: "Recently lost: renewal", short: "Lost renewal", code: "LR", group: "avoid" },
  client: { label: "Current client", short: "Client", code: "C", group: "client" },
  not_fit: { label: "Not a fit", short: "Not a fit", code: "✕", group: "dismissed" },
} as const;
export type Status = keyof typeof STATUSES;
export const STATUS_KEYS = Object.keys(STATUSES) as Status[];
export const isStatus = (s: string): s is Status => s in STATUSES;

// How long a loss keeps a product off the pursuit list.
export const LOST_WINDOW_MONTHS: Partial<Record<Status, number>> = { lost_pipeline: 12, lost_renewal: 24 };

export type WhitespaceRow = {
  slug: string; product_slug: string; status: Status; target_quarter: string | null; acv_usd: number | null;
  lost_on: string | null; note: string | null; updated_by: string | null; updated_at: string; is_demo: boolean;
};
export const WHITESPACE_COLUMNS = "slug, product_slug, status, target_quarter, acv_usd, lost_on, note, updated_by, updated_at, is_demo";

// ---- Calendar quarters ("2027-Q1")

export function quarterOf(d: Date) {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}
export function addQuarters(q: string, n: number) {
  const [y, k] = [Number(q.slice(0, 4)), Number(q.slice(6))];
  const i = y * 4 + (k - 1) + n;
  return `${Math.floor(i / 4)}-Q${(i % 4) + 1}`;
}
// First and last day of a quarter, as ISO dates.
export function quarterStart(q: string) {
  return `${q.slice(0, 4)}-${String((Number(q.slice(6)) - 1) * 3 + 1).padStart(2, "0")}-01`;
}
export function quarterEnd(q: string) {
  const y = Number(q.slice(0, 4)), k = Number(q.slice(6));
  return new Date(Date.UTC(y, k * 3, 0)).toISOString().slice(0, 10);
}
export function quarterOptions(today = new Date(), ahead = 7) {
  const now = quarterOf(today);
  return Array.from({ length: ahead + 1 }, (_, i) => addQuarters(now, i));
}
export const formatQuarter = (q: string | null | undefined) => (q ? `${q.slice(5)} ${q.slice(0, 4)}` : "");

// ---- Money: ACV in US dollars

export function formatUsd(n: number | null | undefined) {
  if (n == null) return "";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
// "250k", "$1.2m", "250,000", "300" (thousands) -> dollars; null if blank; NaN if unreadable.
export function parseUsd(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!m) return NaN;
  // A bare number under 1,000 is read as thousands: an ACV of $300 is never meant.
  const unit = m[2] === "m" ? 1e6 : m[2] === "k" || Number(m[1]) < 1000 ? 1e3 : 1;
  return Math.round(Number(m[1]) * unit);
}

// ---- Lost deals expire: after the window they are eligible again.

export function monthsAgo(date: string, today = new Date()) {
  const d = new Date(`${date}T00:00:00Z`);
  return (today.getUTCFullYear() - d.getUTCFullYear()) * 12 + (today.getUTCMonth() - d.getUTCMonth());
}
export function lostExpired(row: Pick<WhitespaceRow, "status" | "lost_on">, today = new Date()) {
  const window = LOST_WINDOW_MONTHS[row.status];
  return Boolean(window && row.lost_on && monthsAgo(row.lost_on, today) >= window);
}


// Validated and in-play opportunity, summed (the two series every chart shows).
export type Pair = { validated: number; inPlay: number; vCount: number; ipCount: number };
export const emptyPair = (): Pair => ({ validated: 0, inPlay: 0, vCount: 0, ipCount: 0 });
export function addToPair(p: Pair, status: string, acv: number | null) {
  if (status === "validated") { p.validated += Number(acv ?? 0); p.vCount++; }
  if (status === "in_play") { p.inPlay += Number(acv ?? 0); p.ipCount++; }
  return p;
}

// ---- Converting a pursuit: the moves offered on each pursuit, in order.
export const CONVERSIONS: Partial<Record<Status, { to: Status; label: string }[]>> = {
  validated: [
    { to: "in_play", label: "Move to pipeline" },
    { to: "client", label: "Won" },
    { to: "lost_pipeline", label: "Lost" },
    { to: "not_fit", label: "Not a fit" },
  ],
  in_play: [
    { to: "client", label: "Won" },
    { to: "lost_pipeline", label: "Lost" },
  ],
};
