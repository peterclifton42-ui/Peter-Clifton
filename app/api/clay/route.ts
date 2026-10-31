import { NextResponse, type NextRequest } from "next/server";
import { bookSlugs } from "@/lib/follows";
import { PERSONAS, ROLE_LABEL, personasFor, titleMatches, type PersonaId, type Role } from "@/lib/personas";
import { PRODUCTS, effectivePriority, productBySlug, productFor, type CatalogueProduct, type DashboardProduct } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { WHITESPACE_COLUMNS, applicability, lostExpired, type WhitespaceRow } from "@/lib/whitespace";

// A CSV for Clay's "Find people": one row per institution x persona, with the
// company domain, the title keywords to include and exclude, seniority and
// department, plus anyone the research already names for that persona.
//   ?product=<slug>&scope=targets|book|all   one product across institutions
//   ?bank=<slug>                             one institution's priority 1-2 products
export const dynamic = "force-dynamic";

type Inst = { slug: string; name: string; category: string; assets_b: number | null; hq: string | null; current_snapshot_id: number | null };
type Exec = { name?: string; title?: string };
type Research = { slug: string; products: DashboardProduct[] | null; dnr_products: { name?: string }[] | null };

const COLUMNS = [
  "Company Name", "Company Domain", "Institution Type", "Assets ($B)", "HQ", "Product", "Research Priority", "Fit",
  "Role in Deal", "Persona", "Job Titles", "Title Keywords (include)", "Title Keywords (exclude)", "Seniority", "Department",
  "Known Contacts (research)", "Persona Source", "Curinos Persona Page", "App Link",
];

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const domainOf = (url: string | null | undefined) =>
  (url ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();

export async function GET(request: NextRequest) {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).single();
  if (!profile || profile.role === "pending") return NextResponse.json({ error: "Your account doesn't have access yet." }, { status: 403 });

  const q = request.nextUrl.searchParams;
  const bankSlug = q.get("bank");
  const product = q.get("product") ? productBySlug(q.get("product")!) : null;
  const scope = q.get("scope") ?? "targets";
  if (!bankSlug && !product) return NextResponse.json({ error: "Choose a product or a bank." }, { status: 400 });

  let instQuery = db.from("institutions").select("slug, name, category, assets_b, hq, current_snapshot_id").not("current_snapshot_id", "is", null);
  if (bankSlug) instQuery = instQuery.eq("slug", bankSlug);
  else if (scope === "book") instQuery = instQuery.in("slug", [...await bookSlugs(userId)]);
  const [{ data: insts }, { data: research }, { data: ws }] = await Promise.all([
    instQuery,
    db.from("insight_inputs").select("slug, products, dnr_products"),
    db.from("whitespace").select(WHITESPACE_COLUMNS),
  ]);
  const institutions = (insts ?? []) as Inst[];
  if (!institutions.length) {
    return NextResponse.json({ error: scope === "book" && !bankSlug ? "Your book is empty: mark banks as My account on their page first." : "No institutions to export." }, { status: 404 });
  }
  const { data: snaps } = await db.from("snapshots")
    .select("id, website:data->basic->website, execs:data->contacts->execs")
    .in("id", institutions.map((i) => i.current_snapshot_id!));
  const snapBy = new Map((snaps ?? []).map((s) => [s.id as number, s as { website: string | null; execs: Exec[] | null }]));
  const researchBy = new Map(((research ?? []) as Research[]).map((r) => [r.slug, r]));
  // Products the team has closed off (client, not a fit, recently lost) aren't prospected.
  const closed = new Set(((ws ?? []) as WhitespaceRow[])
    .filter((w) => !lostExpired(w) && ["client", "not_fit", "lost_pipeline", "lost_renewal"].includes(w.status))
    .map((w) => `${w.slug}|${w.product_slug}`));

  const lines: string[] = [COLUMNS.join(",")];
  const origin = request.nextUrl.origin;
  let count = 0;
  for (const inst of institutions.sort((a, b) => Number(b.assets_b ?? 0) - Number(a.assets_b ?? 0))) {
    const r = researchBy.get(inst.slug);
    const ruledOut = new Set((r?.dnr_products ?? []).map((d) => productFor(d.name)?.slug));
    const rated = new Map<string, DashboardProduct>();
    for (const dp of r?.products ?? []) { const p = productFor(dp.name); if (p && !rated.has(p.slug)) rated.set(p.slug, dp); }
    const products: CatalogueProduct[] = product ? [product] : PRODUCTS;
    for (const p of products) {
      if (closed.has(`${inst.slug}|${p.slug}`) || ruledOut.has(p.slug) || !applicability(p, inst).ok) continue;
      const dp = rated.get(p.slug);
      const pri = dp ? effectivePriority(p, dp) : null;
      // A bank export and the "targets" scope take only research priority 1-2.
      if ((bankSlug || scope === "targets") && !(pri && pri <= 2)) continue;
      const map = personasFor(p.slug);
      if (!map) continue;
      const snap = snapBy.get(inst.current_snapshot_id!);
      const cu = inst.category === "credit_union";
      const seen = new Set<PersonaId>();
      for (const line of map.lines) {
        if (seen.has(line.id)) continue;
        seen.add(line.id);
        const known = (snap?.execs ?? []).filter((e) => e.name && titleMatches(line.persona, e.title)).map((e) => `${e.name} (${e.title})`);
        const row = [
          inst.name, domainOf(snap?.website), cu ? "Credit union" : "Bank", inst.assets_b ?? "", inst.hq ?? "", p.name,
          pri ? `P${pri}` : "", dp?.fit ?? "", ROLE_LABEL[line.role as Role], line.persona.label,
          (cu ? line.persona.cuTitles : line.persona.titles).join("; "),
          line.persona.include.join(", "), line.persona.exclude.join(", "), line.persona.seniority.join(", "), line.persona.department,
          known.join("; "), line.site ? "curinos.com persona page" : "Draft map (pending review)", line.persona.page ?? "",
          `${origin}/banks/${inst.slug}`,
        ];
        lines.push(row.map(csvCell).join(","));
        count++;
      }
    }
  }
  if (!count) return NextResponse.json({ error: "Nothing to export: no institution in this selection needs it." }, { status: 404 });
  const name = (bankSlug ? institutions[0].name : `${product!.name} ${scope}`).replace(/[^\w &-]+/g, "").trim();
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Clay - ${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
