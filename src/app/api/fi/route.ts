import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { FiSearchCandidate } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const candidate = (await req.json()) as FiSearchCandidate;

  if (!candidate.name || !candidate.fi_type) {
    return NextResponse.json(
      { error: "name and fi_type are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();

  const orFilters: string[] = [];
  if (candidate.fdic_cert) orFilters.push(`fdic_cert.eq.${candidate.fdic_cert}`);
  if (candidate.sec_cik) orFilters.push(`sec_cik.eq.${candidate.sec_cik}`);
  if (candidate.ncua_charter)
    orFilters.push(`ncua_charter.eq.${candidate.ncua_charter}`);

  if (orFilters.length > 0) {
    const { data: existing } = await supabase
      .from("financial_institutions")
      .select("*")
      .or(orFilters.join(","))
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ fi: existing });
    }
  }

  const { data: created, error } = await supabase
    .from("financial_institutions")
    .insert({
      name: candidate.name,
      fi_type: candidate.fi_type,
      city: candidate.city,
      state: candidate.state,
      fdic_cert: candidate.fdic_cert,
      sec_cik: candidate.sec_cik,
      ncua_charter: candidate.ncua_charter,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ fi: created });
}
