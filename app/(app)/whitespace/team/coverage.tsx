"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setAssignment } from "../../assign";

type Row = { slug: string; name: string; category: string; assets: string };
type Member = { id: string; name: string };

// Every institution and who on the team has it in their book. Assigning puts the
// bank in that person's book; × takes it out (they keep following it for news).
export function Coverage({ rows, members, owners: initial }: { rows: Row[]; members: Member[]; owners: Record<string, string[]> }) {
  const [owners, setOwners] = useState(initial);
  const [filter, setFilter] = useState<"all" | "unassigned" | "shared">("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  function change(slug: string, id: string, assign: boolean) {
    const before = owners;
    setOwners({ ...owners, [slug]: assign ? [...(owners[slug] ?? []), id] : (owners[slug] ?? []).filter((o) => o !== id) });
    setError(null);
    start(async () => {
      const res = await setAssignment(slug, id, assign);
      if (res.error) { setOwners(before); setError(res.error); }
    });
  }

  const count = (f: typeof filter) => rows.filter((r) => f === "all" || (f === "unassigned" ? !owners[r.slug]?.length : (owners[r.slug]?.length ?? 0) > 1)).length;
  const shown = rows.filter((r) => {
    const n = owners[r.slug]?.length ?? 0;
    return (filter === "all" || (filter === "unassigned" ? n === 0 : n > 1)) && (!q || r.name.toLowerCase().includes(q.toLowerCase()));
  });

  return (
    <div className="coverage">
      <div className="coverage-tools">
        <div className="seg" role="group" aria-label="Show">
          {(["all", "unassigned", "shared"] as const).map((f) => (
            <button key={f} type="button" className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "unassigned" ? "Unassigned" : "Shared"} <span className="dim">{count(f)}</span>
            </button>
          ))}
        </div>
        <input type="search" placeholder="Find a bank or credit union…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find" />
      </div>
      {error && <div className="notice error">{error}</div>}
      <ul className="coverage-list">
        {shown.map((r) => {
          const mine = owners[r.slug] ?? [];
          const free = members.filter((m) => !mine.includes(m.id));
          return (
            <li key={r.slug}>
              <span className="coverage-bank">
                <Link href={`/banks/${r.slug}`}>{r.name}</Link>
                <span className="dim">{r.assets}</span>
              </span>
              <span className="coverage-owners">
                {mine.length === 0 && <span className="dim">Unassigned</span>}
                {mine.map((id) => (
                  <span key={id} className="owner-chip">
                    {nameOf.get(id) ?? "Someone"}
                    <button type="button" aria-label={`Take ${r.name} out of ${nameOf.get(id)}'s book`} title="Take out of their book" onClick={() => change(r.slug, id, false)}>×</button>
                  </span>
                ))}
                {free.length > 0 && (
                  <select value="" aria-label={`Assign ${r.name}`} onChange={(e) => e.target.value && change(r.slug, e.target.value, true)}>
                    <option value="">{mine.length ? "+ Add" : "Assign to…"}</option>
                    {free.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
              </span>
            </li>
          );
        })}
        {shown.length === 0 && <li className="dim">Nothing matches.</li>}
      </ul>
    </div>
  );
}
