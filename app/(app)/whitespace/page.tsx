import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { followedSlugs } from "@/lib/follows";
import { PILLAR_ORDER, PRODUCTS } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import {
  STATUSES, STATUS_KEYS, WHITESPACE_COLUMNS, formatQuarter, formatUsd, productLines, quarterOf, totals,
  type Institution, type ProductLine, type WhitespaceRow,
} from "@/lib/whitespace";
import { EditTrigger, StatusPill, type EditorTarget } from "./editor";

export const metadata: Metadata = { title: "Whitespace" };

// Short column labels for the grid; the full name is in the tooltip.
function shortName(name: string) {
  return name.replace(/^Advisory: /, "").replace(/^Curinos One /, "C1 ").replace(" & ", " & ").replace(/ for Small.*$/, " (small)");
}

// The seller's book of business (the banks they follow): headline numbers and
// a grid of every bank x product, editable in place.
export default async function WhitespacePage({ searchParams }: { searchParams: Promise<{ pillar?: string }> }) {
  const viewer = await requireViewer();
  const pillar = PILLAR_ORDER.includes((await searchParams).pillar ?? "") ? (await searchParams).pillar! : null;
  const followed = [...await followedSlugs(viewer.id)];
  const supabase = await createClient();
  const [{ data: insts }, { data: research }, { data: rows }] = followed.length
    ? await Promise.all([
      supabase.from("institutions").select("slug, name, category, assets_b").in("slug", followed),
      supabase.from("insight_inputs").select("slug, products, dnr_products").in("slug", followed),
      supabase.from("whitespace").select(WHITESPACE_COLUMNS).in("slug", followed),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const book = ((insts ?? []) as Institution[]).sort((a, b) => Number(b.assets_b ?? 0) - Number(a.assets_b ?? 0));
  const wsRows = (rows ?? []) as WhitespaceRow[];
  const researchBy = new Map((research ?? []).map((r) => [r.slug as string, r]));
  const linesBy = new Map(book.map((i) => [i.slug, productLines(
    i, researchBy.get(i.slug)?.products ?? null, researchBy.get(i.slug)?.dnr_products ?? null, wsRows.filter((r) => r.slug === i.slug),
  )]));
  const columns = PRODUCTS
    .filter((p) => (!pillar || p.pillar === pillar) && book.some((i) => linesBy.get(i.slug)!.find((l) => l.product.slug === p.slug)!.applies.ok))
    .sort((a, b) => PILLAR_ORDER.indexOf(a.pillar) - PILLAR_ORDER.indexOf(b.pillar) || a.name.localeCompare(b.name));
  const groups = PILLAR_ORDER.map((p) => ({ pillar: p, count: columns.filter((c) => c.pillar === p).length })).filter((g) => g.count);

  const t = totals(wsRows);
  const applicableCells = book.flatMap((i) => linesBy.get(i.slug)!.filter((l) => l.applies.ok));
  const reviewed = applicableCells.filter((l) => l.row && !l.expired).length;
  const pct = applicableCells.length ? Math.round((reviewed / applicableCells.length) * 100) : 0;
  const demo = wsRows.some((r) => r.is_demo);

  const target = (i: Institution, l: ProductLine): EditorTarget => ({
    slug: i.slug, bankName: i.name, productSlug: l.product.slug, productName: l.product.name,
    applies: l.applies.ok, appliesReason: l.applies.ok ? undefined : l.applies.reason,
    aiHint: l.ruledOut != null ? `Research: not recommended now${l.ruledOut ? ` (${l.ruledOut})` : ""}.`
      : l.priority ? `Research: priority P${l.priority}${l.fit != null ? `, fit ${l.fit}` : ""}.` : null,
    row: l.row && { status: l.row.status, target_quarter: l.row.target_quarter, acv_usd: l.row.acv_usd, lost_on: l.row.lost_on, note: l.row.note },
  });
  const cellTitle = (i: Institution, l: ProductLine) => {
    const bits = [`${i.name} · ${l.product.name}`];
    if (l.row) bits.push(l.expired ? "Eligible again" : STATUSES[l.row.status].label);
    else bits.push("Not reviewed");
    if (l.row?.target_quarter) bits.push(formatQuarter(l.row.target_quarter));
    if (l.row?.acv_usd != null) bits.push(formatUsd(l.row.acv_usd));
    if (!l.row && l.priority) bits.push(`research P${l.priority}`);
    return bits.join(" · ");
  };

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Whitespace {demo && <span className="badge status-estimated">Demo data</span>}</h1>
          <p>Your book of business: the {book.length} {book.length === 1 ? "bank" : "banks"} you follow. Click any cell to set its status.</p>
        </div>
      </div>

      {book.length === 0 ? (
        <div className="panel">
          <p>Your book is built from the banks you follow. <Link href="/banks">Follow a few banks</Link> (☆) and they&apos;ll appear here, ready to review.</p>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat"><b>{formatUsd(t.validated.acv) || "$0"}</b><span>validated whitespace · {t.validated.count} pursuits</span></div>
            <div className="stat"><b>{formatUsd(t.inPlay.acv) || "$0"}</b><span>in play · {t.inPlay.count} in pipeline</span></div>
            <div className="stat"><b>{t.dueThisQuarter}</b><span>pursuits due by {formatQuarter(quarterOf(new Date()))}</span></div>
            <div className="stat"><b>{pct}%</b><span>reviewed · {reviewed} of {applicableCells.length} applicable</span></div>
          </div>

          <div className="panel">
            <div className="ws-grid-head">
              <nav className="scope-tabs" aria-label="Pillar">
                <Link href="/whitespace" aria-current={!pillar ? "page" : undefined}>All products</Link>
                {PILLAR_ORDER.map((p) => <Link key={p} href={`/whitespace?pillar=${encodeURIComponent(p)}`} aria-current={pillar === p ? "page" : undefined}>{p}</Link>)}
              </nav>
              <div className="ws-legend">
                {STATUS_KEYS.map((s) => <span key={s}><StatusPill status={s} compact /> {STATUSES[s].short}</span>)}
                <span><span className="ws-cell-demo ws-hinted" /> research P1–P2, not reviewed</span>
                <span><span className="ws-cell-demo ws-na-cell" /> not applicable</span>
              </div>
            </div>
            <div className="ws-grid-wrap">
              <table className="ws-grid">
                <thead>
                  <tr>
                    <th rowSpan={2} className="ws-bank-col">Bank</th>
                    <th rowSpan={2} className="ws-sum">Validated</th>
                    <th rowSpan={2} className="ws-sum">In play</th>
                    {groups.map((g) => <th key={g.pillar} colSpan={g.count} className="ws-group">{g.pillar}</th>)}
                  </tr>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.slug} className="ws-col" title={c.name}><Link href={`/products/${c.slug}`}><span>{shortName(c.name)}</span></Link></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {book.map((i) => {
                    const lines = linesBy.get(i.slug)!;
                    const mine = totals(wsRows.filter((r) => r.slug === i.slug));
                    return (
                      <tr key={i.slug}>
                        <th scope="row" className="ws-bank-col"><Link href={`/banks/${i.slug}/whitespace`}>{i.name.replace(/,? (Inc\.|Corporation|Corp\.)$/, "")}</Link></th>
                        <td className="ws-sum">{mine.validated.acv ? formatUsd(mine.validated.acv) : "–"}</td>
                        <td className="ws-sum">{mine.inPlay.acv ? formatUsd(mine.inPlay.acv) : "–"}</td>
                        {columns.map((c) => {
                          const l = lines.find((x) => x.product.slug === c.slug)!;
                          if (!l.applies.ok) return <td key={c.slug} className="ws-na-cell" title={`${l.product.name}: ${l.applies.reason}`} />;
                          const status = l.row && !l.expired ? l.row.status : null;
                          const hinted = !l.row && l.priority != null && l.priority <= 2 && l.ruledOut == null;
                          return (
                            <td key={c.slug}>
                              <EditTrigger target={target(i, l)} label={cellTitle(i, l)}
                                className={`ws-cell${status ? ` ws-${status}` : l.expired ? " ws-expired" : ""}${hinted ? " ws-hinted" : ""}`}>
                                {status ? STATUSES[status].code : l.expired ? "↺" : ""}
                              </EditTrigger>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="dim" style={{ marginTop: 10 }}>
              Statuses are shared with everyone on the account. Lost deals turn back into whitespace (↺) after 12 months (pipeline) or 24 months (renewal).
            </p>
          </div>
        </>
      )}
    </main>
  );
}
