import type { FiSearchCandidate } from "@/lib/types";

const BASE_URL = "https://api.fdic.gov/banks";

interface FdicInstitution {
  NAME: string;
  CERT: number;
  CITY: string;
  STALP: string;
  ACTIVE: number;
  ASSET?: number;
}

export async function searchFdicInstitutions(
  query: string,
  limit = 8,
): Promise<FiSearchCandidate[]> {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // The FDIC API's `filters` query string doesn't reliably AND multiple
  // NAME wildcard clauses or combine NAME with ACTIVE, so we search on the
  // first word as a prefix wildcard and refine client-side.
  const params = new URLSearchParams({
    filters: `NAME:${words[0]}*`,
    fields: "NAME,CERT,CITY,STALP,ACTIVE,ASSET",
    limit: "50",
    format: "json",
  });

  const res = await fetch(`${BASE_URL}/institutions?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`FDIC institutions search failed: ${res.status}`);
  }
  const body = await res.json();
  const rows: Array<{ data: FdicInstitution }> = body.data ?? [];

  const rest = words.slice(1).map((w) => w.toLowerCase());
  const filtered = rows
    .map((r) => r.data)
    .filter(
      (r) =>
        r.ACTIVE === 1 && rest.every((w) => r.NAME.toLowerCase().includes(w)),
    )
    .sort((a, b) => (b.ASSET ?? 0) - (a.ASSET ?? 0))
    .slice(0, limit);

  return filtered.map((row) => ({
    source: "fdic" as const,
    name: row.NAME,
    fi_type: "bank" as const,
    city: row.CITY ?? null,
    state: row.STALP ?? null,
    fdic_cert: String(row.CERT),
    sec_cik: null,
    ncua_charter: null,
  }));
}

export interface FdicFinancialSnapshot {
  as_of_date: string | null;
  metrics: Record<string, number | null>;
  raw: unknown;
}

interface FdicFinancialsRow {
  REPDTE: string;
  ASSET: number | null;
  DEP: number | null;
  NETINC: number | null;
  ROA: number | null;
  ROE: number | null;
  EEFFR: number | null;
  NIMY: number | null;
}

function formatRepDate(repdte: string): string {
  // FDIC REPDTE is YYYYMMDD
  return `${repdte.slice(0, 4)}-${repdte.slice(4, 6)}-${repdte.slice(6, 8)}`;
}

export async function getFdicFinancials(
  cert: string,
): Promise<FdicFinancialSnapshot> {
  const params = new URLSearchParams({
    filters: `CERT:${cert}`,
    fields: "REPDTE,ASSET,DEP,NETINC,ROA,ROE,EEFFR,NIMY",
    sort_by: "REPDTE",
    sort_order: "DESC",
    limit: "8",
    format: "json",
  });

  const res = await fetch(`${BASE_URL}/financials?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`FDIC financials fetch failed: ${res.status}`);
  }
  const body = await res.json();
  const rows: Array<{ data: FdicFinancialsRow }> = body.data ?? [];
  if (rows.length === 0) {
    return { as_of_date: null, metrics: {}, raw: null };
  }

  const latest = rows[0].data;
  // Roughly a year prior, since call reports are quarterly (index 4 back).
  const yearAgo = rows[4]?.data ?? null;

  const depositGrowthYoy =
    yearAgo?.DEP && latest.DEP != null
      ? ((latest.DEP - yearAgo.DEP) / yearAgo.DEP) * 100
      : null;
  const assetGrowthYoy =
    yearAgo?.ASSET && latest.ASSET != null
      ? ((latest.ASSET - yearAgo.ASSET) / yearAgo.ASSET) * 100
      : null;

  return {
    as_of_date: formatRepDate(latest.REPDTE),
    metrics: {
      total_assets_thousands: latest.ASSET ?? null,
      total_deposits_thousands: latest.DEP ?? null,
      net_income_thousands: latest.NETINC ?? null,
      roa_pct: latest.ROA ?? null,
      roe_pct: latest.ROE ?? null,
      efficiency_ratio_pct: latest.EEFFR ?? null,
      net_interest_margin_pct: latest.NIMY ?? null,
      deposit_growth_yoy_pct: depositGrowthYoy,
      asset_growth_yoy_pct: assetGrowthYoy,
    },
    raw: rows.map((r) => r.data),
  };
}
