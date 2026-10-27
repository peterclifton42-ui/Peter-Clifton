import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { followedSlugs } from "@/lib/follows";
import {
  INSIGHT_COLUMNS, SOURCES, angleResults, inScope, objectionResults, parseScope, productDemand, themeResults,
  type InsightInput, type ObjectionExample, type Source,
} from "@/lib/insights";
import { createClient } from "@/lib/supabase/server";
import { ScopeTabs } from "../scope-tabs";

export const metadata: Metadata = { title: "Insights" };

// Column names on phones, where each theme gets its own row of four cells.
const SHORT: Record<Source, string> = { threat: "Threat", opportunity: "Opportunity", priority: "Priority", now: "Urgent now" };

function Examples({ examples, avoid }: { examples: ObjectionExample[]; avoid: boolean }) {
  return (
    <ul>
      {examples.map((e, i) => (
        <li key={`${e.slug}-${i}`}>
          <p className="q">{avoid ? "Don't say:" : "They say:"} {e.objection}</p>
          <p className="a">{avoid ? "Instead:" : "Answer:"} {e.rebuttal}</p>
          <Link href={`/banks/${e.slug}`} className="dim">{e.name}</Link>
        </li>
      ))}
    </ul>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const viewer = await requireViewer();
  const scope = parseScope((await searchParams).scope);
  const supabase = await createClient();
  const [{ data }, followed] = await Promise.all([
    supabase.from("insight_inputs").select(INSIGHT_COLUMNS),
    followedSlugs(viewer.id),
  ]);
  const rows = inScope((data ?? []) as InsightInput[], scope, followed);
  const themes = themeResults(rows).filter((t) => t.banks > 0);
  const demandAll = productDemand(rows);
  const demand = demandAll.slice(0, 12);
  // How many of the viewer's own banks rank each product 1 or 2 (on the wider tabs).
  const mine = scope !== "following" && followed.size
    ? new Map(productDemand(rows.filter((r) => followed.has(r.slug))).map((d) => [d.slug, d.p1 + d.p2]))
    : null;
  const objections = objectionResults(rows);
  const angles = angleResults(rows);
  const high = rows.filter((r) => r.opportunity === "HIGH").length;
  const maxDemand = Math.max(1, ...demand.map((d) => d.p1 + d.p2));
  const banks = rows.filter((r) => r.category !== "credit_union").length;

  // Heat: one blue scale for the first three columns, orange for "Urgent now".
  const maxCount = Math.max(1, ...themes.flatMap((t) => [t.counts.threat, t.counts.opportunity, t.counts.priority]));
  const maxNow = Math.max(1, ...themes.map((t) => t.counts.now));
  const heat = (key: Source, n: number) => {
    const share = n / (key === "now" ? maxNow : maxCount);
    return { "--heat": `${n ? Math.round(14 + share * 76) : 0}%` } as React.CSSProperties;
  };

  // The headline takeaways.
  const urgent = [...themes].sort((a, b) => b.counts.now - a.counts.now)[0];
  // The most-raised theme, unless that's the urgent one too: then the next one.
  const common = themes.find((t) => t !== urgent || urgent.counts.now === 0);
  const topProduct = [...demandAll].sort((a, b) => b.p1 + b.p2 - (a.p1 + a.p2))[0];
  const topObjection = objections.find((o) => o.key !== "avoid" && o.key !== "other");
  const of = (n: number) => `${n} of ${rows.length}`;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <p>
            What {rows.length} {rows.length === 1 ? "dashboard says" : "dashboards say"} when you read them together: what&apos;s on
            their minds, where the demand is, and what gets them to say yes. Every count opens to the sentences behind it.
          </p>
        </div>
      </div>
      <ScopeTabs path="/insights" scope={scope} />

      {rows.length === 0 ? (
        <div className="panel"><p>{scope === "following" ? <>You don&apos;t follow any banks yet. <Link href="/banks">Follow some</Link> to see insights for just them.</> : "No dashboards in this group."}</p></div>
      ) : (
        <>
          <p className="ins-summary dim">
            {banks} bank{banks === 1 ? "" : "s"} and {rows.length - banks} credit union{rows.length - banks === 1 ? "" : "s"} ·{" "}
            {high} rated HIGH opportunity
          </p>
          <nav className="ins-jump" aria-label="On this page">
            <a href="#takeaways">Takeaways</a><a href="#themes">Themes</a><a href="#demand">Demand</a><a href="#yes">Objections</a>
          </nav>

          <section id="takeaways" className="takeaways">
            {urgent && urgent.counts.now > 0 && (
              <a href="#themes" className="takeaway now">
                <span className="tk-label">Most urgent right now</span>
                <b>{urgent.label}</b>
                <span>{of(urgent.counts.now)} dashboards say it&apos;s live now, in the sales timing.</span>
              </a>
            )}
            {common && (
              <a href="#themes" className="takeaway">
                <span className="tk-label">On everyone&apos;s mind</span>
                <b>{common.label}</b>
                <span>Comes up at {of(common.banks)}: {common.blurb.charAt(0).toLowerCase() + common.blurb.slice(1)}</span>
              </a>
            )}
            {topProduct && (
              <Link href={`/products/${topProduct.slug}?scope=${scope}`} className="takeaway">
                <span className="tk-label">Biggest product demand</span>
                <b>{topProduct.name}</b>
                <span>A top-two priority at {of(topProduct.p1 + topProduct.p2)}, and number one at {topProduct.p1}.</span>
              </Link>
            )}
            {topObjection && (
              <a href="#yes" className="takeaway">
                <span className="tk-label">Pushback you&apos;ll hear most</span>
                <b>{topObjection.label}</b>
                <span>On {topObjection.banks} dashboards. The answers that work are below.</span>
              </a>
            )}
          </section>

          <section id="themes" className="panel">
            <h2>What&apos;s on their minds</h2>
            <p className="dim">
              How many dashboards raise each theme, and where. Brighter means more. Open a theme to read what each dashboard says.
            </p>
            <div className="heat-legend" aria-hidden="true">
              <span>Fewer</span><i className="ramp blue" /><span>More</span>
              <span className="gap" /><span>Urgent now:</span><i className="ramp orange" />
            </div>
            <div className="heat" role="table" aria-label="Themes by where they come up">
              <div className="heat-row heat-head" role="row">
                <span role="columnheader">Theme</span>
                {SOURCES.map((s) => <span key={s.key} role="columnheader" title={`From ${s.hint}`} className={s.key === "now" ? "now" : ""}>{s.label}</span>)}
              </div>
              {themes.map((t) => (
                <details key={t.key} className="heat-theme">
                  <summary className="heat-row" role="row">
                    <span className="theme-name" role="rowheader"><b>{t.label}</b><span className="dim">{of(t.banks)} · {t.blurb}</span></span>
                    {SOURCES.map((s) => (
                      <span key={s.key} role="cell" className={`heat-cell${s.key === "now" ? " now" : ""}${t.counts[s.key] ? "" : " zero"}`}
                        style={heat(s.key, t.counts[s.key])} title={`${t.label} · ${s.label}: ${t.counts[s.key]} of ${rows.length}`}>
                        <span className="heat-label">{SHORT[s.key]}</span>{t.counts[s.key]}
                      </span>
                    ))}
                  </summary>
                  <div className="evidence">
                    {SOURCES.map((s) => {
                      const ev = t.evidence.filter((e) => e.source === s.key);
                      return ev.length > 0 && (
                        <div key={s.key}>
                          <h3>{s.label} <span className="dim">({ev.length})</span></h3>
                          <ul>
                            {ev.map((e) => (
                              <li key={e.slug}><Link href={`/banks/${e.slug}`}>{e.name}</Link>: {e.text}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section id="demand" className="panel">
            <h2>Where the demand is</h2>
            <p className="dim">How many dashboards rank each product as priority 1 or 2. Average fit score in brackets.</p>
            <div className="legend">
              <span><i className="swatch p1" />Priority 1</span>
              <span><i className="swatch p2" />Priority 2</span>
              {mine && <span><i className="swatch yours" />Your banks (of those)</span>}
            </div>
            <ol className="demand">
              {demand.map((d) => (
                <li key={d.slug} title={`${d.name} · priority 1: ${d.p1} · priority 2: ${d.p2}`}>
                  <Link href={`/products/${d.slug}?scope=${scope}`} className="demand-name">{d.name}</Link>
                  <span className="demand-bar">
                    {d.p1 > 0 && <i className={`p1${d.p2 ? "" : " end"}`} style={{ width: `${(d.p1 / maxDemand) * 100}%` }} />}
                    {d.p2 > 0 && <i className="p2 end" style={{ width: `${(d.p2 / maxDemand) * 100}%` }} />}
                  </span>
                  <span className="num">
                    <b>{d.p1 + d.p2}</b> <span className="dim">{d.p1} + {d.p2}{d.avgFit != null && ` (${d.avgFit})`}</span>
                    {mine?.get(d.slug) ? <span className="yours-count">{mine.get(d.slug)} of yours</span> : null}
                  </span>
                </li>
              ))}
            </ol>
            <p><Link href={`/products?scope=${scope}`}>All products →</Link></p>
          </section>

          <section id="yes" className="panel">
            <h2>What gets them to say yes</h2>
            {angles[0] && (
              <div className="angle-lead">
                <span className="tk-label">The angle that works on {of(angles[0].banks.length)}</span>
                <p><b>“{angles[0].title}”</b></p>
                <p className="dim">
                  An institution can see its own numbers, but not what the rest of the market is paying, pricing or doing. Lead with
                  the gap only outside data can close, not with a problem in their numbers.
                </p>
                {angles.length > 1 && (
                  <details>
                    <summary>Other lead angles ({angles.length - 1})</summary>
                    <ul>{angles.slice(1).map((a) => (
                      <li key={a.title}><b>{a.title}</b> — {a.banks.map((b, i) => <span key={b.slug}>{i > 0 && ", "}<Link href={`/banks/${b.slug}`}>{b.name}</Link></span>)}</li>
                    ))}</ul>
                  </details>
                )}
              </div>
            )}
            <h3>The objections you&apos;ll hear, and the answers that work</h3>
            <div className="answer-grid">
              {objections.map((o) => {
                const avoid = o.key === "avoid";
                const [first, ...rest] = o.examples;
                return (
                  <article key={o.key} className={`answer-card${avoid ? " avoid" : ""}`}>
                    <header>
                      <b>{avoid ? "⚠ Lines that backfire" : o.label}</b>
                      <span className="dim">{o.banks} dashboard{o.banks === 1 ? "" : "s"}</span>
                    </header>
                    {first && (
                      <div className="best">
                        {avoid && <p className="q">Don&apos;t say: {first.objection}</p>}
                        {!avoid && o.key === "other" && <p className="q">They say: {first.objection}</p>}
                        <p className="a"><span className="tk-label">{avoid ? "Instead" : "Answer"}</span>{first.rebuttal}</p>
                        <Link href={`/banks/${first.slug}`} className="dim">{first.name}</Link>
                      </div>
                    )}
                    {rest.length > 0 && (
                      <details className="more">
                        <summary>{rest.length} more example{rest.length === 1 ? "" : "s"}</summary>
                        <Examples examples={rest} avoid={avoid} />
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <p className="dim">
            Themes and objection types are matched with keyword rules on the dashboards&apos; own text (SWOT, strategy pillars, sales
            timing and playbook), so a count is a pointer, not a verdict: open it to read what each dashboard actually says.
          </p>
        </>
      )}
    </main>
  );
}
