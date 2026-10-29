import type { Metadata } from "next";
import Link from "next/link";
import { canManage, requireViewer } from "@/lib/auth";
import { bookSlugs, followedSlugs } from "@/lib/follows";
import { INSIGHT_COLUMNS, inScope, parseScope, type InsightInput } from "@/lib/insights";
import { firstSentence, nextPlays, productSummaries } from "@/lib/plays";
import { statusLabel } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { loadTeam } from "@/lib/team";
import { WHITESPACE_COLUMNS, formatUsd, type WhitespaceRow } from "@/lib/whitespace";
import { PlayList } from "../plays";
import { ScopeTabs } from "../scope-tabs";
import { Quadrant, type QuadPoint } from "./quadrant";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const viewer = await requireViewer();
  const scope = parseScope((await searchParams).scope);
  const supabase = await createClient();
  const [{ data }, { data: wsData }, followed, booked, team] = await Promise.all([
    supabase.from("insight_inputs").select(INSIGHT_COLUMNS),
    supabase.from("whitespace").select(WHITESPACE_COLUMNS),
    followedSlugs(viewer.id),
    bookSlugs(viewer.id),
    canManage(viewer) ? loadTeam(viewer.id) : Promise.resolve([]),
  ]);
  const everything = (data ?? []) as InsightInput[];
  const whitespace = (wsData ?? []) as WhitespaceRow[];
  const rows = inScope(everything, scope, followed);
  const summaries = productSummaries(rows, whitespace);
  const q = scope === "all" ? "" : `?scope=${scope}`;

  // Plays come from the seller's book (managers: their team's too), else the banks
  // they follow, else the whole market.
  const teamBanks = new Set(team.flatMap((m) => m.banks));
  const source = booked.size || teamBanks.size ? "book" : followed.size ? "followed" : "market";
  const playBanks = source === "book" ? new Set([...booked, ...teamBanks]) : source === "followed" ? followed : null;
  const plays = nextPlays(playBanks ? everything.filter((r) => playBanks.has(r.slug)) : everything, whitespace, 8);

  const ranked = [...summaries].sort((a, b) => b.targets.length - a.targets.length || (b.avgFit ?? 0) - (a.avgFit ?? 0));
  const active = ranked.filter((s) => s.targets.length > 0);
  const quiet = ranked.filter((s) => s.targets.length === 0);
  const labelled = new Set(active.slice(0, 10).map((s) => s.product.slug));
  const points: QuadPoint[] = active.filter((s) => s.avgFit != null).map((s) => ({
    slug: s.product.slug, name: s.product.name, demand: s.targets.length, fit: s.avgFit!, pipeline: s.pipeline,
    flag: statusLabel(s.product)?.label ?? null, label: labelled.has(s.product.slug),
  }));
  const maxDemand = Math.max(1, ...active.map((s) => s.targets.length));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <p>Where each Curinos product is needed, what to lead with, and what gets a yes. Start with your next best plays.</p>
        </div>
      </div>

      <section className="panel" id="plays">
        <div className="panel-head">
          <h2>Your next best plays</h2>
          <span className="dim">
            {source === "book" ? "From your book" + (teamBanks.size ? " and your team's" : "") : source === "followed" ? "From the banks you follow" : "From across the market"}
            {" "}· priority 1 or 2 in the research, not yet reviewed in Whitespace
          </span>
        </div>
        {plays.length === 0 ? (
          <p className="dim">
            Nothing waiting: every research-backed product at {source === "market" ? "these banks" : "your banks"} has a whitespace status.{" "}
            <Link href="/whitespace">Open Whitespace →</Link>
          </p>
        ) : <PlayList plays={plays} />}
        {source !== "book" && (
          <p className="dim small">Mark banks as <b>My account</b> on their page to make this list your own book.</p>
        )}
      </section>

      <ScopeTabs path="/products" scope={scope} />

      <section className="panel">
        <h2>Where the opportunity is</h2>
        <p className="dim">Each bubble is a product. Further right: more institutions need it. Higher: it fits them better. Click a bubble for its playbook.</p>
        {points.length > 0 ? <Quadrant points={points} total={rows.length} scope={scope} /> : <p className="dim">No dashboards in this group.</p>}
      </section>

      <section className="panel">
        <h2>Product playbooks</h2>
        <p className="dim">Most-needed first. Each card says who needs it, what to lead with and the answer to the pushback you&apos;ll hear.</p>
        <div className="pb-grid">
          {active.map((s) => {
            const status = statusLabel(s.product);
            return (
              <article key={s.product.slug} className="pb-card">
                <header>
                  <span className="pb-pillar">{s.product.pillar}</span>
                  <Link href={`/products/${s.product.slug}${q}`} className="pb-name">{s.product.name}</Link>
                  {status && <span className={`badge status-${status.tone}`}>{status.label}</span>}
                </header>
                {s.value && <p className="pb-value">{s.value}</p>}
                <div className="pb-demand" title={`Priority 1 at ${s.p1}, priority 2 at ${s.p2}`}>
                  <span className="demand-bar">
                    {s.p1 > 0 && <i className={`p1${s.p2 ? "" : " end"}`} style={{ width: `${(s.p1 / maxDemand) * 100}%` }} />}
                    {s.p2 > 0 && <i className="p2 end" style={{ width: `${(s.p2 / maxDemand) * 100}%` }} />}
                  </span>
                  <span><b>{s.targets.length}</b> of {rows.length} need it{s.avgFit != null && <> · fit {s.avgFit}</>}{s.pursuits > 0 && <> · {formatUsd(s.pipeline) || "$0"} pipeline</>}</span>
                </div>
                {s.leadWith.length > 0 && (
                  <div className="pb-row">
                    <span className="tk-label">Lead with</span>
                    <span className="pb-chips">{s.leadWith.map((t) => <span key={t.label} className="lead-chip">{t.label} <b>{t.banks}</b></span>)}</span>
                  </div>
                )}
                {s.objection && (
                  <div className="pb-row">
                    <span className="tk-label">When they say</span>
                    <p className="pb-q">{firstSentence(s.objection.q, 110)}</p>
                    <p className="pb-a"><b>Answer:</b> {firstSentence(s.objection.a, 170)}</p>
                  </div>
                )}
                <footer>
                  <span className="dim">
                    Call first: {s.targets.slice(0, 3).map((t, i) => <span key={t.r.slug}>{i > 0 && ", "}<Link href={`/banks/${t.r.slug}`}>{t.r.name}</Link></span>)}
                  </span>
                  <Link href={`/products/${s.product.slug}${q}`} className="pb-open">Open playbook →</Link>
                </footer>
              </article>
            );
          })}
        </div>
        {quiet.length > 0 && (
          <details className="pb-quiet">
            <summary>Not a priority at any institution in this group ({quiet.length})</summary>
            <ul className="plain">
              {quiet.map((s) => {
                const status = statusLabel(s.product);
                return <li key={s.product.slug}><Link href={`/products/${s.product.slug}${q}`}>{s.product.name}</Link> <span className="dim">· {s.product.pillar}{status ? ` · ${status.label}` : ""}</span></li>;
              })}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}
