"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MAX_COMPARE, METRIC_KEYS, METRICS, suggestPeers, type MetricKey } from "@/lib/metrics";

export type Option = { slug: string; name: string; category: string; assets_b: number | null };

// Colour slots travel in the URL (c=1,3,4) so an institution keeps its colour when
// others are added or removed.
export function Picker({ options, selected, slots, metrics }: { options: Option[]; selected: string[]; slots: number[]; metrics: MetricKey[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const names = useMemo(() => new Map(options.map((o) => [o.slug, o.name])), [options]);

  function go(ids: string[], m: MetricKey[]) {
    const kept = new Map(selected.map((slug, i) => [slug, slots[i]]));
    const c: number[] = [];
    for (const slug of ids) {
      const slot = kept.get(slug) ?? [1, 2, 3, 4, 5, 6].find((n) => !c.includes(n) && ![...kept.entries()].some(([s, k]) => k === n && ids.includes(s)))!;
      c.push(slot);
    }
    const params = new URLSearchParams({ ids: ids.join(","), c: c.join(","), m: m.join(",") });
    start(() => router.replace(`/compare?${params}`, { scroll: false }));
  }

  const matches = query.trim().length < 1 ? [] : options
    .filter((o) => !selected.includes(o.slug) && o.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8);
  const full = selected.length >= MAX_COMPARE;

  return (
    <div className={`picker${pending ? " busy" : ""}`}>
      <div className="chips">
        {selected.map((slug, i) => (
          <span key={slug} className="chip">
            <i className={`dot s${slots[i]}`} />
            {names.get(slug) ?? slug}
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
        {selected.length > 0 && (
          <button type="button" className="link" onClick={() => go([selected[0], ...suggestPeers(selected[0], options, MAX_COMPARE - 2)], metrics)}>
            Suggest peers for {names.get(selected[0])}
          </button>
        )}
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
