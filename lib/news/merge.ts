// Show news collected after a dashboard was researched (weekly job and "Refresh
// news") in the dashboard's own Recent News tab, newest first, above the news the
// research found. The stored dashboard is not changed.

type NewsRow = {
  published_on: string; headline: string; summary: string | null; source_name: string | null;
  url: string | null; tag: string | null; sales_angle: string | null; created_at: string;
};
type Card = { title?: string; url?: string; [k: string]: unknown };
type Dashboard = { news?: { items?: Card[]; intro?: string; [k: string]: unknown }; [k: string]: unknown };

// The dashboard template writes these strings into HTML, so keep markup out.
const plain = (s: string | null | undefined) => (s ?? "").replace(/[<>]/g, "").trim();

function day(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function withCollectedNews<T extends Dashboard>(data: T, rows: NewsRow[], researchedAt: string): T {
  const existing = data.news?.items ?? [];
  const seen = new Set(existing.flatMap((i) => [i.url, i.title?.toLowerCase()]).filter(Boolean));
  const fresh = rows
    .filter((r) => r.published_on >= researchedAt.slice(0, 10) || r.created_at > researchedAt)
    .filter((r) => !seen.has(r.url ?? "") && !seen.has(r.headline.toLowerCase()))
    .sort((a, b) => b.published_on.localeCompare(a.published_on))
    .map((r) => ({
      title: plain(r.headline),
      body: plain(r.summary),
      date: day(r.published_on),
      source: `${plain(r.source_name) || "News"} · added ${day(r.created_at)}`,
      url: r.url && /^https?:\/\//.test(r.url) ? r.url.replace(/"/g, "%22") : undefined,
      tag: r.tag ?? "strategy",
      salesAngle: plain(r.sales_angle) || undefined,
    }));
  if (!fresh.length) return data;
  const note = `${fresh.length} item${fresh.length === 1 ? "" : "s"} at the top ${fresh.length === 1 ? "was" : "were"} collected after this dashboard was researched (${day(researchedAt)}).`;
  return {
    ...data,
    news: { ...data.news, intro: [note, data.news?.intro].filter(Boolean).join(" "), items: [...fresh, ...existing] },
  };
}
