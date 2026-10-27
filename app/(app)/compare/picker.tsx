"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MAX_COMPARE, METRIC_KEYS, METRICS, type MetricKey } from "@/lib/metrics";

export type PeerPick = Record<string, string[]>; // slug -> suggested peer slugs, best first

export type Option = { slug: string; name: string; category: string; assets_b: number | null };

// Colour slots travel in the URL (c=1,3,4) so an institution keeps its colour when
// others are added or removed.
export function Picker({ options, selected, slots, metrics, peers, anchor }: {
  options: Option[]; selected: string[]; slots: number[]; metrics: MetricKey[]; peers: PeerPick; anchor: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const names = useMemo(() => new Map(options.map((o) => [o.slug, o.name])), [options]);

  function go(ids: string[], m: MetricKey[], a: string | null = ids[0] === anchor ? anchor : null) {
    const kept = new Map(selected.map((slug, i) => [slug, slots[i]]));
    const c: number[] = [];
    for (const slug of ids) {
      const slot = kept.get(slug) ?? [1, 2, 3, 4, 5, 6].find((n) => !c.includes(n) && ![...kept.entries()].some(([s, k]) => k === n && ids.includes(s)))!;
      c.push(slot);
    }
    const params = new URLSearchParams({ ids: ids.join(","), c: c.join(","), m: m.join(",") });
    if (a) params.set("a", a);
    start(() => router.replace(`/compare?${params}`, { scroll: false }));
  }

  const matches = query.trim().length < 1 ? [] : options
    .filter((o) => !selected.includes(o.slug) && o.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8);
  const full = selected.length >= MAX_COMPARE;
  // Replace the comparison with one institution and its suggested peers.
  const findPeers = (slug: string) => go([slug, ...(peers[slug] ?? []).slice(0, MAX_COMPARE - 1)], metrics, slug);
  const sorted = useMemo(() => [...options].sort((a, b) => a.name.localeCompare(b.name)), [options]);

  return (
    <div className={`picker${pending ? " busy" : ""}`}>
      <div className="chips">
        {selected.map((slug, i) => (
          <span key={slug} className="chip">
            <i className={`dot s${slots[i]}`} />
            {names.get(slug) ?? slug}
            <button type="button" className="chip-peers" title={`Suggest peers for ${names.get(slug) ?? slug}`} onClick={() => findPeers(slug)}>peers</button>
            <button type="button" aria-label={`Remove ${names.get(slug) ?? slug}`} onClick={() => go(selected.filter((s) => s !== slug), metrics)}>×</button>
          </span>
        ))}
        <div className="add">
          <input
            type="search" value={query} disabled={full}
            placeholder={full ? `Up to ${MAX_COMPARE} at once` : "Add a bank or credit union…"}
            aria-label="Add an institution to compare"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) { go([...selected, matches[0].slug], metrics); setQuery(""); }
            }}
          />
          {matches.length > 0 && (
            <ul className="suggest" role="listbox">
              {matches.map((o) => (
                <li key={o.slug}>
                  <button type="button" onClick={() => { go([...selected, o.slug], metrics); setQuery(""); }}>
                    {o.name}<span className="dim">{o.category === "credit_union" ? "Credit union" : "Bank"}{o.assets_b ? ` · $${o.assets_b.toFixed(0)}B` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="find-peers">
        <label htmlFor="find-peers">Find peers for</label>
        <select id="find-peers" value="" onChange={(e) => e.target.value && findPeers(e.target.value)}>
          <option value="">Choose a bank or credit union…</option>
          {selected.length > 0 && (
            <optgroup label="In this comparison">
              {selected.map((slug) => <option key={slug} value={slug}>{names.get(slug)}</option>)}
            </optgroup>
          )}
          <optgroup label="All institutions">
            {sorted.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </optgroup>
        </select>
        <span className="dim">Replaces the comparison with it and its {MAX_COMPARE - 1} closest peers.</span>
      </div>
      <div className="metric-toggles" role="group" aria-label="Metrics to compare">
        {METRIC_KEYS.map((k) => {
          const on = metrics.includes(k);
          return (
            <button key={k} type="button" aria-pressed={on} className={on ? "on" : ""}
              onClick={() => go(selected, on ? metrics.filter((x) => x !== k) : METRIC_KEYS.filter((x) => x === k || metrics.includes(x)))}>
              {METRICS[k].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
