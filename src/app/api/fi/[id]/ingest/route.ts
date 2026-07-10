import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getFdicFinancials } from "@/lib/data-sources/fdic";
import { getSecFinancials } from "@/lib/data-sources/sec";
import { getNewsForFi } from "@/lib/data-sources/news";
import type { FinancialInstitution } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/fi/[id]/ingest">,
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

  const errors: string[] = [];

  if (fi.fdic_cert) {
    try {
      const snapshot = await getFdicFinancials(fi.fdic_cert);
      if (snapshot.as_of_date) {
        await supabase.from("fi_financials").insert({
          fi_id: fi.id,
          as_of_date: snapshot.as_of_date,
          source: "fdic",
          metrics: snapshot.metrics,
          raw_payload: snapshot.raw,
        });
      }
    } catch (e) {
      errors.push(`FDIC financials: ${(e as Error).message}`);
    }
  } else if (fi.sec_cik) {
    try {
      const snapshot = await getSecFinancials(fi.sec_cik);
      if (snapshot.as_of_date) {
        await supabase.from("fi_financials").insert({
          fi_id: fi.id,
          as_of_date: snapshot.as_of_date,
          source: "sec_edgar",
          metrics: snapshot.metrics,
          raw_payload: null,
        });
      }
    } catch (e) {
      errors.push(`SEC financials: ${(e as Error).message}`);
    }
  }

  try {
    const news = await getNewsForFi(fi.name);
    if (news.length > 0) {
      await supabase
        .from("fi_news")
        .upsert(
          news.map((n) => ({
            fi_id: fi.id,
            title: n.title,
            url: n.url,
            source: n.source,
            published_at: n.published_at,
          })),
          { onConflict: "fi_id,url", ignoreDuplicates: true },
        );
    }
  } catch (e) {
    errors.push(`News: ${(e as Error).message}`);
  }

  return NextResponse.json({ ok: true, errors: errors.length ? errors : undefined });
}
