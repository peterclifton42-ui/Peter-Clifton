import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { followedSlugs } from "@/lib/follows";
import {
  DEFAULT_METRICS, MAX_COMPARE, MERGER_GROWTH, METRIC_KEYS, METRICS, formatMetric, median, quarterLabel,
  type MetricKey, type MetricRow,
} from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";
import { peerSuggestions } from "@/lib/peers";
import { AskDrawer } from "../ask/ask-chat";
import { Picker, type Option } from "./picker";
import { TrendChart } from "./trend-chart";

export const metadata: Metadata = { title: "Compare" };

type Entity = { slug: string; source: string; ids: string[]; names: string[]; holding_company: string | null };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string; c?: string; m?: string; a?: string }> }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: list } = await supabase.from("institutions").select("slug, name, category, assets_b").order("name");
  const options = (list ?? []) as Option[];
  const peerMap = await peerSuggestions(supabase, MAX_COMPARE - 1);
  const peers = Object.fromEntries(Object.entries(peerMap).map(([slug, p]) => [slug, p.suggestions.map((x) => x.slug)]));
  const known = new Set(options.map((o) => o.slug));

  let ids = (params.ids ?? "").split(",").filter((s) => known.has(s));
  if (!params.ids) {
    // First visit: start from the banks this person follows, largest first.
    const follows = await followedSlugs(viewer.id);
    ids = options.filter((o) => follows.has(o.slug)).sort((a, b) => (b.assets_b ?? 0) - (a.assets_b ?? 0)).map((o) => o.slug);
  }
  ids = [...new Set(ids)].slice(0, MAX_COMPARE);
  const metrics = params.m != null
    ? METRIC_KEYS.filter((k) => params.m!.split(",").includes(k))
    : DEFAULT_METRICS;

  const [{ data: rows }, { data: entities }] = ids.length
    ? await Promise.all([
        supabase.from("regulatory_metrics").select("*").in("slug", ids).order("period"),
        supabase.from("regulatory_entities").select("slug, source, ids, names, holding_company").in("slug", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const data = (rows ?? []) as MetricRow[];
  const byName = new Map(options.map((o) => [o.slug, o]));
  const periods = [...new Set(data.map((r) => r.period))].sort().slice(-8);
  const latestPeriod = periods[periods.length - 1];
  const latest = new Map(ids.map((slug) => [slug, [...data].reverse().find((r) => r.slug === slug)]));
  // Colour slot per institution from the URL; fill any gaps with unused slots.
  const asked = (params.c ?? "").split(",").map(Number);
  const slots: number[] = [];
  ids.forEach((_, i) => {
    const want = asked[i];
    slots.push(want >= 1 && want <= MAX_COMPARE && !slots.includes(want) ? want : 0);
  });
  slots.forEach((s, i) => { if (!s) slots[i] = [1, 2, 3, 4, 5, 6].find((n) => !slots.includes(n))!; });
  const color = new Map(ids.map((slug, i) => [slug, slots[i]]));
  const mixed = new Set(ids.map((s) => byName.get(s)?.category)).size > 1;
  // When the comparison is an institution plus suggested peers, say why each was picked.
  const anchor = params.a && ids[0] === params.a ? params.a : null;
  const why = anchor ? peerMap[anchor]?.suggestions.filter((p) => ids.includes(p.slug)) ?? [] : [];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Compare</h1>
          <p>
            Up to {MAX_COMPARE} banks and credit unions side by side, on the same official figures: FDIC call reports for banks
            (every charter a holding company owns, added together) and NCUA call reports for credit unions.
          </p>
        </div>
        {ids.length > 0 && <AskDrawer context={{ kind: "compare", slug: ids.join(","), name: ids.map((s) => byName.get(s)?.name ?? s).join(", "), focus: byName.get(ids[0])?.name }} />}
      </div>

      <div className="panel">
        <Picker options={options} selected={ids} slots={slots} metrics={metrics} peers={peers} anchor={anchor} />
        {anchor && why.length > 0 && (
          <div className="peer-why">
            <p><b>Why these peers for {byName.get(anchor)?.name}</b>
              {peerMap[anchor]?.officialSource ? <> · its own disclosed peer group (its {peerMap[anchor].officialSource}) comes first, then the closest matches</> : <> · closest on size (40%), region (20%), and business model and balance sheet (40%)</>}
            </p>
            <ul>
              {why.map((p) => (
                <li key={p.slug}><i className={`dot s${color.get(p.slug)}`} /><b>{byName.get(p.slug)?.name}</b> <span className="dim">{p.reasons.join(" · ")}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {ids.length === 0 ? (
        <div className="panel"><p>Add a bank or credit union above to start, or open one from <Link href="/banks">Banks</Link> and choose “Compare with peers”.</p></div>
      ) : metrics.length === 0 ? (
        <div className="panel"><p>Choose at least one metric above.</p></div>
      ) : (
        <>
          <div className="panel">
            <h2>{latestPeriod ? `${quarterLabel(latestPeriod)} call reports` : "Latest call reports"}</h2>
            <div className="table-wrap flat">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    {ids.map((slug) => (
                      <th key={slug} scope="col">
                        <Link href={`/banks/${slug}`}><i className={`dot s${color.get(slug)}`} />{byName.get(slug)?.name}</Link>
                        {latest.get(slug) && latest.get(slug)!.period !== latestPeriod && (
                          <span className="dim"> ({quarterLabel(latest.get(slug)!.period)})</span>
                        )}
                      </th>
                    ))}
                    {ids.length > 2 && <th scope="col" className="median">Group median</th>}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((k) => {
                    const values = ids.map((slug) => latest.get(slug)?.[k] ?? null);
                    const present = values.filter((v): v is number => v != null);
                    const best = METRICS[k].better && present.length > 1
                      ? (METRICS[k].better === "higher" ? Math.max : Math.min)(...present) : null;
                    return (
                      <tr key={k}>
                        <th scope="row">
                          {k === "ldr" && mixed ? "Loan-to-deposit / loan-to-share" : METRICS[k].label}
                          {METRICS[k].better && <span className="dim"> · {METRICS[k].better} is better</span>}
                        </th>
                        {values.map((v, i) => (
                          <td key={ids[i]} className={v != null && v === best ? "best" : undefined}>
                            {formatMetric(k, v)}
                            {v != null && v === best && <span className="best-tag">Best</span>}
                            {k === "deposit_growth" && v != null && Math.abs(v) >= MERGER_GROWTH && <sup title="Includes an acquisition or charter merger">†</sup>}
                          </td>
                        ))}
                        {ids.length > 2 && <td className="median">{formatMetric(k, median(present))}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {metrics.includes("deposit_growth") && ids.some((s) => Math.abs(latest.get(s)?.deposit_growth ?? 0) >= MERGER_GROWTH) && (
              <p className="dim">† Growth this large comes from an acquisition or charter merger, not organic deposit gathering.</p>
            )}
          </div>

          <div className="panel">
            <h2>Trends</h2>
            <div className="legend" aria-hidden="true">
              {ids.map((slug) => <span key={slug}><i className={`dot s${color.get(slug)}`} />{byName.get(slug)?.name}</span>)}
            </div>
            <div className="trend-grid">
              {metrics.map((k) => (
                <figure key={k}>
                  <figcaption>{METRICS[k].label}</figcaption>
                  <TrendChart
                    metric={k}
                    periods={periods}
                    series={ids.map((slug) => ({
                      slug, name: byName.get(slug)?.name ?? slug, color: color.get(slug)!,
                      values: periods.map((p) => data.find((r) => r.slug === slug && r.period === p)?.[k] ?? null),
                    }))}
                  />
                </figure>
              ))}
            </div>
          </div>

          <details className="panel dictionary">
            <summary><h2>What these figures mean and where they come from</h2></summary>
            <dl>
              {metrics.map((k) => (
                <div key={k}>
                  <dt>{METRICS[k].label}</dt>
                  <dd>{METRICS[k].definition}</dd>
                  <dd className="dim"><b>Banks:</b> {METRICS[k].bank}</dd>
                  <dd className="dim"><b>Credit unions:</b> {METRICS[k].creditUnion}</dd>
                </div>
              ))}
            </dl>
            <p className="dim">
              These are regulatory filings, which arrive about a month after each quarter ends, so a bank&apos;s own
              earnings release (and its dashboard) can be a quarter ahead. Holding companies are measured on their bank
              charters, which leaves out non-bank subsidiaries.
            </p>
            <ul className="sources">
              {((entities ?? []) as Entity[]).map((e) => (
                <li key={e.slug}>
                  <b>{byName.get(e.slug)?.name}:</b>{" "}
                  {e.source === "fdic"
                    ? `${e.names.length === 1 ? e.names[0] : `${e.names.length} bank charters`} (FDIC certificate${e.ids.length > 1 ? "s" : ""} ${e.ids.join(", ")})`
                    : `${e.names[0]} (NCUA charter ${e.ids[0]})`}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </main>
  );
}
