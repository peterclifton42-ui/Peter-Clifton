import { DASHBOARD_TABS } from "./dashboard-tabs";

// The seller summary for one institution (table bank_briefs), written by the
// research jobs: the situation now and three things to do, each pointing at the
// part of the full report that backs it up.

export type BriefAction = { title: string; why: string; tab?: string | null; at?: string | null };
export type Brief = {
  slug: string; situation: string; actions: BriefAction[];
  trigger: "refresh" | "news" | "backfill"; snapshot_id: number | null; news_through: string | null; written_at: string;
};
export const BRIEF_COLUMNS = "slug, situation, actions, trigger, snapshot_id, news_through, written_at";

// A link into the full report, opened on the action's tab and section.
export function reportHref(slug: string, tab?: string | null, at?: string | null) {
  if (!tab || !(DASHBOARD_TABS as readonly string[]).includes(tab)) return `/banks/${slug}/report`;
  const q = new URLSearchParams({ tab });
  if (at) q.set("at", at);
  return `/banks/${slug}/report?${q.toString()}`;
}

export type Exec = { name?: string; title?: string; badge?: string; insight?: string; relevance?: string; products?: string };

// The people worth calling first: named executives with a sales angle, CEO/CFO/treasury first.
export function topContacts(contacts: { execs?: Exec[] } | null | undefined, n = 3) {
  const execs = (contacts?.execs ?? []).filter((e) => e.name && (e.insight || e.relevance));
  const rank = (e: Exec) => {
    const t = `${e.badge ?? ""} ${e.title ?? ""}`.toLowerCase();
    if (/\bcfo\b|finance/.test(t)) return 0;
    if (/treasur|deposit|retail|consumer/.test(t)) return 1;
    if (/\bceo\b|president/.test(t)) return 2;
    if (/chair/.test(t)) return 9;
    return 5;
  };
  return [...execs].sort((a, b) => rank(a) - rank(b)).slice(0, n);
}
