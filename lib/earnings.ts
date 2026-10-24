export type EarningsEvent = {
  slug: string;
  period: string;
  event_date: string; // YYYY-MM-DD
  kind: "earnings" | "call_report_ffiec" | "call_report_ncua";
  status: "reported" | "scheduled" | "estimated";
  source_url: string | null;
  note: string | null;
};

export const EVENT_COLUMNS = "slug, period, event_date, kind, status, source_url, note";

// Sellers are US-based, so "today" follows New York time.
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDay(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

export function kindLabel(kind: EarningsEvent["kind"]) {
  if (kind === "call_report_ncua") return "NCUA call report data";
  if (kind === "call_report_ffiec") return "FDIC call report";
  return "Earnings release";
}

// A bank's results are out but its dashboard was researched before them.
export function needsRefresh(event: EarningsEvent, researchedAt: string | null) {
  return event.status === "reported" && researchedAt != null && event.event_date > researchedAt.slice(0, 10);
}

// The most recent reported event and the next upcoming one, per institution.
export function latestAndNext(events: EarningsEvent[], today: string) {
  const bySlug = new Map<string, { latest?: EarningsEvent; next?: EarningsEvent }>();
  for (const e of [...events].sort((a, b) => a.event_date.localeCompare(b.event_date))) {
    const entry = bySlug.get(e.slug) ?? {};
    if (e.status === "reported" || e.event_date < today) entry.latest = e;
    else entry.next ??= e;
    bySlug.set(e.slug, entry);
  }
  return bySlug;
}
