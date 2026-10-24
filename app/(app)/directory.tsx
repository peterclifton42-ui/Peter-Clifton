"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { categoryLabel, formatAssets, shortQuarter, type Institution } from "@/lib/institutions";

type SortKey = "name" | "assets_b" | "opportunity";

const OPPORTUNITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function Directory({ institutions }: { institutions: Institution[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [opportunity, setOpportunity] = useState("all");
  const [sort, setSort] = useState<SortKey>("assets_b");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = institutions.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (opportunity !== "all" && i.opportunity !== opportunity) return false;
      if (!q) return true;
      return [i.name, i.ticker, i.hq].some((v) => v?.toLowerCase().includes(q));
    });
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "opportunity") {
        return (OPPORTUNITY_RANK[a.opportunity ?? ""] ?? 9) - (OPPORTUNITY_RANK[b.opportunity ?? ""] ?? 9)
          || (b.assets_b ?? 0) - (a.assets_b ?? 0);
      }
      return (b.assets_b ?? 0) - (a.assets_b ?? 0);
    });
  }, [institutions, query, category, opportunity, sort]);

  return (
    <>
      <div className="filters">
        <input
          className="search"
          type="search"
          placeholder="Search by name, ticker or state…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search institutions"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Type">
          <option value="all">Banks and credit unions</option>
          <option value="bank">Banks only</option>
          <option value="credit_union">Credit unions only</option>
        </select>
        <select value={opportunity} onChange={(e) => setOpportunity(e.target.value)} aria-label="Opportunity">
          <option value="all">Any opportunity</option>
          <option value="HIGH">High opportunity</option>
          <option value="MEDIUM">Medium opportunity</option>
          <option value="LOW">Low opportunity</option>
        </select>
      </div>
      <div className="count">
        {rows.length} of {institutions.length} institutions
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><button type="button" onClick={() => setSort("name")}>Institution{sort === "name" ? " ↓" : ""}</button></th>
              <th>Type</th>
              <th>Headquarters</th>
              <th className="num"><button type="button" onClick={() => setSort("assets_b")}>Assets{sort === "assets_b" ? " ↓" : ""}</button></th>
              <th>Latest data</th>
              <th><button type="button" onClick={() => setSort("opportunity")}>Opportunity{sort === "opportunity" ? " ↓" : ""}</button></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.slug} onClick={() => router.push(`/banks/${i.slug}`)}>
                <td className="name-cell">
                  <Link href={`/banks/${i.slug}`} onClick={(e) => e.stopPropagation()}>{i.name}</Link>
                  {i.ticker && <span className="dim"> · {i.ticker}</span>}
                </td>
                <td>{categoryLabel(i.category)}</td>
                <td>{i.hq ?? "–"}</td>
                <td className="num">{formatAssets(i.assets_b)}</td>
                <td>{shortQuarter(i.latest_quarter)}</td>
                <td>
                  {i.opportunity && <span className={`badge ${i.opportunity.toLowerCase()}`}>{i.opportunity}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
