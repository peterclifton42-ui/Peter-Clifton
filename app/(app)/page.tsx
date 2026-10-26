import type { Metadata } from "next";
import Link from "next/link";
import { canManage, requireViewer } from "@/lib/auth";
import {
  addDays, EVENT_COLUMNS, formatDay, latestAndNext, needsRefresh, todayISO, type EarningsEvent,
} from "@/lib/earnings";
import { bookSlugs, followedSlugs } from "@/lib/follows";
import { categoryLabel, formatAssets, INSTITUTION_COLUMNS, shortQuarter, type Institution } from "@/lib/institutions";
import { createClient } from "@/lib/supabase/server";
import { WHITESPACE_COLUMNS, bookOf, formatQuarter, formatUsd, quarterOf, totals, type WhitespaceRow } from "@/lib/whitespace";
import { loadTeam } from "@/lib/team";
import { FollowButton } from "./follow-button";

export const metadata: Metadata = { title: "Home" };

type Summary = { slug: string; sales_theme: string | null; lead_products: string[]; researched_at: string };
type News = { published_on: string; headline: string; url: string | null };

export default async function HomePage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: institutions }, { data: summaries }, { data: events }, followed, { data: newsRows }] = await Promise.all([
    supabase.from("institutions").select(INSTITUTION_COLUMNS).order("assets_b", { ascending: false }),
    supabase.from("institution_summaries").select("slug, sales_theme, lead_products, researched_at"),
    supabase.from("earnings_events").select(EVENT_COLUMNS).order("event_date"),
    followedSlugs(viewer.id),
    supabase.from("news_items").select("slug, published_on, headline, url")
      .gte("published_on", addDays(today, -14)).order("published_on", { ascending: false }),
  ]);

  const all = (institutions ?? []) as Institution[];
  const bySlug = new Map(all.map((i) => [i.slug, i]));
  const summary = new Map(((summaries ?? []) as Summary[]).map((s) => [s.slug, s]));
  const evs = (events ?? []) as EarningsEvent[];
  const timeline = latestAndNext(evs, today);
  const latestNews = new Map<string, News>();
  for (const n of (newsRows ?? []) as (News & { slug: string })[]) if (!latestNews.has(n.slug)) latestNews.set(n.slug, n);

  const mine = all.filter((i) => followed.has(i.slug));
  // Whitespace covers the seller's book (accounts marked "My account"); managers
  // also see their team's consolidated book.
  const [booked, team] = await Promise.all([bookSlugs(viewer.id), canManage(viewer) ? loadTeam(viewer.id) : Promise.resolve([])]);
  const bookBanks = all.filter((i) => booked.has(i.slug));
  const teamSlugs = [...new Set(team.flatMap((m) => m.banks))];
  const wsSlugs = [...new Set([...booked, ...teamSlugs])];
  const [{ data: research }, { data: wsRows }] = wsSlugs.length
    ? await Promise.all([
      supabase.from("insight_inputs").select("slug, products, dnr_products").in("slug", wsSlugs),
      supabase.from("whitespace").select(WHITESPACE_COLUMNS).in("slug", wsSlugs),
    ])
    : [{ data: [] }, { data: [] }];
  const allWs = (wsRows ?? []) as WhitespaceRow[];
  const teamTotals = team.length > 1 ? totals(allWs.filter((r) => teamSlugs.includes(r.slug))) : null;
  const book = bookOf({ institutions: bookBanks, research: (research ?? []) as never, rows: allWs.filter((r) => booked.has(r.slug)) });
  const suggestions = all.filter((i) => i.opportunity === "HIGH").slice(0, 6);
  const upcoming = evs.filter((e) => e.event_date >= today && e.event_date <= addDays(today, 14) && e.status !== "reported");
  const stale = evs
    .filter((e) => needsRefresh(e, summary.get(e.slug)?.researched_at ?? null))
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
  const firstName = viewer.fullName?.split(" ")[0];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{firstName ? `Hello, ${firstName}` : "Your briefing"}</h1>
          <p>{formatDay(today)} · what&apos;s happening at the banks you follow, and across the market.</p>
        </div>
      </div>

      {(bookBanks.length > 0 || teamTotals) && (
        <section className="panel">
          <div className="panel-head">
            <h2>Your whitespace</h2>
            <Link href="/whitespace">Open your book →</Link>
          </div>
          <div className="stat-row compact">
            <div className="stat"><b>{formatUsd(book.totals.validated.acv) || "$0"}</b><span>validated · {book.totals.validated.count}</span></div>
            <div className="stat"><b>{formatUsd(book.totals.inPlay.acv) || "$0"}</b><span>in play · {book.totals.inPlay.count}</span></div>
            <div className="stat"><b>{book.totals.dueThisQuarter}</b><span>due by {formatQuarter(quarterOf(new Date()))}</span></div>
            <div className="stat"><b>{book.applicable ? Math.round((book.reviewed / book.applicable) * 100) : 0}%</b><span>products reviewed</span></div>
          </div>
          {book.steps.length > 0 && (
            <ul className="next-steps">
              {book.steps.slice(0, 3).map((st, i) => <li key={i} className={st.tone}><Link href={st.href}>{st.text} →</Link></li>)}
            </ul>
          )}
          {teamTotals && (
            <p className="team-line">
              <b>Your team</b> ({team.length} sellers, {teamSlugs.length} banks): {formatUsd(teamTotals.validated.acv) || "$0"} validated ·{" "}
              {formatUsd(teamTotals.inPlay.acv) || "$0"} in play · {teamTotals.dueThisQuarter} due this quarter.{" "}
              <Link href="/whitespace?view=team">Open team view →</Link>
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Your banks ({mine.length})</h2>
        {mine.length === 0 ? (
          <>
            <p>
              You&apos;re not following any banks yet. Tap ☆ next to a bank to see it here, with its latest results
              and what to lead with. Some high-opportunity places to start:
            </p>
            <div className="cards">
              {suggestions.map((i) => (
                <BankCard key={i.slug} institution={i} summary={summary.get(i.slug)} timeline={timeline.get(i.slug)} news={latestNews.get(i.slug)} today={today} following={false} />
              ))}
            </div>
            <p><Link href="/banks">Browse all {all.length} banks and credit unions →</Link></p>
          </>
        ) : (
          <div className="cards">
            {mine.map((i) => (
              <BankCard key={i.slug} institution={i} summary={summary.get(i.slug)} timeline={timeline.get(i.slug)} news={latestNews.get(i.slug)} today={today} following />
            ))}
          </div>
        )}
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>Reporting in the next two weeks</h2>
          {upcoming.length === 0 ? <p>No results due in the next 14 days.</p> : (
            <ul className="event-list">
              {upcoming.map((e) => {
                const i = bySlug.get(e.slug);
                if (!i) return null;
                return (
                  <li key={`${e.slug}-${e.period}`} className={followed.has(e.slug) ? "mine" : undefined}>
                    <span className="when">{formatDay(e.event_date)}</span>
                    <Link href={`/banks/${e.slug}`}>{i.name}</Link>
                    {followed.has(e.slug) && <span className="star" aria-label="Following">★</span>}
                    <span className="dim">{e.period}{e.status === "estimated" ? " · estimated" : ""}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p><Link href="/calendar">Full earnings calendar →</Link></p>
        </section>

        <section className="panel">
          <h2>New results not yet in the dashboard ({stale.length})</h2>
          <p>These banks have published results since their dashboard was researched, so the figures may be out of date.</p>
          <ul className="event-list">
            {stale.slice(0, 10).map((e) => {
              const i = bySlug.get(e.slug);
              if (!i) return null;
              return (
                <li key={`${e.slug}-${e.period}`} className={followed.has(e.slug) ? "mine" : undefined}>
                  <span className="when">{formatDay(e.event_date)}</span>
                  <Link href={`/banks/${e.slug}`}>{i.name}</Link>
                  {followed.has(e.slug) && <span className="star" aria-label="Following">★</span>}
                  <span className="dim">{e.period} out · dashboard shows {shortQuarter(i.latest_quarter)}</span>
                </li>
              );
            })}
          </ul>
          {stale.length > 10 && <p><Link href="/calendar">See all {stale.length} on the calendar →</Link></p>}
        </section>
      </div>
    </main>
  );
}

type CardProps = {
  institution: Institution;
  summary: Summary | undefined;
  timeline: { latest?: EarningsEvent; next?: EarningsEvent } | undefined;
  news: News | undefined;
  today: string;
  following: boolean;
};

function BankCard({ institution: i, summary, timeline, news, today, following }: CardProps) {
  const latest = timeline?.latest;
  const next = timeline?.next;
  const outOfDate = latest && needsRefresh(latest, summary?.researched_at ?? null);
  const justUpdated = !outOfDate && summary && summary.researched_at.slice(0, 10) >= addDays(today, -7);
  return (
    <article className="card">
      <div className="card-head">
        <Link href={`/banks/${i.slug}`} className="card-title">{i.name}</Link>
        <FollowButton slug={i.slug} name={i.name} following={following} compact />
      </div>
      <div className="dim">
        {categoryLabel(i.category)} · {formatAssets(i.assets_b)}
        {i.opportunity && <> · <span className={`badge ${i.opportunity.toLowerCase()}`}>{i.opportunity}</span></>}
      </div>
      {justUpdated ? (
        <div className="status good">
          Dashboard updated {formatDay(summary.researched_at.slice(0, 10))} with {shortQuarter(i.latest_quarter)} results ·{" "}
          <Link href={`/banks/${i.slug}/changes`}>What changed</Link>
        </div>
      ) : outOfDate ? (
        <div className="status warn">{latest.period} results out {formatDay(latest.event_date)} · dashboard shows {shortQuarter(i.latest_quarter)}</div>
      ) : next ? (
        <div className="status">Next results {formatDay(next.event_date)}{next.status === "estimated" ? " (estimated)" : ""}</div>
      ) : null}
      {summary?.sales_theme && <p className="theme">{summary.sales_theme}</p>}
      {news && (
        <div className="card-news">
          <span className="dim">News {formatDay(news.published_on)}:</span>{" "}
          {news.url ? <a href={news.url} target="_blank" rel="noreferrer">{news.headline}</a> : news.headline}
        </div>
      )}
      {summary && summary.lead_products.length > 0 && (
        <div className="chips">
          <span className="dim">Lead with:</span>
          {summary.lead_products.map((p) => <span key={p} className="chip">{p}</span>)}
        </div>
      )}
    </article>
  );
}
