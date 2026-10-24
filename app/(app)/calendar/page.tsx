import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import {
  addDays, EVENT_COLUMNS, formatDay, kindLabel, needsRefresh, todayISO, type EarningsEvent,
} from "@/lib/earnings";
import { followedSlugs } from "@/lib/follows";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Earnings calendar" };

type Props = { searchParams: Promise<{ view?: string }> };

// Monday of the week containing `iso`.
function weekStart(iso: string) {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -((day + 6) % 7));
}

const STATUS_LABEL: Record<EarningsEvent["status"], string> = {
  reported: "Reported",
  scheduled: "Confirmed",
  estimated: "Estimated",
};

export default async function CalendarPage({ searchParams }: Props) {
  const { view } = await searchParams;
  const onlyMine = view === "following";
  const viewer = await requireViewer();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: events }, { data: institutions }, { data: summaries }, followed] = await Promise.all([
    supabase.from("earnings_events").select(EVENT_COLUMNS)
      .gte("event_date", addDays(today, -30)).lte("event_date", addDays(today, 150)).order("event_date"),
    supabase.from("institutions").select("slug, name"),
    supabase.from("institution_summaries").select("slug, researched_at"),
    followedSlugs(viewer.id),
  ]);

  const names = new Map((institutions ?? []).map((i) => [i.slug as string, i.name as string]));
  const researched = new Map((summaries ?? []).map((s) => [s.slug as string, s.researched_at as string]));
  const rows = ((events ?? []) as EarningsEvent[]).filter((e) => !onlyMine || followed.has(e.slug));

  const weeks = new Map<string, EarningsEvent[]>();
  for (const e of rows) {
    const w = weekStart(e.event_date);
    weeks.set(w, [...(weeks.get(w) ?? []), e]);
  }
  const thisWeek = weekStart(today);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Earnings calendar</h1>
          <p>
            When each institution publishes its quarterly results, from 30 days ago to five months ahead. Public banks
            hold earnings releases; credit unions and private banks file regulatory call reports instead.
          </p>
        </div>
        <div className="segmented">
          <Link href="/calendar" className={onlyMine ? "" : "active"}>All</Link>
          <Link href="/calendar?view=following" className={onlyMine ? "active" : ""}>Following ({followed.size})</Link>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="panel"><p>Nothing to show. {onlyMine && <>Follow some banks with ☆ to see their dates here.</>}</p></div>
      )}

      {[...weeks.entries()].map(([week, list]) => (
        <section key={week} className={`panel week${week === thisWeek ? " current" : ""}`}>
          <h2>
            Week of {formatDay(week)}
            {week === thisWeek && <span className="badge role">This week</span>}
          </h2>
          <div className="table-wrap flat">
            <table className="calendar">
              <tbody>
                {list.map((e) => (
                  <tr key={`${e.slug}-${e.period}`} className={e.event_date < today ? "past" : undefined}>
                    <td className="when">{formatDay(e.event_date)}</td>
                    <td className="name-cell">
                      <Link href={`/banks/${e.slug}`}>{names.get(e.slug) ?? e.slug}</Link>
                      {followed.has(e.slug) && <span className="star" aria-label="Following"> ★</span>}
                    </td>
                    <td>{e.period}</td>
                    <td className="dim">{kindLabel(e.kind)}</td>
                    <td>
                      <span className={`badge status-${e.status}`}>{STATUS_LABEL[e.status]}</span>
                      {needsRefresh(e, researched.get(e.slug) ?? null) && <span className="badge medium">Dashboard out of date</span>}
                    </td>
                    <td className="dim">
                      {e.note}
                      {e.source_url && <> <a href={e.source_url} target="_blank" rel="noreferrer">Source ↗</a></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
