import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { followedSlugs } from "@/lib/follows";
import { formatAssets } from "@/lib/institutions";
import { inScope, parseScope, type InsightInput } from "@/lib/insights";
import { CATALOGUE_SOURCE, boldParts, effectivePriority, productBySlug, productFor, sellerBlocks, statusLabel } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { ScopeTabs } from "../../scope-tabs";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ scope?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: productBySlug((await params).slug)?.name ?? "Product" };
}

function Rich({ text }: { text: string }) {
  return <>{boldParts(text).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}</>;
}

export default async function ProductPage({ params, searchParams }: Props) {
  const product = productBySlug((await params).slug);
  if (!product) notFound();
  const viewer = await requireViewer();
  const scope = parseScope((await searchParams).scope);
  const supabase = await createClient();
  const [{ data }, followed] = await Promise.all([
    supabase.from("insight_inputs").select("slug, name, category, assets_b, opportunity, products, dnr_products"),
    followedSlugs(viewer.id),
  ]);
  const rows = inScope((data ?? []) as InsightInput[], scope, followed);

  const entries = rows.flatMap((r) => {
    const dp = (r.products ?? []).find((p) => productFor(p.name)?.slug === product.slug);
    const pri = dp && effectivePriority(product, dp);
    return dp && pri ? [{ r, dp, pri }] : [];
  }).sort((a, b) => a.pri - b.pri || (b.dp.fit ?? 0) - (a.dp.fit ?? 0));
  const top = entries.filter((e) => e.pri <= 2);
  const p3 = entries.filter((e) => e.pri === 3);
  const gated = rows.flatMap((r) => {
    const d = (r.dnr_products ?? []).find((p) => productFor(p.name)?.slug === product.slug);
    return d ? [{ r, reason: d.reason ?? "" }] : [];
  });
  const objections = new Map<string, { q: string; a: string; slug: string; name: string }>();
  for (const { r, dp } of entries) {
    for (const o of dp.objections ?? []) {
      if (o.q && o.a && !objections.has(o.q.toLowerCase())) objections.set(o.q.toLowerCase(), { q: o.q, a: o.a, slug: r.slug, name: r.name });
    }
  }
  const status = statusLabel(product);
  const blocks = sellerBlocks(product.body);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="crumb"><Link href="/products">Products</Link> · {product.pillar}</p>
          <h1>{product.name}</h1>
          <p>
            {status && <span className={`badge status-${status.tone}`}>{status.label}</span>}{" "}
            Priority 1 or 2 at <b>{top.length}</b> of {rows.length} institutions{p3.length > 0 && <>, priority 3 at {p3.length}</>}.
          </p>
        </div>
      </div>
      {product.status === "roadmap" && (
        <div className="notice error">Coming soon on curinos.com and not yet available to buy. Mention it only as direction of travel, after an available product is in play.</div>
      )}
      {product.status === "unlisted" && (
        <div className="notice error">No longer listed on curinos.com. Confirm availability with Product Marketing before proposing it.</div>
      )}
      <ScopeTabs path={`/products/${product.slug}`} scope={scope} />

      <div className="product-layout">
        <section className="panel">
          <h2>Who to call</h2>
          {top.length === 0 ? <p className="dim">No institution in this group ranks it as priority 1 or 2.</p> : (
            <ol className="targets">
              {top.map(({ r, dp, pri }) => (
                <li key={r.slug}>
                  <div className="target-head">
                    <Link href={`/banks/${r.slug}`}><b>{r.name}</b></Link>
                    {followed.has(r.slug) && <span className="star-on" title="You follow this bank">★</span>}
                    <span className={`badge pri-${pri}`}>Priority {pri}</span>
                    {typeof dp.fit === "number" && <span className="dim">Fit {dp.fit}</span>}
                    <span className="dim">{r.category === "credit_union" ? "Credit union" : "Bank"} · {formatAssets(r.assets_b)}</span>
                  </div>
                  {dp.why && <p>{dp.why}</p>}
                  {dp.talk && <p className="talk">“{dp.talk}”</p>}
                </li>
              ))}
            </ol>
          )}
          {p3.length > 0 && (
            <details>
              <summary>Priority 3 ({p3.length})</summary>
              <ul className="plain">{p3.map(({ r, dp }) => <li key={r.slug}><Link href={`/banks/${r.slug}`}>{r.name}</Link>{dp.why && <span className="dim"> — {dp.why}</span>}</li>)}</ul>
            </details>
          )}
          {gated.length > 0 && (
            <details>
              <summary>Ruled out ({gated.length})</summary>
              <ul className="plain">{gated.map(({ r, reason }) => <li key={r.slug}><Link href={`/banks/${r.slug}`}>{r.name}</Link><span className="dim"> — {reason}</span></li>)}</ul>
            </details>
          )}
        </section>

        <aside>
          <section className="panel">
            <h2>About it</h2>
            {blocks.map((b, i) => b.kind === "para"
              ? <p key={i}><Rich text={b.text} /></p>
              : (
                <div key={i}>
                  {b.title && <h3>{b.title}</h3>}
                  <ul>{b.items.map((t, j) => <li key={j}><Rich text={t} /></li>)}</ul>
                </div>
              ))}
            <p className="dim">From {CATALOGUE_SOURCE}.</p>
          </section>
          {objections.size > 0 && (
            <section className="panel">
              <h2>Objections and answers</h2>
              <ul className="qa">
                {[...objections.values()].slice(0, 8).map((o) => (
                  <li key={o.q}><p className="q">{o.q}</p><p className="a">{o.a}</p><Link href={`/banks/${o.slug}`} className="dim">{o.name}</Link></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
