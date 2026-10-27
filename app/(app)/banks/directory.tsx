"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDay } from "@/lib/earnings";
import { categoryLabel, formatAssets, shortQuarter, type Institution } from "@/lib/institutions";
import { FollowButton } from "../follow-button";

type SortKey = "name" | "assets_b" | "opportunity" | "next";

export type EarningsCell = {
  next: { date: string; estimated: boolean; period: string } | null;
  reported: { date: string; period: string } | null;
};

const OPPORTUNITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

type Props = {
  institutions: Institution[];
  followed: string[];
  earnings: Record<string, EarningsCell>;
};

export function Directory({ institutions, followed, earnings }: Props) {
  const router = useRouter();
  const followedSet = useMemo(() => new Set(followed), [followed]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [opportunity, setOpportunity] = useState("all");
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [sort, setSort] = useState<SortKey>("assets_b");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = institutions.filter((i) => {
      if (onlyFollowed && !followedSet.has(i.slug)) return false;
      if (category !== "all" && i.category !== category) return false;
      if (opportunity !== "all" && i.opportunity !== opportunity) return false;
      if (!q) return true;
      return [i.name, i.ticker, i.hq].some((v) => v?.toLowerCase().includes(q));
    });
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "next") {
        return (earnings[a.slug]?.next?.date ?? "9999").localeCompare(earnings[b.slug]?.next?.date ?? "9999");
      }
      if (sort === "opportunity") {
        return (OPPORTUNITY_RANK[a.opportunity ?? ""] ?? 9) - (OPPORTUNITY_RANK[b.opportunity ?? ""] ?? 9)
          || (b.assets_b ?? 0) - (a.assets_b ?? 0);
      }
      return (b.assets_b ?? 0) - (a.assets_b ?? 0);
    });
  }, [institutions, query, category, opportunity, onlyFollowed, followedSet, earnings, sort]);

  const sortButton = (key: SortKey, label: string) => (
    <button type="button" onClick={() => setSort(key)}>{label}{sort === key ? " ↓" : ""}</button>
  );

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
        <label className="toggle">
          <input type="checkbox" checked={onlyFollowed} onChange={(e) => setOnlyFollowed(e.target.checked)} />
          Following only ({followedSet.size})
        </label>
      </div>
      <div className="count">
        {rows.length} of {institutions.length} institutions
        {rows.length === 0 && <> · Not covered yet? <Link href="/banks/request">Request a dashboard for it</Link></>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th aria-label="Follow" />
              <th>{sortButton("name", "Institution")}</th>
              <th>Type</th>
              <th className="num">{sortButton("assets_b", "Assets")}</th>
              <th>Dashboard data</th>
              <th>{sortButton("next", "Next results")}</th>
              <th>{sortButton("opportunity", "Opportunity")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const e = earnings[i.slug];
              return (
                <tr key={i.slug} onClick={() => router.push(`/banks/${i.slug}`)}>
                  <td className="star-cell">
                    <FollowButton slug={i.slug} name={i.name} following={followedSet.has(i.slug)} compact />
                  </td>
                  <td className="name-cell">
                    <Link href={`/banks/${i.slug}`} onClick={(ev) => ev.stopPropagation()}>{i.name}</Link>
                    {i.ticker && <span className="dim"> · {i.ticker}</span>}
                    <div className="dim">{i.hq}</div>
                  </td>
                  <td>{categoryLabel(i.category)}</td>
                  <td className="num">{formatAssets(i.assets_b)}</td>
                  <td>
                    {shortQuarter(i.latest_quarter)}
                    {e?.reported && e.reported.period !== shortQuarter(i.latest_quarter) && (
                      <div className="dim warn-text">{e.reported.period} out {formatDay(e.reported.date)}</div>
                    )}
                  </td>
                  <td>
                    {e?.next ? (
                      <>
                        {formatDay(e.next.date)}
                        <div className="dim">{e.next.period}{e.next.estimated ? " · estimated" : ""}</div>
                      </>
                    ) : "–"}
                  </td>
                  <td>
                    {i.opportunity && <span className={`badge ${i.opportunity.toLowerCase()}`}>{i.opportunity}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
