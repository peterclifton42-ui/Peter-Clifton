import { NextRequest, NextResponse } from "next/server";
import { searchFdicInstitutions } from "@/lib/data-sources/fdic";
import { searchSecCompanies } from "@/lib/data-sources/sec";
import { searchNcuaCreditUnions } from "@/lib/data-sources/ncua";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ candidates: [] });
  }

  const [fdicResults, secResults, ncuaResults] = await Promise.all([
    searchFdicInstitutions(query).catch(() => []),
    searchSecCompanies(query).catch(() => []),
    searchNcuaCreditUnions(query).catch(() => []),
  ]);

  return NextResponse.json({
    candidates: [...fdicResults, ...ncuaResults, ...secResults],
  });
}
