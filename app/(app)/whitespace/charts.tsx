"use client";

import Link from "next/link";
import { useState } from "react";
import { formatUsd, type Pair } from "@/lib/whitespace-core";

// Whitespace charts. Two series only - validated (blue) and in play (green) -
// stacked with a 2px gap, 4px rounded data-ends, hover tooltips on every mark.

export type { Pair };

const SERIES = [
  { key: "validated", label: "Validated whitespace", cls: "ws-c-validated" },
  { key: "inPlay", label: "In play", cls: "ws-c-in_play" },
] as const;

export function Legend() {
  return (
    <div className="chart-legend">
      {SERIES.map((s) => <span key={s.key}><i className={`swatch ${s.cls}`} />{s.label}</span>)}
    </div>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((s) => s >= v)) ?? v;
}

// A bar with only its far end rounded (r=4), anchored square to the baseline.
function bar(x: number, y: number, w: number, h: number, end: "top" | "right" | "none") {
  if (w <= 0 || h <= 0) return "";
  const r = Math.min(4, end === "top" ? w / 2 : h / 2, end === "top" ? h : w);
  if (end === "top") return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  if (end === "right") return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
  return `M${x},${y} h${w} v${h} h${-w} Z`;
}

function Tip({ title, pair, left, top }: { title: string; pair: Pair; left: number; top: number }) {
  return (
    <div className="chart-tip" style={{ left: `${left}%`, top }} data-flip={left > 60 ? "" : undefined}>
      <strong>{title}</strong>
      <span><i className="dot ws-c-validated" />Validated<b>{formatUsd(pair.validated) || "$0"} · {pair.vCount}</b></span>
      <span><i className="dot ws-c-in_play" />In play<b>{formatUsd(pair.inPlay) || "$0"} · {pair.ipCount}</b></span>
      <span className="tip-total">Total<b>{formatUsd(pair.validated + pair.inPlay) || "$0"}</b></span>
    </div>
  );
}

// Columns: opportunity by target quarter.
export function QuarterColumns({ quarters }: { quarters: { label: string; pair: Pair }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 250, P = { top: 20, right: 8, bottom: 28, left: 48 };
  const max = niceMax(Math.max(...quarters.map((q) => q.pair.validated + q.pair.inPlay), 0));
  const band = (W - P.left - P.right) / Math.max(quarters.length, 1);
  const bw = Math.min(40, band * 0.56);
  const y = (v: number) => P.top + (H - P.top - P.bottom) * (1 - v / max);
  const ticks = [0, max / 2, max];
  if (!quarters.length) return <p className="dim">No pursuits with a quarter yet.</p>;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Opportunity by target quarter">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.left} x2={W - P.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={P.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{formatUsd(t) || "$0"}</text>
          </g>
        ))}
        {quarters.map((q, i) => {
          const x = P.left + band * i + (band - bw) / 2;
          const vH = y(0) - y(q.pair.validated);
          const ipH = y(0) - y(q.pair.inPlay);
          const gap = vH > 0 && ipH > 0 ? 2 : 0;
          const total = q.pair.validated + q.pair.inPlay;
          return (
            <g key={q.label} className={hover === i ? "on" : ""}>
              <path d={bar(x, y(0) - vH, bw, vH, ipH > 0 ? "none" : "top")} className="ws-c-validated" />
              <path d={bar(x, y(0) - vH - gap - ipH, bw, ipH, "top")} className="ws-c-in_play" />
              {total > 0 && <text x={x + bw / 2} y={y(total) - gap - 5} className="value" textAnchor="middle">{formatUsd(total)}</text>}
              <text x={x + bw / 2} y={H - 8} className="tick" textAnchor="middle">{q.label}</text>
              <rect x={P.left + band * i} y={P.top} width={band} height={H - P.top - P.bottom} className="hit"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hover != null && <Tip title={quarters[hover].label} pair={quarters[hover].pair}
        left={((P.left + band * hover + band / 2) / W) * 100} top={8} />}
    </div>
  );
}

// Horizontal bars: opportunity by bank, or by product pillar.
export function RowBars({ rows }: { rows: { label: string; href?: string; pair: Pair }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...rows.map((r) => r.pair.validated + r.pair.inPlay), 0));
  if (!rows.length) return <p className="dim">Nothing yet.</p>;
  return (
    <div className="row-bars">
      {rows.map((r, i) => {
        const total = r.pair.validated + r.pair.inPlay;
        const vw = (r.pair.validated / max) * 100, ipw = (r.pair.inPlay / max) * 100;
        return (
          <div key={r.label} className="row-bar" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="row-label">{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</span>
            <span className="row-track">
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
                <path d={bar(0, 0, vw, 10, r.pair.inPlay > 0 ? "none" : "right")} className="ws-c-validated" />
                <path d={bar(vw + (vw > 0 && ipw > 0 ? 0.6 : 0), 0, ipw, 10, "right")} className="ws-c-in_play" />
              </svg>
              <b>{formatUsd(total) || "–"}</b>
            </span>
            {hover === i && <Tip title={r.label} pair={r.pair} left={55} top={-4} />}
          </div>
        );
      })}
    </div>
  );
}

// Lines: validated and in-play ACV each week, from the weekly snapshots.
export function TrendLines({ weeks }: { weeks: { week: string; validated: number; inPlay: number; vCount: number; ipCount: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 250, P = { top: 16, right: 14, bottom: 28, left: 48 };
  if (weeks.length < 2) return <p className="dim">The trend starts after two weekly snapshots (taken every Monday).</p>;
  const max = niceMax(Math.max(...weeks.map((w) => Math.max(w.validated, w.inPlay))));
  const x = (i: number) => P.left + (i * (W - P.left - P.right)) / (weeks.length - 1);
  const y = (v: number) => P.top + (H - P.top - P.bottom) * (1 - v / max);
  const line = (k: "validated" | "inPlay") => weeks.map((w, i) => `${i ? "L" : "M"}${x(i)},${y(w[k])}`).join(" ");
  const label = (w: string) => new Date(`${w}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const every = Math.ceil(weeks.length / 6);
  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(weeks.length - 1, Math.round(((e.clientX - box.left) / box.width) * (weeks.length - 1)))));
  }
  const last = weeks.length - 1;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Validated and in-play opportunity by week">
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={P.left} x2={W - P.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={P.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{formatUsd(t) || "$0"}</text>
          </g>
        ))}
        {weeks.map((w, i) => (i % every === last % every) && <text key={w.week} x={x(i)} y={H - 8} className="tick" textAnchor="middle">{label(w.week)}</text>)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={P.top} y2={H - P.bottom} className="crosshair" />}
        <path d={line("validated")} className="line ws-c-validated" />
        <path d={line("inPlay")} className="line ws-c-in_play" />
        {[hover ?? last].map((i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(weeks[i].validated)} r={4} className="ws-c-validated pt" />
            <circle cx={x(i)} cy={y(weeks[i].inPlay)} r={4} className="ws-c-in_play pt" />
          </g>
        ))}
        <rect x={P.left} y={0} width={W - P.left - P.right} height={H} className="hit" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover != null && <Tip title={`Week of ${label(weeks[hover].week)}`} pair={weeks[hover]} left={(x(hover) / W) * 100} top={8} />}
    </div>
  );
}
