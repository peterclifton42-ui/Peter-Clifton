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
import { nextPlays } from "@/lib/plays";
import { unconfirmedGap } from "@/lib/products";
import type { InsightInput } from "@/lib/insights";
import { PlayList } from "./plays";
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
  // Plays come from the book (and team), else the banks followed, else the market's HIGH-opportunity banks.
  const playSlugs = wsSlugs.length ? wsSlugs : followed.size ? [...followed] : all.filter((i) => i.opportunity === "HIGH").map((i) => i.slug);
  const [{ data: research }, { data: wsRows }] = playSlugs.length
    ? await Promise.all([
      supabase.from("insight_inputs").select("slug, name, category, assets_b, products, dnr_products").in("slug", playSlugs),
      supabase.from("whitespace").select(WHITESPACE_COLUMNS).in("slug", playSlugs),
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
  const plays = nextPlays((research ?? []) as InsightInput[], allWs, 3);
  const playSource = wsSlugs.length ? "your book" : followed.size ? "the banks you follow" : "high-opportunity banks";

  // Everything else worth doing now, most time-sensitive first.
  type Action = { kind: "prep" | "refresh" | "warn" | "info" | "good" | "check"; label: string; text: string; href: string };
  const actions: Action[] = [];
  for (const e of evs.filter((e) => followed.has(e.slug) && e.kind === "earnings" && e.status !== "reported" && e.event_date >= today && e.event_date <= addDays(today, 7))) {
    actions.push({ kind: "prep", label: "Prep", text: `${bySlug.get(e.slug)?.name ?? e.slug} reports ${e.period} on ${formatDay(e.event_date)}: brush up before the call`, href: `/banks/${e.slug}` });
  }
  for (const st of book.steps.slice(0, 3)) actions.push({ kind: st.tone, label: "Whitespace", text: st.text, href: st.href });
  // Strong fits held at P3 only because one fact wasn't confirmed: worth asking about.
  for (const r of ((research ?? []) as InsightInput[])) {
    for (const dp of r.products ?? []) {
      const gap = (dp.fit ?? 0) >= 70 && Number(dp.pri) === 3 ? unconfirmedGap(dp) : null;
      if (gap && actions.filter((a) => a.kind === "check").length < 2) {
        actions.push({ kind: "check", label: "Check", text: `${r.name}: ${dp.name} fits at ${dp.fit} but needs confirming ${gap}`, href: `/banks/${r.slug}` });
      }
    }
  }
  for (const e of stale.filter((e) => followed.has(e.slug)).slice(0, 2)) {
    actions.push({ kind: "refresh", label: "Update", text: `${bySlug.get(e.slug)?.name ?? e.slug} reported ${e.period}; its dashboard isn't updated yet. Request a full refresh`, href: `/banks/${e.slug}` });
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{firstName ? `Hello, ${firstName}` : "Your briefing"}</h1>
          <p>{formatDay(today)} · what&apos;s happening at the banks you follow, and across the market.</p>
        </div>
      </div>

      <section className="nba">
        <div className="panel nba-plays">
          <div className="panel-head">
            <h2>Your next best plays</h2>
            <Link href="/products#plays">See all plays →</Link>
          </div>
          <p className="dim">Products the research rates priority 1 or 2 at {playSource}, not yet reviewed in Whitespace.</p>
          {plays.length ? <PlayList plays={plays} compact /> : (
            <p className="dim">Nothing waiting: every research-backed product at your banks has a status. <Link href="/whitespace">Open Whitespace →</Link></p>
          )}
          {!wsSlugs.length && <p className="dim small">Mark banks as <b>My account</b> on their page to base this on your own book.</p>}
        </div>
        <div className="panel nba-todo">
          <h2>Also on your plate</h2>
          {actions.length === 0 ? <p className="dim">Nothing time-sensitive at your banks right now.</p> : (
            <ul className="todo">
              {actions.slice(0, 6).map((a, i) => (
                <li key={i} className={`todo-${a.kind}`}>
                  <span className="todo-label">{a.label}</span>
                  <Link href={a.href}>{a.text} →</Link>
                </li>
              ))}
            </ul>
          )}
          <nav className="nba-links" aria-label="Go to">
            <Link href="/products">Product playbooks</Link>
            <Link href="/insights">Market insights</Link>
            <Link href="/compare">Compare peers</Link>
          </nav>
        </div>
      </section>

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
