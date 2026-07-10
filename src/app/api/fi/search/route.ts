import { NextRequest, NextResponse } from "next/server";
import { searchFdicInstitutions } from "@/lib/data-sources/fdic";
import { searchSecCompanies } from "@/lib/data-sources/sec";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ candidates: [] });
  }

  const [fdicResults, secResults] = await Promise.all([
    searchFdicInstitutions(query).catch(() => []),
    searchSecCompanies(query).catch(() => []),
  ]);

  return NextResponse.json({ candidates: [...fdicResults, ...secResults] });
}
