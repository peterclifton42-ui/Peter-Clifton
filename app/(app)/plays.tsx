import Link from "next/link";
import { formatAssets } from "@/lib/institutions";
import type { Play } from "@/lib/plays";
import { EditTrigger } from "./whitespace/editor";

// The ranked "next best plays" list on Home and Products: bank × product pairs the
// research rates priority 1 or 2 that nobody has reviewed in whitespace yet.
export function PlayList({ plays, compact = false }: { plays: Play[]; compact?: boolean }) {
  return (
    <ol className={`plays${compact ? " compact" : ""}`}>
      {plays.map((p) => (
        <li key={`${p.slug}-${p.product.slug}`} className="play">
          <div className="play-main">
            <div className="play-head">
              <Link href={`/banks/${p.slug}`} className="play-bank">{p.bankName}</Link>
              <span className="play-x" aria-hidden>×</span>
              <Link href={`/products/${p.product.slug}`} className="play-product">{p.product.name}</Link>
            </div>
            <div className="play-meta">
              <span className={`badge pri-${p.pri}`}>Priority {p.pri}</span>
              {p.fit != null && (
                <span className="fit" title={`Fit score ${p.fit} of 100`}>
                  <span className="fit-bar"><i style={{ width: `${p.fit}%` }} /></span>Fit {p.fit}
                </span>
              )}
              <span className="dim">{p.category === "credit_union" ? "Credit union" : "Bank"} · {formatAssets(p.assets)}</span>
            </div>
            {p.why && !compact && <p className="play-why">{p.why}</p>}
            {p.talk && (
              <details className="play-talk">
                <summary>Opening line</summary>
                <p>“{p.talk}”</p>
              </details>
            )}
          </div>
          <div className="play-actions">
            <EditTrigger
              className="play-review"
              label={`Review ${p.product.name} at ${p.bankName} in whitespace`}
              target={{
                slug: p.slug, bankName: p.bankName, productSlug: p.product.slug, productName: p.product.name,
                applies: true, aiHint: `Research: priority P${p.pri}${p.fit != null ? `, fit ${p.fit}` : ""}.`, row: null,
              }}
            >
              Set status
            </EditTrigger>
            <Link href={`/banks/${p.slug}`} className="play-open">Open bank →</Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
