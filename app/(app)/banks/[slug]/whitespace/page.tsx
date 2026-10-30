import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PILLAR_ORDER } from "@/lib/products";
import { memberNames } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import {
  EVENT_COLUMNS, WHITESPACE_COLUMNS, describeChange, formatQuarter, formatUsd, productLines, totals,
  type ProductLine, type WhitespaceEvent, type WhitespaceRow,
} from "@/lib/whitespace";
import { EditTrigger, StatusPill, type EditorTarget } from "../../../whitespace/editor";
import { BankBar, loadInstitution } from "../bank-bar";
import { PursuitList, isPursuit } from "../../../pursuits";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ all?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const institution = await loadInstitution(slug);
  return { title: institution ? `${institution.name} · Whitespace` : "Not found" };
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" });

// Every Curinos product for one institution: what the research suggests and
// what the account team has confirmed.
export default async function BankWhitespacePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const showAll = (await searchParams).all === "1";
  const institution = await loadInstitution(slug);
  if (!institution?.current_snapshot_id) notFound();

  const supabase = await createClient();
  const [{ data: snapshot }, { data: research }, { data: rows }, { data: events }, people, { data: plans }] = await Promise.all([
    supabase.from("snapshots").select("loaded_at").eq("id", institution.current_snapshot_id).single(),
    supabase.from("insight_inputs").select("products, dnr_products").eq("slug", slug).maybeSingle(),
    supabase.from("whitespace").select(WHITESPACE_COLUMNS).eq("slug", slug),
    supabase.from("whitespace_events").select(EVENT_COLUMNS).eq("slug", slug).order("at", { ascending: false }).limit(12),
    memberNames(),
    supabase.from("engagement_plans").select("product_slug").eq("slug", slug),
  ]);
  if (!snapshot) notFound();
  const planned = new Set((plans ?? []).map((p) => p.product_slug as string));
  const nameOf = people;
  const wsRows = (rows ?? []) as WhitespaceRow[];
  const lines = productLines(institution, research?.products ?? null, research?.dnr_products ?? null, wsRows);
  const applicable = lines.filter((l) => l.applies.ok);
  const reviewed = applicable.filter((l) => l.row && !l.expired).length;
  const t = totals(wsRows);
  const hidden = lines.length - applicable.length;
  const demo = wsRows.some((r) => r.is_demo);
  const productName = new Map(lines.map((l) => [l.product.slug, l.product.name]));

  const target = (l: ProductLine): EditorTarget => ({
    slug, bankName: institution.name, productSlug: l.product.slug, productName: l.product.name,
    applies: l.applies.ok, appliesReason: l.applies.ok ? undefined : l.applies.reason,
    aiHint: l.ruledOut != null ? `Research: not recommended now${l.ruledOut ? ` (${l.ruledOut})` : ""}.`
      : l.priority ? `Research: priority P${l.priority}${l.fit != null ? `, fit ${l.fit}` : ""}.` : null,
    row: l.row && { status: l.row.status, target_quarter: l.row.target_quarter, acv_usd: l.row.acv_usd, lost_on: l.row.lost_on, note: l.row.note },
  });

  return (
    <>
      <BankBar institution={institution} researchedAt={snapshot.loaded_at} view="whitespace" />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>{institution.name}: whitespace {demo && <span className="badge status-estimated">Demo data</span>}</h1>
            <p>Confirm what the account team knows about each product. The research&apos;s priority and fit score sit alongside to start from.</p>
          </div>
          <Link href="/whitespace">Your whole book →</Link>
        </div>

        <div className="stat-row">
          <div className="stat"><b>{formatUsd(t.validated.acv) || "$0"}</b><span>validated whitespace · {t.validated.count} {t.validated.count === 1 ? "product" : "products"}</span></div>
          <div className="stat"><b>{formatUsd(t.inPlay.acv) || "$0"}</b><span>in play · {t.inPlay.count}</span></div>
          <div className="stat"><b>{reviewed}/{applicable.length}</b><span>applicable products reviewed</span></div>
          <div className="stat"><b>{t.lost}</b><span>recently lost (avoid for now)</span></div>
        </div>

        {wsRows.some(isPursuit) && (
          <section className="panel">
            <h2>Pursuits</h2>
            <PursuitList showBank={false} pursuits={wsRows.filter(isPursuit)
              .sort((a, b) => (a.target_quarter ?? "9").localeCompare(b.target_quarter ?? "9"))
              .map((r) => ({ row: r, bankName: institution.name, productName: productName.get(r.product_slug) ?? r.product_slug, hasPlan: planned.has(r.product_slug) }))} />
          </section>
        )}

        {PILLAR_ORDER.map((pillar) => {
          const group = lines.filter((l) => l.product.pillar === pillar && (showAll || l.applies.ok));
          if (!group.length) return null;
          return (
            <section key={pillar} className="panel ws-pillar">
              <h2>{pillar}</h2>
              <div className="ws-table" role="table" aria-label={`${pillar} products`}>
                <div className="ws-tr ws-th" role="row">
                  <span role="columnheader">Product</span><span role="columnheader">Research</span><span role="columnheader">Status</span>
                  <span role="columnheader">Quarter</span><span role="columnheader">ACV</span><span role="columnheader">Last change</span>
                </div>
                {group.map((l) => (
                  <div key={l.product.slug} className={`ws-tr${l.applies.ok ? "" : " ws-na"}`} role="row">
                    <span role="cell" className="ws-product">
                      <Link href={`/products/${l.product.slug}`}>{l.product.name}</Link>
                      {l.applies.ok && l.applies.note && <span className="badge status-estimated">{l.applies.note}</span>}
                    </span>
                    <span role="cell" className="ws-research">
                      {!l.applies.ok ? <span className="dim">Not applicable: {l.applies.reason}</span>
                        : l.ruledOut != null ? <span className="dim" title={l.ruledOut}>Not now (research)</span>
                        : l.priority ? <><span className={`badge pri-${l.priority}`}>P{l.priority}</span>{l.fit != null && <span className="dim"> fit {l.fit}</span>}</>
                        : <span className="dim">–</span>}
                    </span>
                    <span role="cell">
                      {l.applies.ok
                        ? <EditTrigger target={target(l)} label={`Set status for ${l.product.name}`}><StatusPill status={l.row?.status ?? null} expired={l.expired} /> <span className="ws-pencil" aria-hidden>✎</span></EditTrigger>
                        : <span className="ws-pill ws-na-pill">N/A</span>}
                    </span>
                    <span role="cell" className="num-cell">{l.row?.target_quarter && !l.expired ? formatQuarter(l.row.target_quarter) : ""}</span>
                    <span role="cell" className="num-cell">{l.row?.acv_usd != null && !l.expired ? formatUsd(l.row.acv_usd) : ""}</span>
                    <span role="cell" className="dim">
                      {l.row ? `${nameOf.get(l.row.updated_by ?? "")?.split(" ")[0] ?? "Someone"}, ${day(l.row.updated_at)}` : ""}
                      {l.row?.note && <span className="ws-note" title={l.row.note}> · {l.row.note}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {hidden > 0 && (
          <p className="dim">
            {showAll ? <Link href={`/banks/${slug}/whitespace`}>Hide products that don&apos;t apply</Link>
              : <><Link href={`/banks/${slug}/whitespace?all=1`}>Show {hidden} {hidden === 1 ? "product" : "products"} that don&apos;t apply</Link> (greyed out).</>}
          </p>
        )}

        <section className="panel">
          <h2>Recent changes</h2>
          {(events ?? []).length === 0 ? <p className="dim">Nothing set yet. Click a status above to start.</p> : (
            <ul className="event-list">
              {((events ?? []) as WhitespaceEvent[]).map((e, i) => (
                <li key={i}>
                  <span className="when">{day(e.at)}</span>
                  <span><b>{nameOf.get(e.actor ?? "")?.split(" ")[0] ?? "Someone"}</b> {describeChange(e)}: {productName.get(e.product_slug) ?? e.product_slug}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
