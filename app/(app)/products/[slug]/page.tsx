import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManage, requireViewer } from "@/lib/auth";
import { bookSlugs, followedSlugs } from "@/lib/follows";
import { loadTeam } from "@/lib/team";
import { formatAssets } from "@/lib/institutions";
import { INSIGHT_COLUMNS, inScope, parseScope, type InsightInput } from "@/lib/insights";
import { firstSentence, productSummaries, resonance, type Target } from "@/lib/plays";
import { CATALOGUE_SOURCE, boldParts, effectivePriority, productBySlug, productFor, sellerBlocks, statusLabel, unconfirmedGap } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { STATUS_KEYS, WHITESPACE_COLUMNS, formatQuarter, formatUsd, lostExpired, type WhitespaceRow } from "@/lib/whitespace";
import { StatusPill } from "../../whitespace/editor";
import { AskDrawer } from "../../ask/ask-chat";
import { ScopeTabs } from "../../scope-tabs";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ scope?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: productBySlug((await params).slug)?.name ?? "Product" };
}

function Rich({ text }: { text: string }) {
  return <>{boldParts(text).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}</>;
}

function CallList({ targets, followed, start = 1 }: { targets: Target[]; followed: Set<string>; start?: number }) {
  return (
    <ol className="call-list" start={start}>
      {targets.map(({ r, dp, pri }) => (
        <li key={r.slug}>
          <div className="call-row">
            <Link href={`/banks/${r.slug}`} className="call-bank">{r.name}</Link>
            {followed.has(r.slug) && <span className="star-on" title="You follow this bank">★</span>}
            <span className={`badge pri-${pri}`}>P{pri}</span>
            {typeof dp.fit === "number" && (
              <span className="fit" title={`Fit score ${dp.fit} of 100`}><span className="fit-bar"><i style={{ width: `${dp.fit}%` }} /></span>{dp.fit}</span>
            )}
            <span className="dim call-size">{formatAssets(r.assets_b)}</span>
          </div>
          {dp.why && <p className="call-why">{firstSentence(dp.why, 170)}</p>}
          {(dp.talk || (dp.why && dp.why.length > 170)) && (
            <details className="play-talk">
              <summary>Why now and what to say</summary>
              {dp.why && <p>{dp.why}</p>}
              {dp.talk && <p className="talk">“{dp.talk}”</p>}
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

export default async function ProductPage({ params, searchParams }: Props) {
  const product = productBySlug((await params).slug);
  if (!product) notFound();
  const viewer = await requireViewer();
  const scope = parseScope((await searchParams).scope);
  const supabase = await createClient();
  const [{ data }, followed, { data: wsData }] = await Promise.all([
    supabase.from("insight_inputs").select(INSIGHT_COLUMNS),
    followedSlugs(viewer.id),
    supabase.from("whitespace").select(WHITESPACE_COLUMNS).eq("product_slug", product.slug),
  ]);
  const rows = inScope((data ?? []) as InsightInput[], scope, followed);
  const summary = productSummaries(rows, (wsData ?? []) as WhitespaceRow[]).find((s) => s.product.slug === product.slug)!;
  const top = summary.targets;
  const p3 = rows.flatMap((r) => {
    const dp = (r.products ?? []).find((p) => productFor(p.name)?.slug === product.slug);
    return dp && effectivePriority(product, dp) === 3 ? [{ r, dp, gap: (dp.fit ?? 0) >= 60 ? unconfirmedGap(dp) : null }] : [];
  }).sort((a, b) => Number(Boolean(b.gap)) - Number(Boolean(a.gap)) || (b.dp.fit ?? 0) - (a.dp.fit ?? 0));
  const checks = p3.filter((e) => e.gap);
  const gated = rows.flatMap((r) => {
    const d = (r.dnr_products ?? []).find((p) => productFor(p.name)?.slug === product.slug);
    return d ? [{ r, reason: d.reason ?? "" }] : [];
  });
  const themes = resonance(top.map((t) => t.r), rows, 5);
  const objections = new Map<string, { q: string; a: string; slug: string; name: string }>();
  for (const { r, dp } of top) {
    for (const o of dp.objections ?? []) {
      if (o.q && o.a && !objections.has(o.q.toLowerCase())) objections.set(o.q.toLowerCase(), { q: o.q, a: o.a, slug: r.slug, name: r.name });
    }
  }

  // Whitespace for this product: across the seller's book, and across the team.
  const ws = ((wsData ?? []) as WhitespaceRow[]).filter((w) => !lostExpired(w));
  const names = new Map((data ?? []).map((r) => [r.slug as string, r.name as string]));
  const [booked, team] = await Promise.all([bookSlugs(viewer.id), canManage(viewer) ? loadTeam(viewer.id) : Promise.resolve([])]);
  const teamBanks = new Set(team.flatMap((m) => m.banks));
  const teamHere = ws.filter((w) => teamBanks.has(w.slug) && (w.status === "validated" || w.status === "in_play"));
  const inBook = ws.filter((w) => booked.has(w.slug)).sort((a, b) => STATUS_KEYS.indexOf(a.status) - STATUS_KEYS.indexOf(b.status));
  const yours = top.filter((t) => booked.has(t.r.slug) || followed.has(t.r.slug));
  const status = statusLabel(product);
  const blocks = sellerBlocks(product.body);
  const maxTheme = Math.max(1, ...themes.map((t) => t.banks));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="crumb"><Link href="/products">Products</Link> · {product.pillar}</p>
          <h1>{product.name}</h1>
          {status && <p><span className={`badge status-${status.tone}`}>{status.label}</span></p>}
          {summary.value && <p className="pb-value-lg">{summary.value}</p>}
        </div>
        <AskDrawer context={{ kind: "product", slug: product.slug, name: product.name }} />
      </div>
      {product.status === "roadmap" && (
        <div className="notice error">Coming soon on curinos.com and not yet available to buy. Mention it only as direction of travel, after an available product is in play.</div>
      )}
      {product.status === "unlisted" && (
        <div className="notice error">No longer listed on curinos.com. Confirm availability with Product Marketing before proposing it.</div>
      )}
      <ScopeTabs path={`/products/${product.slug}`} scope={scope} />

      <div className="stat-row compact">
        <div className="stat"><b>{top.length}<span className="of"> of {rows.length}</span></b><span>need it · priority 1 at {summary.p1}, 2 at {summary.p2}</span></div>
        <div className="stat"><b>{summary.avgFit ?? "–"}</b><span>average fit score</span></div>
        <div className="stat"><b>{yours.length}</b><span>of them are your banks</span></div>
        <div className="stat"><b>{formatUsd(summary.pipeline) || "$0"}</b><span>pipeline · {summary.pursuits} {summary.pursuits === 1 ? "pursuit" : "pursuits"}{team.length > 1 && teamHere.length ? ` (${teamHere.length} your team's)` : ""}</span></div>
      </div>

      <div className="product-layout">
        <section className="panel">
          <h2>Who to call</h2>
          {top.length === 0 ? <p className="dim">No institution in this group ranks it as priority 1 or 2.</p> : (
            <CallList targets={top.slice(0, 12)} followed={followed} />
          )}
          {top.length > 12 && (
            <details className="more-calls">
              <summary>Show the other {top.length - 12}</summary>
              <CallList targets={top.slice(12)} followed={followed} start={13} />
            </details>
          )}
          {checks.length > 0 && (
            <div className="check-list">
              <h3>Worth checking ({checks.length})</h3>
              <p className="dim">Strong fits held at priority 3 only because the research couldn&apos;t confirm one fact. Confirm it on the call and they&apos;re live.</p>
              <ul className="plain">
                {checks.map(({ r, dp, gap }) => (
                  <li key={r.slug}>
                    <Link href={`/banks/${r.slug}`}>{r.name}</Link> <span className="badge medium">Fit {dp.fit}</span>
                    <span className="dim"> Check {gap}.</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p3.length > checks.length && (
            <details>
              <summary>Priority 3 ({p3.length - checks.length})</summary>
              <ul className="plain">{p3.filter((e) => !e.gap).map(({ r, dp }) => <li key={r.slug}><Link href={`/banks/${r.slug}`}>{r.name}</Link>{dp.why && <span className="dim"> — {firstSentence(dp.why, 140)}</span>}</li>)}</ul>
            </details>
          )}
          {gated.length > 0 && (
            <details>
              <summary>Ruled out ({gated.length})</summary>
              <ul className="plain">{gated.map(({ r, reason }) => <li key={r.slug}><Link href={`/banks/${r.slug}`}>{r.name}</Link><span className="dim"> — {reason}</span></li>)}</ul>
            </details>
          )}
        </section>

        <aside>
          {themes.length > 0 && (
            <section className="panel">
              <h2>Lead with</h2>
              <p className="dim">Themes that come up most at the institutions that need it, compared with the market as a whole.</p>
              <ul className="theme-bars">
                {themes.map((t) => (
                  <li key={t.key} title={t.blurb}>
                    <span className="tb-label">{t.label}</span>
                    <span className="tb-bar"><i style={{ width: `${(t.banks / maxTheme) * 100}%` }} /></span>
                    <span className="tb-num">{t.banks} of {top.length}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {objections.size > 0 && (
            <section className="panel">
              <h2>When they push back</h2>
              <ul className="qa">
                {[...objections.values()].slice(0, 5).map((o) => (
                  <li key={o.q}><p className="q">{o.q}</p><p className="a"><b>Answer:</b> {o.a}</p><Link href={`/banks/${o.slug}`} className="dim">{o.name}</Link></li>
                ))}
              </ul>
            </section>
          )}
          {(inBook.length > 0 || teamHere.length > 0) && (
            <section className="panel ws-product-panel">
              <h2>Your whitespace</h2>
              {inBook.length === 0 ? <p className="dim">Not set at any account in your book yet.</p> : (
                <ul className="ws-product-list">
                  {inBook.map((w) => (
                    <li key={w.slug}>
                      <Link href={`/banks/${w.slug}/whitespace`}>{names.get(w.slug) ?? w.slug}</Link>
                      <StatusPill status={w.status} />
                      <span className="dim">{[w.target_quarter && formatQuarter(w.target_quarter), w.acv_usd != null && formatUsd(w.acv_usd)].filter(Boolean).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section className="panel">
            <details className="about">
              <summary><h2>About it</h2><span className="dim">From the product catalogue</span></summary>
              {blocks.map((b, i) => b.kind === "para"
                ? <p key={i}><Rich text={b.text} /></p>
                : (
                  <div key={i}>
                    {b.title && <h3>{b.title}</h3>}
                    <ul>{b.items.map((t, j) => <li key={j}><Rich text={t} /></li>)}</ul>
                  </div>
                ))}
              <p className="dim">From {CATALOGUE_SOURCE}.</p>
            </details>
          </section>
        </aside>
      </div>
    </main>
  );
}
