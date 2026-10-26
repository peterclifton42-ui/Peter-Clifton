import type { Metadata } from "next";
import Link from "next/link";
import { canManage, requireViewer } from "@/lib/auth";
import { bookSlugs } from "@/lib/follows";
import { loadTeam, ownersByBank } from "@/lib/team";
import { PILLAR_ORDER, PRODUCTS, productBySlug } from "@/lib/products";
import { memberNames } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import {
  EVENT_COLUMNS, STATUSES, STATUS_KEYS, WHITESPACE_COLUMNS, addToPair, bookOf, emptyPair, lostExpired, describeChange, formatQuarter, formatUsd, quarterOf, totals, weeklyTrend,
  type Institution, type ProductLine, type WhitespaceEvent, type WhitespaceRow,
} from "@/lib/whitespace";
import { Legend, QuarterColumns, RowBars, TrendLines } from "./charts";
import { EditTrigger, StatusPill, type EditorTarget } from "./editor";

export const metadata: Metadata = { title: "Whitespace" };

// Short column labels for the grid; the full name is in the tooltip.
function shortName(name: string) {
  return name.replace(/^Advisory: /, "").replace(/^Curinos One /, "C1 ").replace(/ for Small.*$/, " (small)");
}
const shortBank = (name: string) => name.replace(/,? (Inc\.|Corporation|Corp\.)$/, "");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" });

// The seller's book of business (the banks they follow): headline numbers,
// charts, next steps, recent changes and a bank x product grid editable in place.
export default async function WhitespacePage({ searchParams }: { searchParams: Promise<{ pillar?: string; view?: string; sellers?: string }> }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const pillar = PILLAR_ORDER.includes(params.pillar ?? "") ? params.pillar! : null;
  // Managers switch between their own book and the team's consolidated book.
  const manager = canManage(viewer);
  const teamView = manager && params.view === "team";
  const members = teamView ? await loadTeam(viewer.id) : [];
  const picked = (params.sellers ?? "").split(",").filter((id) => members.some((m) => m.id === id));
  const shown = picked.length ? members.filter((m) => picked.includes(m.id)) : members;
  const owners = ownersByBank(shown);
  const followed = teamView ? [...owners.keys()] : [...await bookSlugs(viewer.id)];
  const supabase = await createClient();
  // Links keep the current view and seller filter.
  const qs = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const all = { view: teamView ? "team" : null, sellers: picked.length ? picked.join(",") : null, pillar, ...extra };
    Object.entries(all).forEach(([k, v]) => { if (v) q.set(k, v); });
    const str = q.toString();
    return `/whitespace${str ? `?${str}` : ""}`;
  };
  const toggleSeller = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    return qs({ sellers: next.length && next.length < members.length ? next.join(",") : null });
  };
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const [{ data: insts }, { data: research }, { data: rows }, { data: snaps }, { data: events }, people] = followed.length
    ? await Promise.all([
      supabase.from("institutions").select("slug, name, category, assets_b").in("slug", followed),
      supabase.from("insight_inputs").select("slug, products, dnr_products").in("slug", followed),
      supabase.from("whitespace").select(WHITESPACE_COLUMNS).in("slug", followed),
      supabase.from("whitespace_snapshots").select("week, status, acv_usd").in("slug", followed).in("status", ["validated", "in_play"]),
      supabase.from("whitespace_events").select(EVENT_COLUMNS).in("slug", followed).gte("at", since).order("at", { ascending: false }).limit(200),
      memberNames(),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, new Map<string, string>()];

  const wsRows = (rows ?? []) as WhitespaceRow[];
  const book = bookOf({ institutions: (insts ?? []) as Institution[], research: (research ?? []) as never, rows: wsRows });
  const linesBy = book.lines;
  const t = book.totals;
  const pct = book.applicable ? Math.round((book.reviewed / book.applicable) * 100) : 0;
  const demo = wsRows.some((r) => r.is_demo);
  const weeks = weeklyTrend((snaps ?? []) as { week: string; status: string; acv_usd: number | null }[]);
  const monthAgo = weeks.length > 4 ? weeks[weeks.length - 5] : weeks[0];
  const delta = monthAgo ? t.validated.acv + t.inPlay.acv - (monthAgo.validated + monthAgo.inPlay) : 0;
  const nameOf = people;
  const recent = ((events ?? []) as WhitespaceEvent[]);
  const bankName = new Map(book.banks.map((i) => [i.slug, shortBank(i.name)]));
  const ownerNames = (slug: string) => (owners.get(slug) ?? []).map((m) => m.name.split(" ")[0]).join(", ");
  // In the team view, each next step names whose bank it is.
  const steps = book.steps.map((st) => {
    const slug = st.href.match(/^\/banks\/([^/]+)/)?.[1];
    // Only steps about one bank ("Review ... at X") belong to a seller; the rest are team-wide.
    return teamView && slug && owners.has(slug) && st.text.startsWith("Review") ? { ...st, text: `${ownerNames(slug)}: ${st.text}` } : st;
  });
  // Per-seller rollups for the team view (a bank shared by two sellers counts for both here, once in the totals).
  const sellerRows = shown.map((m) => {
    const pair = emptyPair();
    for (const r of wsRows) if (m.banks.includes(r.slug) && !lostExpired(r)) addToPair(pair, r.status, r.acv_usd);
    const lines = m.banks.flatMap((slug) => (linesBy.get(slug) ?? []).filter((l) => l.applies.ok));
    const reviewed = lines.filter((l) => l.row && !l.expired).length;
    const mine = recent.filter((e) => e.actor === m.id);
    const last = [...wsRows.filter((r) => r.updated_by === m.id).map((r) => r.updated_at), ...mine.map((e) => e.at)].sort().pop();
    return { m, pair, banks: m.banks.length, reviewedPct: lines.length ? Math.round((reviewed / lines.length) * 100) : 0, changes: mine.length, last };
  });
  const moved = {
    validated: recent.filter((e) => e.new_status === "validated" && e.old_status !== "validated").length,
    inPlay: recent.filter((e) => e.new_status === "in_play" && e.old_status !== "in_play").length,
    lost: recent.filter((e) => (e.new_status === "lost_pipeline" || e.new_status === "lost_renewal") && e.old_status !== e.new_status).length,
  };

  const columns = PRODUCTS
    .filter((p) => (!pillar || p.pillar === pillar) && book.banks.some((i) => linesBy.get(i.slug)!.find((l) => l.product.slug === p.slug)!.applies.ok))
    .sort((a, b) => PILLAR_ORDER.indexOf(a.pillar) - PILLAR_ORDER.indexOf(b.pillar) || a.name.localeCompare(b.name));
  const groups = PILLAR_ORDER.map((p) => ({ pillar: p, count: columns.filter((c) => c.pillar === p).length })).filter((g) => g.count);

  const target = (i: Institution, l: ProductLine): EditorTarget => ({
    slug: i.slug, bankName: i.name, productSlug: l.product.slug, productName: l.product.name,
    applies: l.applies.ok, appliesReason: l.applies.ok ? undefined : l.applies.reason,
    aiHint: l.ruledOut != null ? `Research: not recommended now${l.ruledOut ? ` (${l.ruledOut})` : ""}.`
      : l.priority ? `Research: priority P${l.priority}${l.fit != null ? `, fit ${l.fit}` : ""}.` : null,
    row: l.row && { status: l.row.status, target_quarter: l.row.target_quarter, acv_usd: l.row.acv_usd, lost_on: l.row.lost_on, note: l.row.note },
  });
  const cellTitle = (i: Institution, l: ProductLine) => {
    const bits = [`${i.name} · ${l.product.name}`];
    bits.push(l.row ? (l.expired ? "Eligible again" : STATUSES[l.row.status].label) : "Not reviewed");
    if (l.row?.target_quarter) bits.push(formatQuarter(l.row.target_quarter));
    if (l.row?.acv_usd != null) bits.push(formatUsd(l.row.acv_usd));
    if (!l.row && l.priority) bits.push(`research P${l.priority}`);
    return bits.join(" · ");
  };

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <h1>{teamView ? "Team whitespace" : "Whitespace"} {demo && <span className="badge status-estimated">Includes demo data</span>}</h1>
          <p>
            {teamView
              ? <>The consolidated book of {shown.length === members.length ? "your team" : shown.map((m) => m.name.split(" ")[0]).join(", ")}: {book.banks.length} {book.banks.length === 1 ? "bank" : "banks"}. A bank in two books counts once in the totals.</>
              : <>Your book of business: the {book.banks.length} {book.banks.length === 1 ? "bank" : "banks"} marked as your accounts. Statuses are shared with everyone on each account.</>}
          </p>
        </div>
        <div className="head-actions">
          {manager && (
            <nav className="view-switch" aria-label="View">
              <Link href="/whitespace" className={!teamView ? "active" : ""}>My book</Link>
              <Link href="/whitespace?view=team" className={teamView ? "active" : ""}>My team</Link>
            </nav>
          )}
          {teamView && <Link href="/whitespace/team">Manage team</Link>}
          {book.banks.length > 0 && <a href="#grid">Jump to the grid ↓</a>}
        </div>
      </div>

      {teamView && (
        <div className="seller-chips" aria-label="Filter by seller">
          <Link href={qs({ sellers: null })} className={!picked.length ? "on" : ""}>Everyone ({members.length})</Link>
          {members.map((m) => (
            <Link key={m.id} href={toggleSeller(m.id)} className={picked.includes(m.id) ? "on" : ""}>
              {m.name} <span className="dim">{m.banks.length}</span>
            </Link>
          ))}
          {members.length === 1 && <span className="dim">Your team is just you so far. <Link href="/whitespace/team">Pick your sellers →</Link></span>}
        </div>
      )}

      {book.banks.length === 0 ? (
        <div className="panel">
          {teamView
            ? <p>No banks in these books yet. Sellers add banks to their book by following them (☆) and ticking <b>My account</b> on the bank page.</p>
            : <p>Your book is the banks you follow (☆) and mark as <b>My account</b> on the bank page. <Link href="/banks">Find your banks</Link> to get started.</p>}
        </div>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat"><b>{formatUsd(t.validated.acv) || "$0"}</b><span>validated whitespace · {t.validated.count} pursuits</span></div>
            <div className="stat"><b>{formatUsd(t.inPlay.acv) || "$0"}</b><span>in play · {t.inPlay.count} in pipeline</span></div>
            <div className="stat"><b>{t.dueThisQuarter}</b><span>pursuits due by {formatQuarter(quarterOf(new Date()))}</span></div>
            <div className="stat"><b>{pct}%</b><span>reviewed · {book.reviewed} of {book.applicable} applicable</span></div>
          </div>

          <div className="ws-dash">
            <section className="panel">
              <h2>Opportunity by target quarter</h2>
              <Legend />
              <QuarterColumns quarters={book.byQuarter.map((q) => ({ label: q.label, pair: q.pair }))} />
            </section>
            <section className="panel">
              <h2>Opportunity over time</h2>
              <Legend />
              <TrendLines weeks={weeks} />
              {monthAgo && weeks.length > 1 && (
                <p className="dim chart-note">
                  {delta >= 0 ? "+" : "−"}{formatUsd(Math.abs(delta)) || "$0"} total opportunity in the last month
                  {" · "}{moved.validated} newly validated · {moved.inPlay} moved to In play · {moved.lost} lost (30 days)
                </p>
              )}
            </section>
          </div>

          {teamView && (
            <div className="ws-dash">
              <section className="panel">
                <h2>By seller</h2>
                <Legend />
                <RowBars rows={sellerRows.map((r) => ({ label: r.m.name, href: toggleSeller(r.m.id), pair: r.pair }))} />
              </section>
              <section className="panel">
                <h2>Team activity</h2>
                <div className="table-wrap flat">
                  <table className="team-table">
                    <thead><tr><th>Seller</th><th className="num">Banks</th><th className="num">Reviewed</th><th className="num">Validated</th><th className="num">In play</th><th className="num">Changes (30d)</th><th>Last update</th></tr></thead>
                    <tbody>
                      {sellerRows.map((r) => (
                        <tr key={r.m.id}>
                          <td><Link href={qs({ sellers: r.m.id })}>{r.m.name}</Link></td>
                          <td className="num">{r.banks}</td>
                          <td className="num"><span className={r.reviewedPct < 25 ? "warn-text" : ""}>{r.reviewedPct}%</span></td>
                          <td className="num">{formatUsd(r.pair.validated) || "–"}</td>
                          <td className="num">{formatUsd(r.pair.inPlay) || "–"}</td>
                          <td className="num">{r.changes}</td>
                          <td className="dim">{r.last ? day(r.last) : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          <div className="ws-dash three">
            <section className="panel">
              <h2>By bank</h2>
              <RowBars rows={book.byBank.map((b) => ({ label: shortBank(b.name), href: `/banks/${b.slug}/whitespace`, pair: b.pair }))} />
            </section>
            <section className="panel">
              <h2>By product pillar</h2>
              <RowBars rows={book.byPillar.map((p) => ({ label: p.pillar, href: `${qs({ pillar: p.pillar })}#grid`, pair: p.pair }))} />
            </section>
            <section className="panel">
              <h2>Status mix</h2>
              <ul className="status-mix">
                {STATUS_KEYS.map((s) => {
                  const list = book.statusCounts[s];
                  const acv = list.reduce((sum, r) => sum + Number(r.acv_usd ?? 0), 0);
                  return (
                    <li key={s}>
                      <StatusPill status={s} />
                      <span className="mix-bar"><i className={`ws-c-${s}`} style={{ width: `${book.applicable ? Math.max(list.length ? 2 : 0, (list.length / book.applicable) * 100) : 0}%` }} /></span>
                      <b>{list.length}</b>
                      <span className="dim">{acv ? formatUsd(acv) : ""}</span>
                    </li>
                  );
                })}
                <li>
                  <StatusPill status={null} />
                  <span className="mix-bar"><i className="ws-c-none" style={{ width: `${100 - pct}%` }} /></span>
                  <b>{book.applicable - book.reviewed}</b><span />
                </li>
              </ul>
            </section>
          </div>

          <div className="ws-dash">
            <section className="panel">
              <h2>Next steps</h2>
              {steps.length === 0 ? <p className="dim">Nothing pressing. Nice work.</p> : (
                <ul className="next-steps">
                  {steps.map((s, i) => <li key={i} className={s.tone}><Link href={s.href}>{s.text} →</Link></li>)}
                </ul>
              )}
            </section>
            <section className="panel">
              <h2>Recent changes</h2>
              {recent.length === 0 ? <p className="dim">No changes in the last 30 days.</p> : (
                <ul className="event-list">
                  {recent.slice(0, 8).map((e, i) => (
                    <li key={i}>
                      <span className="when">{day(e.at)}</span>
                      <span>
                        <Link href={`/banks/${e.slug}/whitespace`}>{bankName.get(e.slug) ?? e.slug}</Link>
                        {" · "}{productBySlug(e.product_slug)?.name ?? e.product_slug}: {describeChange(e)}
                        <span className="dim"> ({nameOf.get(e.actor ?? "")?.split(" ")[0] ?? "someone"})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="panel" id="grid">
            <h2>Every bank and product</h2>
            <div className="ws-grid-head">
              <nav className="scope-tabs" aria-label="Pillar">
                <Link href={`${qs({ pillar: null })}#grid`} aria-current={!pillar ? "page" : undefined}>All products</Link>
                {PILLAR_ORDER.map((p) => <Link key={p} href={`${qs({ pillar: p })}#grid`} aria-current={pillar === p ? "page" : undefined}>{p}</Link>)}
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
                  {book.banks.map((i) => {
                    const lines = linesBy.get(i.slug)!;
                    const mine = totals(wsRows.filter((r) => r.slug === i.slug));
                    return (
                      <tr key={i.slug}>
                        <th scope="row" className="ws-bank-col"><Link href={`/banks/${i.slug}/whitespace`}>{shortBank(i.name)}</Link>{teamView && <span className="ws-owner">{ownerNames(i.slug)}</span>}</th>
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
