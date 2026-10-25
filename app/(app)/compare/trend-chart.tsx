"use client";

import { useState } from "react";
import { formatMetric, quarterLabel, type MetricKey } from "@/lib/metrics";

export type Series = { slug: string; name: string; color: number; values: (number | null)[] };

const W = 380, H = 190, PAD = { top: 10, right: 10, bottom: 24, left: 48 };

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

// One metric over time, one 2px line per institution, with a crosshair tooltip.
export function TrendChart({ metric, periods, series }: { metric: MetricKey; periods: string[]; series: Series[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (all.length < 2 || periods.length < 2) return <p className="dim">Not enough history to chart.</p>;

  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (periods.length - 1);
  const y = (v: number) => PAD.top + ((yMax - v) * (H - PAD.top - PAD.bottom)) / (yMax - yMin || 1);
  const path = (vals: (number | null)[]) =>
    vals.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
      .reduce<string[]>((segs, p, i, arr) => {
        if (p == null) return segs;
        segs.push(`${i === 0 || arr[i - 1] == null ? "M" : "L"}${p}`);
        return segs;
      }, []).join(" ");

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * (W - PAD.left - PAD.right);
    setHover(Math.max(0, Math.min(periods.length - 1, Math.round((px / (W - PAD.left - PAD.right)) * (periods.length - 1)))));
  }

  const tipLeft = hover == null ? 0 : (x(hover) / W) * 100;
  const rows = hover == null ? [] : series
    .map((s) => ({ s, v: s.values[hover] }))
    .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series.map((s) => s.name).join(", ")} over time`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {formatMetric(metric, t).replace(/^\+/, "")}
            </text>
          </g>
        ))}
        {periods.map((p, i) => (i % 2 === (periods.length - 1) % 2 || periods.length <= 5) && (
          <text key={p} x={x(i)} y={H - 6} className="tick" textAnchor="middle">{quarterLabel(p).replace(" 20", " ’")}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="crosshair" />}
        {series.map((s) => (
          <g key={s.slug} className={`series s${s.color}`}>
            <path d={path(s.values)} />
            {s.values.map((v, i) => v != null && (i === s.values.length - 1 || i === hover) && (
              <circle key={i} cx={x(i)} cy={y(v)} r={4} />
            ))}
          </g>
        ))}
        <rect x={PAD.left} y={0} width={W - PAD.left - PAD.right} height={H} className="hit"
          onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${tipLeft}%` }} data-flip={tipLeft > 60 ? "" : undefined}>
          <strong>{quarterLabel(periods[hover])}</strong>
          {rows.map(({ s, v }) => (
            <span key={s.slug}><i className={`dot s${s.color}`} />{s.name}<b>{formatMetric(metric, v)}</b></span>
          ))}
        </div>
      )}
    </div>
  );
}
