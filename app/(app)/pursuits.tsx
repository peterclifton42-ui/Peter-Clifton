import Link from "next/link";
import { formatQuarter, formatUsd, quarterOf, type WhitespaceRow } from "@/lib/whitespace";
import { ConvertButtons, StatusPill } from "./whitespace/editor";

export type Pursuit = { row: WhitespaceRow; bankName: string; productName: string; owner?: string; hasPlan: boolean };

// Validated and in-play pursuits with one-click conversions and the engagement plan.
// Used by the Home "This quarter's pursuits" tile and each bank's Whitespace page.
export function PursuitList({ pursuits, showBank = true }: { pursuits: Pursuit[]; showBank?: boolean }) {
  const now = quarterOf(new Date());
  return (
    <ul className="pursuits">
      {pursuits.map(({ row: r, bankName, productName, owner, hasPlan }) => {
        const overdue = Boolean(r.target_quarter && r.target_quarter < now);
        return (
          <li key={`${r.slug}-${r.product_slug}`} className={`pursuit pursuit-${r.status}`}>
            <div className="pursuit-main">
              <div className="pursuit-head">
                {showBank && <><Link href={`/banks/${r.slug}/whitespace`} className="play-bank">{bankName}</Link><span className="play-x" aria-hidden>×</span></>}
                <Link href={`/products/${r.product_slug}`} className="play-product">{productName}</Link>
              </div>
              <div className="play-meta">
                <StatusPill status={r.status} />
                {r.acv_usd != null && <b className="pursuit-acv">{formatUsd(r.acv_usd)}</b>}
                {r.target_quarter && <span className={overdue ? "warn-text" : "dim"}>{overdue ? `Overdue: planned for ${formatQuarter(r.target_quarter)}` : formatQuarter(r.target_quarter)}</span>}
                {owner && <span className="dim">{owner}</span>}
                {r.note && <span className="dim pursuit-note" title={r.note}>{r.note}</span>}
              </div>
            </div>
            <div className="pursuit-actions">
              <Link href={`/banks/${r.slug}/plan/${r.product_slug}`} className={`button ${hasPlan ? "secondary" : ""} plan-btn`}>
                {hasPlan ? "Open engagement plan" : "Generate engagement plan"}
              </Link>
              <ConvertButtons
                roll={r.status === "validated" && (!r.target_quarter || r.target_quarter <= now)}
                target={{
                  slug: r.slug, bankName, productSlug: r.product_slug, productName, applies: true,
                  row: { status: r.status, target_quarter: r.target_quarter, acv_usd: r.acv_usd, lost_on: r.lost_on, note: r.note },
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Days left in the current quarter.
export function daysLeftInQuarter(today = new Date()) {
  const end = Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3 + 3, 1);
  return Math.max(0, Math.ceil((end - today.getTime()) / 86400000));
}

export const isPursuit = (r: WhitespaceRow) => r.status === "validated" || r.status === "in_play";
