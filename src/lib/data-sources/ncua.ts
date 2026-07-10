import type { FiSearchCandidate } from "@/lib/types";

const BASE_URL = "https://mapping.ncua.gov/api";

// This endpoint backs NCUA's own "Research a Credit Union" tool
// (mapping.ncua.gov/ResearchCreditUnion). There's no documented public API,
// so these shapes were reverse-engineered from that tool's compiled JS.
interface NcuaNameSearchResult {
  charterNumber: number;
  name: string;
}

interface NcuaNameSearchResponse {
  totalResultCount: number;
  results: NcuaNameSearchResult[];
}

export async function searchNcuaCreditUnions(
  query: string,
  limit = 8,
): Promise<FiSearchCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  const res = await fetch(`${BASE_URL}/Search/GetNameSearch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cuName: q, skip: 0, take: limit }),
  });
  if (!res.ok) {
    throw new Error(`NCUA name search failed: ${res.status}`);
  }
  const body = (await res.json()) as NcuaNameSearchResponse;

  return (body.results ?? []).map((r) => ({
    source: "ncua" as const,
    name: r.name,
    fi_type: "credit_union" as const,
    city: null,
    state: null,
    fdic_cert: null,
    sec_cik: null,
    ncua_charter: String(r.charterNumber),
  }));
}

export interface NcuaFinancialSnapshot {
  as_of_date: string | null;
  metrics: Record<string, number | null>;
  city: string | null;
  state: string | null;
  website: string | null;
}

interface NcuaCreditUnionDetail {
  creditUnionAssets?: string;
  creditUnionNom?: string;
  creditUnionCity?: string;
  creditUnionState?: string;
  creditUnionWebsite?: string;
  profileCycleDates?: Record<string, string>;
  isError?: boolean;
  errorMessage?: string | null;
}

function parseNumeric(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getNcuaFinancials(
  charterNumber: string,
): Promise<NcuaFinancialSnapshot> {
  const res = await fetch(
    `${BASE_URL}/CreditUnionDetails/GetCreditUnionDetails/${charterNumber}`,
  );
  if (!res.ok) {
    throw new Error(`NCUA credit union detail fetch failed: ${res.status}`);
  }
  const detail = (await res.json()) as NcuaCreditUnionDetail;
  if (detail.isError) {
    throw new Error(detail.errorMessage ?? "NCUA detail lookup failed");
  }

  // "Current profile" is the as-of date for the assets/member snapshot returned above.
  const currentProfileDate = detail.profileCycleDates?.["Current profile"];
  const asOfDate = currentProfileDate
    ? new Date(currentProfileDate).toISOString().slice(0, 10)
    : null;

  return {
    as_of_date: asOfDate,
    metrics: {
      total_assets: parseNumeric(detail.creditUnionAssets),
      member_count: parseNumeric(detail.creditUnionNom),
    },
    city: detail.creditUnionCity ?? null,
    state: detail.creditUnionState ?? null,
    website: detail.creditUnionWebsite ?? null,
  };
}
