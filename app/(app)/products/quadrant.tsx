"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type QuadPoint = { slug: string; name: string; demand: number; fit: number; pipeline: number; flag: string | null; label: boolean };

const QUADS = [
  { key: "lead", title: "Lead with these", hint: "Needed widely, strong fit" },
  { key: "case", title: "Build the case", hint: "Needed widely, weaker fit" },
  { key: "niche", title: "Niche wins", hint: "Fewer need it, strong fit" },
  { key: "park", title: "Park for now", hint: "Fewer need it, weaker fit" },
] as const;

function usd(n: number) {
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : n ? `$${n}` : "$0";
}

// Demand (how many dashboards rank it priority 1 or 2) against average fit. The
// split lines sit at the medians, so the quadrants are relative to this catalogue.
export function Quadrant({ points, total, scope }: { points: QuadPoint[]; total: number; scope: string }) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const W = 760, H = 430, P = { l: 52, r: 24, t: 20, b: 48 };
  const maxX = Math.max(4, ...points.map((p) => p.demand));
  const fits = points.map((p) => p.fit);
  const minY = Math.max(0, Math.floor((Math.min(...fits) - 4) / 5) * 5), maxY = Math.min(100, Math.ceil((Math.max(...fits) + 3) / 5) * 5);
  const x = (v: number) => P.l + (v / maxX) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - minY) / (maxY - minY)) * (H - P.t - P.b);
  const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const mx = median(points.map((p) => p.demand)), my = median(fits);
  const maxPipe = Math.max(1, ...points.map((p) => p.pipeline));
  const r = (p: QuadPoint) => 6 + Math.sqrt(p.pipeline / maxPipe) * 12;
  const quad = (p: QuadPoint) => (p.demand >= mx ? (p.fit >= my ? "lead" : "case") : (p.fit >= my ? "niche" : "park"));
  const xTicks = [0, Math.round(maxX / 4), Math.round(maxX / 2), Math.round((3 * maxX) / 4), maxX];
  const yTicks = Array.from({ length: Math.floor((maxY - minY) / 5) + 1 }, (_, i) => minY + i * 5).filter((v, i, a) => a.length <= 6 || i % 2 === 0);
  const h = points.find((p) => p.slug === hover);

  // Direct labels only where they fit: try left of the bubble, then right, and skip
  // any that would overlap a bubble or another label (hover and the key cover the rest).
  type Box = { x1: number; y1: number; x2: number; y2: number };
  const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  const bubbles: Box[] = points.map((p) => ({ x1: x(p.demand) - r(p), y1: y(p.fit) - r(p), x2: x(p.demand) + r(p), y2: y(p.fit) + r(p) }));
  const placed: Box[] = [];
  const labels = new Map<string, { x: number; anchor: "start" | "end" }>();
  for (const p of [...points].filter((p) => p.label).sort((a, b) => b.demand - a.demand)) {
    const w = p.name.length * 6.4, cx = x(p.demand), cy = y(p.fit), rr = r(p);
    for (const side of ["end", "start"] as const) {
      const lx = side === "end" ? cx - rr - 5 : cx + rr + 5;
      const box = { x1: side === "end" ? lx - w : lx, y1: cy - 8, x2: side === "end" ? lx : lx + w, y2: cy + 8 };
      const own = (b: Box) => Math.abs((b.x1 + b.x2) / 2 - cx) < 0.5 && Math.abs((b.y1 + b.y2) / 2 - cy) < 0.5;
      if (box.x1 < P.l || box.x2 > W - P.r) continue;
      if (placed.some((b) => hit(b, box)) || bubbles.some((b) => !own(b) && hit(b, box))) continue;
      placed.push(box);
      labels.set(p.slug, { x: lx, anchor: side });
      break;
    }
  }
  const q = scope === "all" ? "" : `?scope=${scope}`;

  return (
    <div className="quad">
      <div className="chart quad-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Products by how many of ${total} dashboards rank them priority 1 or 2 and their average fit`}>
          <rect x={x(mx)} y={P.t} width={W - P.r - x(mx)} height={y(my) - P.t} className="quad-lead" />
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="grid" />
              <text x={P.l - 8} y={y(v)} className="tick" textAnchor="end" dominantBaseline="middle">{v}</text>
            </g>
          ))}
          {xTicks.map((v) => <text key={v} x={x(v)} y={H - P.b + 18} className="tick" textAnchor="middle">{v}</text>)}
          <line x1={x(mx)} x2={x(mx)} y1={P.t} y2={H - P.b} className="quad-split" />
          <line x1={P.l} x2={W - P.r} y1={y(my)} y2={y(my)} className="quad-split" />
          <text x={W - P.r - 6} y={P.t + 16} className="quad-name lead" textAnchor="end">Lead with these</text>
          <text x={P.l + 8} y={P.t + 16} className="quad-name">Niche wins</text>
          <text x={W - P.r - 6} y={H - P.b - 8} className="quad-name" textAnchor="end">Build the case</text>
          <text x={P.l + 8} y={H - P.b - 8} className="quad-name">Park for now</text>
          <text x={(P.l + W - P.r) / 2} y={H - 6} className="axis-label" textAnchor="middle">Dashboards ranking it priority 1 or 2 (of {total}) →</text>
          <text x={14} y={(P.t + H - P.b) / 2} className="axis-label" textAnchor="middle" transform={`rotate(-90 14 ${(P.t + H - P.b) / 2})`}>Average fit →</text>
          {[...points].sort((a, b) => b.pipeline - a.pipeline).map((p) => (
            <g key={p.slug} className={`dot q-${quad(p)}${hover === p.slug ? " on" : ""}${p.flag ? " flagged" : ""}`}
              onMouseEnter={() => setHover(p.slug)} onMouseLeave={() => setHover(null)}
              onClick={() => router.push(`/products/${p.slug}${q}`)} role="link" tabIndex={0} aria-label={`${p.name}: ${p.demand} dashboards, fit ${p.fit}`}
              onKeyDown={(e) => { if (e.key === "Enter") router.push(`/products/${p.slug}${q}`); }}
              onFocus={() => setHover(p.slug)} onBlur={() => setHover(null)}>
              <circle cx={x(p.demand)} cy={y(p.fit)} r={r(p) + 4} className="hit" />
              <circle cx={x(p.demand)} cy={y(p.fit)} r={r(p)} />
              {labels.has(p.slug) && <text x={labels.get(p.slug)!.x} y={y(p.fit) + 4} className="dot-label" textAnchor={labels.get(p.slug)!.anchor}>{p.name}</text>}
            </g>
          ))}
        </svg>
        {h && (
          <div className="chart-tip" style={{ left: `${(x(h.demand) / W) * 100}%`, top: `${(y(h.fit) / H) * 100}%` }} data-flip={x(h.demand) / W > 0.6 ? "" : undefined}>
            <strong>{h.name}</strong>
            <span>Priority 1–2 at<b>{h.demand} of {total}</b></span>
            <span>Average fit<b>{h.fit}</b></span>
            <span>Pipeline<b>{usd(h.pipeline)}</b></span>
            {h.flag && <span className="tip-flag">{h.flag}</span>}
          </div>
        )}
      </div>
      <ul className="quad-key">
        {QUADS.map((k) => {
          const inQ = points.filter((p) => quad(p) === k.key).sort((a, b) => b.demand - a.demand);
          return (
            <li key={k.key} className={`q-${k.key}`}>
              <b>{k.title}</b><span className="dim">{k.hint}</span>
              <span className="quad-names">
                {inQ.slice(0, 5).map((p, i) => <span key={p.slug}>{i > 0 && " · "}<Link href={`/products/${p.slug}${q}`}>{p.name}</Link></span>)}
                {inQ.length > 5 && <span className="dim"> +{inQ.length - 5}</span>}
                {inQ.length === 0 && <span className="dim">None</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="dim small">Bubble size shows pipeline (validated + in play) already set in Whitespace. Split lines are the medians. Hollow bubbles are roadmap or need availability confirmed.</p>
    </div>
  );
}
