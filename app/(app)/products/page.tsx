import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { followedSlugs } from "@/lib/follows";
import { inScope, parseScope, productDemand, type InsightInput } from "@/lib/insights";
import { PILLAR_ORDER, PRODUCTS, statusLabel } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { ScopeTabs } from "../scope-tabs";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const viewer = await requireViewer();
  const scope = parseScope((await searchParams).scope);
  const supabase = await createClient();
  const [{ data }, followed] = await Promise.all([
    supabase.from("insight_inputs").select("slug, category, products"),
    followedSlugs(viewer.id),
  ]);
  const rows = inScope((data ?? []) as InsightInput[], scope, followed);
  const demand = new Map(productDemand(rows).map((d) => [d.slug, d]));
  const q = scope === "all" ? "" : `?scope=${scope}`;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <p>Every Curinos product in the catalogue, with how many of {rows.length} dashboards rank it as a top priority. Open one for its target list.</p>
        </div>
      </div>
      <ScopeTabs path="/products" scope={scope} />
      {PILLAR_ORDER.map((pillar) => (
        <section key={pillar} className="panel">
          <h2>{pillar}</h2>
          <div className="product-grid">
            {PRODUCTS.filter((p) => p.pillar === pillar)
              .sort((a, b) => ((demand.get(b.slug)?.p1 ?? 0) + (demand.get(b.slug)?.p2 ?? 0)) - ((demand.get(a.slug)?.p1 ?? 0) + (demand.get(a.slug)?.p2 ?? 0)))
              .map((p) => {
                const d = demand.get(p.slug);
                const status = statusLabel(p);
                return (
                  <Link key={p.slug} href={`/products/${p.slug}${q}`} className="product-card">
                    <b>{p.name}</b>
                    {status && <span className={`badge status-${status.tone}`}>{status.label}</span>}
                    <span className="dim">
                      {d && d.p1 + d.p2 > 0 ? `Priority 1 at ${d.p1} · priority 2 at ${d.p2}` : "Not a top priority on any dashboard here"}
                    </span>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
    </main>
  );
}
