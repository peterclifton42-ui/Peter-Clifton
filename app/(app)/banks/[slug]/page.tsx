import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRIEF_COLUMNS, reportHref, topContacts, type Brief, type Exec } from "@/lib/brief";
import { EVENT_COLUMNS, formatDay, latestAndNext, todayISO, type EarningsEvent } from "@/lib/earnings";
import { METRICS, formatMetric, median, quarterLabel, type MetricKey, type MetricRow } from "@/lib/metrics";
import { peerSuggestions } from "@/lib/peers";
import { PRODUCTS, effectivePriority, productFor, type DashboardProduct } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { WHITESPACE_COLUMNS, formatQuarter, formatUsd, type WhitespaceRow } from "@/lib/whitespace";
import { StatusPill } from "../../whitespace/editor";
import { ClayDownload } from "../../clay-download";
import { BankBar, loadInstitution } from "./bank-bar";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const institution = await loadInstitution(slug);
  return { title: institution?.name ?? "Not found" };
}

const KEY_METRICS: MetricKey[] = ["nim", "deposit_cost", "deposit_growth", "ldr", "efficiency", "roa"];
type NewsRow = { published_on: string; headline: string; summary: string | null; source_name: string | null; url: string | null; tag: string | null; sales_angle: string | null; importance: string };
type Snapshot = {
  loaded_at: string;
  theme: string | null;
  contacts: { execs?: Exec[] } | null;
  timing: { label?: string; body?: string }[] | null;
  opportunity: string | null;
};

// The seller's first stop on a bank: where it stands, three things to do now with
// links into the full report, the official numbers against its peers, the best
// plays, who to call and the latest news. Kept current by the research jobs.
export default async function BankSummaryPage({ params }: Props) {
  const { slug } = await params;
  const institution = await loadInstitution(slug);
  if (!institution?.current_snapshot_id) notFound();

  const supabase = await createClient();
  const today = todayISO();
  const [{ data: snap }, { data: briefRow }, { data: research }, { data: ws }, { data: news }, { data: events }, peers, { data: versions }] = await Promise.all([
    supabase.from("snapshots").select("loaded_at, theme:data->finOverview->salesTheme, contacts:data->contacts, timing:data->salesTiming, opportunity:data->meta->opportunity")
      .eq("id", institution.current_snapshot_id).single(),
    supabase.from("bank_briefs").select(BRIEF_COLUMNS).eq("slug", slug).maybeSingle(),
    supabase.from("insight_inputs").select("products, dnr_products").eq("slug", slug).maybeSingle(),
    supabase.from("whitespace").select(WHITESPACE_COLUMNS).eq("slug", slug),
    supabase.from("news_items").select("published_on, headline, summary, source_name, url, tag, sales_angle, importance")
      .eq("slug", slug).order("published_on", { ascending: false }).limit(12),
    supabase.from("earnings_events").select(EVENT_COLUMNS).eq("slug", slug),
    peerSuggestions(supabase),
    supabase.from("snapshots").select("id").eq("slug", slug).limit(2),
  ]);
  if (!snap) notFound();
  const s = snap as unknown as Snapshot;
  const brief = briefRow as Brief | null;

  // Official figures: this bank's last two quarters and its peers' median in the latest one.
  const peerSlugs = (peers[slug]?.suggestions ?? []).map((p) => p.slug);
  const officialPeers = Boolean(peers[slug]?.officialSource);
  const { data: metricRows } = await supabase.from("regulatory_metrics").select("*").in("slug", [slug, ...peerSlugs])
    .order("period", { ascending: false }).limit(200);
  const rows = (metricRows ?? []) as MetricRow[];
  const mine = rows.filter((r) => r.slug === slug);
  const [now, before] = [mine[0], mine[1]];
  const peerNow = now ? rows.filter((r) => r.slug !== slug && r.period === now.period) : [];
  const compareHref = `/compare?ids=${[slug, ...peerSlugs].join(",")}&a=${slug}`;

  // Best plays: research P1/P2 that apply, with the team's status.
  const wsRows = (ws ?? []) as WhitespaceRow[];
  const ruledOut = new Set(((research?.dnr_products ?? []) as { name?: string }[]).map((d) => productFor(d.name)?.slug));
  const plays = ((research?.products ?? []) as DashboardProduct[])
    .map((dp) => ({ dp, product: productFor(dp.name) }))
    .filter((x): x is { dp: DashboardProduct; product: NonNullable<typeof x.product> } => Boolean(x.product) && !ruledOut.has(x.product!.slug))
    .map((x) => ({ ...x, pri: effectivePriority(x.product, x.dp) }))
    .filter((x) => x.pri && x.pri <= 2)
    .sort((a, b) => a.pri! - b.pri! || (b.dp.fit ?? 0) - (a.dp.fit ?? 0))
    .filter((x, i, all) => all.findIndex((y) => y.product.slug === x.product.slug) === i)
    .slice(0, 5);
  const statusOf = new Map(wsRows.map((r) => [r.product_slug, r]));
  const pursuits = wsRows.filter((r) => r.status === "validated" || r.status === "in_play");
  const clientOf = wsRows.filter((r) => r.status === "client").map((r) => PRODUCTS.find((p) => p.slug === r.product_slug)?.name ?? r.product_slug);

  const contacts = topContacts(s.contacts);
  const items = ((news ?? []) as NewsRow[]);
  const important = items.filter((n) => n.importance === "high" && n.published_on >= addDaysISO(today, -45));
  const newsList = [...important, ...items.filter((n) => !important.includes(n))].slice(0, 5);
  const { latest, next } = latestAndNext((events ?? []) as EarningsEvent[], today).get(slug) ?? {};
  const theme = s.theme?.replace(/^\s*PRIMARY SALES THEME:\s*/i, "").trim() || null;
  const briefCurrent = brief && brief.snapshot_id === institution.current_snapshot_id;
  // Without a brief yet, the dashboard's own "now" timing note stands in.
  const fallback = !brief ? s.timing?.find((t) => /now/i.test(t.label ?? "")) ?? s.timing?.[0] : null;

  return (
    <>
      <BankBar institution={institution} researchedAt={s.loaded_at} view="summary" />
      <main className="page summary-page">
        <div className="sum-hero">
          <div>
            <h1>{institution.name}</h1>
            {theme && <p className="sum-theme">{theme}</p>}
          </div>
          {s.opportunity && <span className={`badge ${s.opportunity.toLowerCase()}`}>{s.opportunity.toUpperCase()} opportunity</span>}
        </div>

        <div className="sum-grid">
          <div className="sum-col">
            <section className="panel sum-situation">
              <div className="panel-head">
                <h2>The situation now</h2>
                <span className="dim small">
                  {brief
                    ? <>Updated {formatDay(brief.written_at.slice(0, 10))}{brief.trigger === "news" ? " after news" : brief.trigger === "refresh" ? ` with ${institution.latest_quarter ? quarterName(institution.latest_quarter) : "the latest"} results` : ""}</>
                    : <>From the research of {formatDay(s.loaded_at.slice(0, 10))}</>}
                </span>
              </div>
              {brief ? brief.situation.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)
                : fallback?.body ? <p>{fallback.body}</p> : <p className="dim">The summary is written at the next refresh.</p>}
              {brief && !briefCurrent && <p className="dim small">The full report has been refreshed since; this summary updates on the next run.</p>}

              <h2 className="sum-do-head">Three things to do now</h2>
              {brief?.actions?.length ? (
                <ol className="sum-actions">
                  {brief.actions.slice(0, 3).map((a, i) => (
                    <li key={i}>
                      <b>{a.title}</b>
                      <p>{a.why}</p>
                      <Link href={reportHref(slug, a.tab, a.at)}>{a.tab ? `See ${a.tab} in the full report →` : "Open the full report →"}</Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <ol className="sum-actions">
                  {plays[0] && <li><b>Open with {plays[0].product.name}</b><p>{plays[0].dp.why ?? "The research's top-rated product here."}</p><Link href={reportHref(slug, "Product Fit & Playbook", "pp-plan")}>See the playbook in the full report →</Link></li>}
                  {contacts[0] && <li><b>Get time with {contacts[0].name}</b><p>{contacts[0].insight ?? contacts[0].relevance}</p><Link href={reportHref(slug, "Organisation & People", "op-leadership")}>See leadership in the full report →</Link></li>}
                  <li><b>Review where the bank stands</b><p>Check the latest figures against peers before the call.</p><Link href={compareHref}>Compare with peers →</Link></li>
                </ol>
              )}
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Best plays here</h2>
                <Link href={`/banks/${slug}/whitespace`}>Whitespace →</Link>
              </div>
              {pursuits.length > 0 && (
                <div className="sum-pursuits">
                  <span className="dim small">Active pursuits</span>
                  {pursuits.map((r) => (
                    <span key={r.product_slug} className={`sum-chip ws-${r.status}`}>
                      {PRODUCTS.find((p) => p.slug === r.product_slug)?.name.replace(/^Advisory: /, "") ?? r.product_slug}
                      {r.target_quarter && <em>{formatQuarter(r.target_quarter)}{r.acv_usd ? ` · ${formatUsd(r.acv_usd)}` : ""}</em>}
                    </span>
                  ))}
                </div>
              )}
            {clientOf.length > 0 && <p className="dim small">Already a client for {clientOf.join(", ")}.</p>}
              {plays.length ? (
                <ul className="sum-plays">
                  {plays.map(({ product, dp, pri }) => (
                    <li key={product.slug}>
                      <div>
                        <Link href={`/products/${product.slug}`} className="play-product">{product.name}</Link>
                        <span className={`badge pri-${pri}`}>P{pri}</span>
                        {dp.fit != null && <span className="dim small">fit {dp.fit}</span>}
                        <StatusPill status={statusOf.get(product.slug)?.status ?? null} />
                      </div>
                      {dp.why && <p className="dim">{dp.why}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="dim">The research rates no product priority 1 or 2 here right now.</p>}
              <Link href={reportHref(slug, "Product Fit & Playbook")}>Full product fit and playbook →</Link>
            </section>
          </div>
          <div className="sum-col">
            <section className="panel">
              <div className="panel-head">
                <h2>Key numbers</h2>
                {now && <span className="dim small">{quarterLabel(now.period)} call report</span>}
              </div>
              {now ? (
                <table className="sum-metrics">
                  <thead><tr><th /><th className="num">{institution.name.split(" ")[0]}</th><th className="num">Peers</th></tr></thead>
                  <tbody>
                    {KEY_METRICS.map((k) => {
                      const v = now[k], prev = before?.[k];
                      const peer = median(peerNow.map((r) => r[k]).filter((x): x is number => x != null));
                      const def = METRICS[k];
                      const vsPeer = v != null && peer != null && def.better ? (def.better === "higher" ? v - peer : peer - v) : null;
                      const move = v != null && prev != null ? v - prev : null;
                      return (
                        <tr key={k}>
                          <th scope="row" title={def.definition}>{def.label}</th>
                          <td className="num">
                            <span className={vsPeer == null ? "" : vsPeer >= 0 ? "good-text" : "bad-text"}>{formatMetric(k, v)}</span>
                            {move != null && Math.abs(move) >= 0.005 && <span className="dim sum-move" title={`Was ${formatMetric(k, prev)} in ${quarterLabel(before!.period)}`}>{move > 0 ? "▲" : "▼"}</span>}
                          </td>
                          <td className="num dim">{formatMetric(k, peer)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <p className="dim">No call report figures loaded yet.</p>}
              <p className="dim small">
                Green or red against the median of {peerNow.length} {officialPeers ? "peers from its own peer group" : "closest peers"}. ▲▼ change on the quarter before.{" "}
                <Link href={compareHref}>Compare in detail →</Link>
              </p>
            </section>

            <section className="panel sum-dates">
              <h2>Timing</h2>
              <ul>
                {latest && <li><span className="dim">Latest results</span> {latest.period} · {formatDay(latest.event_date)}</li>}
                {next && <li><span className="dim">Next results</span> {next.period} · {formatDay(next.event_date)}{next.status === "estimated" ? " (est.)" : ""}</li>}
                <li><span className="dim">Research</span> {formatDay(s.loaded_at.slice(0, 10))} · {(versions?.length ?? 0) > 1 ? <Link href={`/banks/${slug}/changes`}>What changed</Link> : "first version"}</li>
              </ul>
            </section>
            <section className="panel sum-who">
              <div className="panel-head">
                <h2>Who to call</h2>
                <Link href={reportHref(slug, "Organisation & People", "op-leadership")}>All leadership →</Link>
              </div>
              {contacts.length ? (
                <ul className="sum-people">
                  {contacts.map((c) => (
                    <li key={c.name}>
                      <b>{c.name}</b> <span className="dim">{c.title ?? c.badge}</span>
                      {(c.insight || c.relevance) && <p>{c.insight ?? c.relevance}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="dim">No named contacts in the research yet.</p>}
              <p className="dim small sum-clay">
                Find the rest of the buying group: <ClayDownload href={`/api/clay?bank=${slug}`}>download for Clay</ClayDownload> (the personas for this bank&apos;s priority 1–2 products, with its website domain).
              </p>
            </section>
          </div>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h2>Latest news</h2>
            <span>
              <Link href={`/banks/${slug}/news`}>News history</Link>{" · "}
              <Link href={reportHref(slug, "Recent News")}>News in the full report</Link>
            </span>
          </div>
          {newsList.length ? (
            <ul className="news-feed">
              {newsList.map((n, i) => (
                <li key={i} className={n.importance === "high" ? "important" : undefined}>
                  <span className="when">{formatDay(n.published_on)}</span>
                  <div>
                    {n.importance === "high" && <span className="news-flag">Important</span>}
                    {n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.headline}</a> : <b>{n.headline}</b>}
                    {n.sales_angle ? <p className="news-angle">{n.sales_angle}</p> : n.summary ? <p className="dim">{n.summary}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="dim">No news collected for this bank yet. The research's own news is in the <Link href={reportHref(slug, "Recent News")}>full report</Link>.</p>}
        </section>
      </main>
    </>
  );
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// "2026-09-30" or "Q3 2026" -> "Q3 2026"
function quarterName(q: string) {
  return /^\d{4}-\d{2}/.test(q) ? quarterLabel(q) : q;
}
