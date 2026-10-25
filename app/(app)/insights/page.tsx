import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { followedSlugs } from "@/lib/follows";
import {
  INSIGHT_COLUMNS, SOURCES, angleResults, inScope, objectionResults, parseScope, productDemand, themeResults,
  type InsightInput, type ObjectionExample,
} from "@/lib/insights";
import { createClient } from "@/lib/supabase/server";
import { ScopeTabs } from "../scope-tabs";

export const metadata: Metadata = { title: "Insights" };

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
  const themes = themeResults(rows);
  const demand = productDemand(rows).slice(0, 12);
  const objections = objectionResults(rows);
  const angles = angleResults(rows);
  const high = rows.filter((r) => r.opportunity === "HIGH").length;
  const maxDemand = Math.max(1, ...demand.map((d) => d.p1 + d.p2));
  const maxTheme = Math.max(1, ...themes.flatMap((t) => SOURCES.map((s) => t.counts[s.key])));
  const banks = rows.filter((r) => r.category !== "credit_union").length;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <p>
            What {rows.length} {rows.length === 1 ? "dashboard says" : "dashboards say"} when you read them together: the themes that keep coming up,
            where demand for each product is, and what gets banks to say yes. Every count opens to the sentences behind it.
          </p>
        </div>
      </div>
      <ScopeTabs path="/insights" scope={scope} />

      {rows.length === 0 ? (
        <div className="panel"><p>{scope === "following" ? <>You don&apos;t follow any banks yet. <Link href="/banks">Follow some</Link> to see insights for just them.</> : "No dashboards in this group."}</p></div>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat"><b>{rows.length}</b><span>{banks} bank{banks === 1 ? "" : "s"} · {rows.length - banks} credit union{rows.length - banks === 1 ? "" : "s"}</span></div>
            <div className="stat"><b>{high}</b><span>rated HIGH opportunity</span></div>
            {themes[0] && <div className="stat"><b>{themes[0].banks}</b><span>raise “{themes[0].label}”</span></div>}
            {demand[0] && <div className="stat"><b>{demand[0].p1}</b><span>have {demand[0].name} as a top priority</span></div>}
          </div>

          <section className="panel">
            <h2>Themes across the market</h2>
            <p className="dim">Number of institutions whose dashboard raises each theme, by where it comes up. Open a theme to read the evidence.</p>
            <div className="theme-head" aria-hidden="true">
              <span />
              {SOURCES.map((s) => <span key={s.key} title={`From ${s.hint}`}>{s.label}</span>)}
            </div>
            {themes.filter((t) => t.banks > 0).map((t) => (
              <details key={t.key} className="theme">
                <summary>
                  <span className="theme-name"><b>{t.label}</b><span className="dim">{t.banks} of {rows.length} · {t.blurb}</span></span>
                  {SOURCES.map((s) => (
                    <span key={s.key} className="cell" aria-label={`${s.label}: ${t.counts[s.key]}`}>
                      <span className="mini-bar"><i style={{ width: `${(t.counts[s.key] / maxTheme) * 100}%` }} /></span>
                      <span className="num">{t.counts[s.key]}</span>
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
          </section>

          <section className="panel">
            <h2>Where the demand is</h2>
            <p className="dim">How many dashboards rank each product as priority 1 or 2. Average fit score in brackets.</p>
            <div className="legend">
              <span><i className="swatch p1" />Priority 1</span>
              <span><i className="swatch p2" />Priority 2</span>
            </div>
            <ol className="demand">
              {demand.map((d) => (
                <li key={d.slug}>
                  <Link href={`/products/${d.slug}?scope=${scope}`} className="demand-name">{d.name}</Link>
                  <span className="demand-bar" title={`Priority 1: ${d.p1} · Priority 2: ${d.p2}`}>
                    {d.p1 > 0 && <i className="p1" style={{ width: `${(d.p1 / maxDemand) * 100}%` }} />}
                    {d.p2 > 0 && <i className="p2" style={{ width: `${(d.p2 / maxDemand) * 100}%` }} />}
                  </span>
                  <span className="num">{d.p1} · {d.p2}{d.avgFit != null && <span className="dim"> ({d.avgFit})</span>}</span>
                </li>
              ))}
            </ol>
            <p><Link href={`/products?scope=${scope}`}>All products →</Link></p>
          </section>

          <section className="panel">
            <h2>What gets banks to say yes</h2>
            {angles[0] && (
              <div className="angle-lead">
                <p>
                  The lead angle on <b>{angles[0].banks.length} of {rows.length}</b> dashboards is <b>“{angles[0].title}”</b>: an
                  institution can see its own numbers, but not what the rest of the market is paying, pricing or doing. Lead with
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
            <div className="objection-grid">
              {objections.map((o) => (
                <details key={o.key} className={`objection${o.key === "avoid" ? " avoid" : ""}`}>
                  <summary><b>{o.label}</b><span className="dim">{o.banks} dashboard{o.banks === 1 ? "" : "s"}</span></summary>
                  <Examples examples={o.examples.slice(0, 5)} avoid={o.key === "avoid"} />
                  {o.examples.length > 5 && (
                    <details className="more">
                      <summary>{o.examples.length - 5} more</summary>
                      <Examples examples={o.examples.slice(5)} avoid={o.key === "avoid"} />
                    </details>
                  )}
                </details>
              ))}
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
