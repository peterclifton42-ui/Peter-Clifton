import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { askConfigured } from "@/lib/ask/agent";
import { memberNames } from "@/lib/people";
import { productBySlug } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, WHITESPACE_COLUMNS, formatQuarter, formatUsd, type WhitespaceRow } from "@/lib/whitespace";
import { ConvertButtons, StatusPill } from "../../../../whitespace/editor";
import { loadInstitution } from "../../bank-bar";
import { PlanView } from "./plan-view";

type Props = { params: Promise<{ slug: string; product: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, product } = await params;
  const [inst, p] = [await loadInstitution(slug), productBySlug(product)];
  return { title: inst && p ? `${p.name} at ${inst.name} · Engagement plan` : "Not found" };
}

// The engagement plan for one pursuit: the latest saved plan, or a button to write one.
export default async function PlanPage({ params }: Props) {
  const { slug, product: productSlug } = await params;
  const institution = await loadInstitution(slug);
  const product = productBySlug(productSlug);
  if (!institution || !product) notFound();
  const supabase = await createClient();
  const [{ data: plans }, { data: row }, { data: snap }, people] = await Promise.all([
    supabase.from("engagement_plans").select("plan, created_by, created_at").eq("slug", slug).eq("product_slug", productSlug).order("created_at", { ascending: false }).limit(1),
    supabase.from("whitespace").select(WHITESPACE_COLUMNS).eq("slug", slug).eq("product_slug", productSlug).maybeSingle(),
    supabase.from("snapshots").select("loaded_at").eq("id", institution.current_snapshot_id ?? -1).maybeSingle(),
    memberNames(),
  ]);
  const plan = plans?.[0] ?? null;
  const ws = row as WhitespaceRow | null;
  // A plan written before the dashboard's latest refresh may be missing new facts.
  const outdated = Boolean(plan && snap?.loaded_at && plan.created_at < snap.loaded_at);

  return (
    <main className="page plan-page">
      <p className="crumbs"><Link href={`/banks/${slug}`}>{institution.name}</Link> · <Link href={`/banks/${slug}/whitespace`}>Whitespace</Link></p>
      <div className="page-head">
        <div>
          <h1>Engagement plan: {product.name}</h1>
          <p>
            {institution.name}
            {ws && <> · <StatusPill status={ws.status} /> {ws.target_quarter && <>· {formatQuarter(ws.target_quarter)} </>}{ws.acv_usd ? <>· {formatUsd(ws.acv_usd)}</> : null}</>}
          </p>
        </div>
        {ws && (ws.status === "validated" || ws.status === "in_play") && (
          <ConvertButtons target={{
            slug, bankName: institution.name, productSlug, productName: product.name, applies: true,
            row: { status: ws.status, target_quarter: ws.target_quarter, acv_usd: ws.acv_usd, lost_on: ws.lost_on, note: ws.note },
          }} />
        )}
      </div>
      {ws?.note && <p className="ws-hint">Team note: {ws.note}</p>}
      {!ws && <p className="ws-hint">This product isn&apos;t in whitespace yet. Plans work best for pursuits marked {STATUSES.validated.short} or {STATUSES.in_play.short}.</p>}
      <PlanView
        slug={slug} productSlug={productSlug} title={`${product.name} at ${institution.name}`}
        initial={plan?.plan ?? null}
        meta={plan ? `Written ${new Date(plan.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })} by ${people.get(plan.created_by ?? "") ?? "a teammate"}` : null}
        outdated={outdated}
        enabled={askConfigured()}
      />
    </main>
  );
}
