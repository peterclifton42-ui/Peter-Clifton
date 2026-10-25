import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { renderDashboard } from "@/lib/dashboard";
import { addDays, EVENT_COLUMNS, formatDay, latestAndNext, needsRefresh, todayISO, type EarningsEvent } from "@/lib/earnings";
import { followedSlugs } from "@/lib/follows";
import { categoryLabel, formatAssets, shortQuarter, INSTITUTION_COLUMNS, type Institution } from "@/lib/institutions";
import { createClient } from "@/lib/supabase/server";
import { suggestPeers } from "@/lib/metrics";
import { withCollectedNews } from "@/lib/news/merge";
import { AskDrawer } from "../../ask/ask-chat";
import { RefreshNewsButton, RequestRefreshButton } from "./bank-actions";
import { FollowButton } from "../../follow-button";

type Props = { params: Promise<{ slug: string }> };

async function loadInstitution(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("institutions")
    .select(`${INSTITUTION_COLUMNS}, current_snapshot_id`)
    .eq("slug", slug)
    .maybeSingle();
  return data as (Institution & { current_snapshot_id: number | null }) | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const institution = await loadInstitution(slug);
  return { title: institution?.name ?? "Not found" };
}

export default async function BankPage({ params }: Props) {
  const { slug } = await params;
  const institution = await loadInstitution(slug);
  if (!institution?.current_snapshot_id) notFound();

  const viewer = await requireViewer();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: snapshot }, { data: events }, followed, { count: versions }, { data: news }, { data: all }, { count: newsTotal }, { data: requests }, { data: collected }] = await Promise.all([
    supabase.from("snapshots").select("data, loaded_at").eq("id", institution.current_snapshot_id).single(),
    supabase.from("earnings_events").select(EVENT_COLUMNS).eq("slug", slug),
    followedSlugs(viewer.id),
    supabase.from("snapshots").select("id", { count: "exact", head: true }).eq("slug", slug),
    supabase.from("news_items").select("published_on, headline, source_name, url").eq("slug", slug)
      .gte("published_on", addDays(today, -30)).order("published_on", { ascending: false }).limit(3),
    supabase.from("institutions").select("slug, category, assets_b"),
    supabase.from("news_items").select("id", { count: "exact", head: true }).eq("slug", slug),
    supabase.from("refresh_requests").select("requested_by, requested_at").eq("slug", slug).is("fulfilled_at", null)
      .order("requested_at").limit(1),
    supabase.from("news_items").select("published_on, headline, summary, source_name, url, tag, sales_angle, created_at")
      .eq("slug", slug).order("published_on", { ascending: false }).limit(30),
  ]);
  const request = requests?.[0] ? { byYou: requests[0].requested_by === viewer.id, at: requests[0].requested_at as string } : null;
  if (!snapshot) notFound();
  const { latest, next } = latestAndNext((events ?? []) as EarningsEvent[], today).get(slug) ?? {};
  const outOfDate = latest && needsRefresh(latest, snapshot.loaded_at);

  const html = await renderDashboard(withCollectedNews(snapshot.data, collected ?? [], snapshot.loaded_at));

  return (
    <>
      <div className="bank-bar">
        <Link href="/banks">← All banks</Link>
        <FollowButton slug={slug} name={institution.name} following={followed.has(slug)} />
        <span className="meta">
          {categoryLabel(institution.category)} · {formatAssets(institution.assets_b)} assets · data to{" "}
          {shortQuarter(institution.latest_quarter)} · researched{" "}
          {new Date(snapshot.loaded_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        {outOfDate ? (
          <>
            <span className="badge medium">{latest.period} results out {formatDay(latest.event_date)} · not yet in this dashboard</span>
            <RequestRefreshButton slug={slug} requested={request} />
          </>
        ) : next ? (
          <span className="meta">Next results {formatDay(next.event_date)}{next.status === "estimated" ? " (estimated)" : ""}</span>
        ) : null}
        {(versions ?? 0) > 1 && <Link href={`/banks/${slug}/changes`}>What changed since the last version →</Link>}
        <Link href={`/compare?ids=${[slug, ...suggestPeers(slug, all ?? [])].join(",")}`}>Compare with peers →</Link>
        <AskDrawer context={{ kind: "bank", slug, name: institution.name }} />
      </div>
      <div className="news-strip">
        <span className="dim">{news && news.length > 0 ? "Latest news" : "No news in the last 30 days"}</span>
        {(news ?? []).map((n) => (
          <span key={n.headline}>
            <span className="dim">{formatDay(n.published_on)}</span>{" "}
            {n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.headline}</a> : n.headline}
          </span>
        ))}
        <RefreshNewsButton slug={slug} />
        {(newsTotal ?? 0) > 0 && <Link href={`/banks/${slug}/news`}>All news ({newsTotal}) →</Link>}
      </div>
      {/* The dashboard runs in a sandbox with no access to this page or the login session. */}
      <iframe
        className="dashboard-frame"
        title={`${institution.name} dashboard`}
        srcDoc={html}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      />
    </>
  );
}
