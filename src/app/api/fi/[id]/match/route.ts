import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { matchProductsForFi, MATCHING_MODEL } from "@/lib/matching";
import type {
  FiFinancials,
  FinancialInstitution,
  FiNewsItem,
  Product,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/fi/[id]/match">,
) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();

  const { data: fi, error: fiError } = await supabase
    .from("financial_institutions")
    .select("*")
    .eq("id", id)
    .single<FinancialInstitution>();

  if (fiError || !fi) {
    return NextResponse.json({ error: "Financial institution not found" }, { status: 404 });
  }

  const [{ data: financials }, { data: news }, { data: products }] = await Promise.all([
    supabase
      .from("fi_financials")
      .select("*")
      .eq("fi_id", id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle<FiFinancials>(),
    supabase
      .from("fi_news")
      .select("*")
      .eq("fi_id", id)
      .order("published_at", { ascending: false })
      .limit(10)
      .returns<FiNewsItem[]>(),
    supabase.from("products").select("*").returns<Product[]>(),
  ]);

  if (!products || products.length === 0) {
    return NextResponse.json({ error: "Product catalog is empty" }, { status: 500 });
  }

  let matches;
  try {
    matches = await matchProductsForFi(fi, financials ?? null, news ?? [], products);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const slugToId = new Map(products.map((p) => [p.slug, p.id]));
  const generatedAt = new Date().toISOString();

  const rows = matches
    .filter((m) => slugToId.has(m.product_slug))
    .map((m) => ({
      fi_id: fi.id,
      product_id: slugToId.get(m.product_slug)!,
      score: m.score,
      rationale: m.rationale,
      model: MATCHING_MODEL,
      financials_fetched_at: financials?.fetched_at ?? null,
      news_fetched_at: news?.[0]?.fetched_at ?? null,
      generated_at: generatedAt,
    }));

  await supabase.from("fi_product_matches").delete().eq("fi_id", fi.id);
  const { error: insertError } = await supabase.from("fi_product_matches").insert(rows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
