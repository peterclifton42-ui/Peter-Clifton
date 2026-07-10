import type { FiSearchCandidate } from "@/lib/types";

const USER_AGENT =
  process.env.SEC_EDGAR_USER_AGENT ??
  "Curinos Client Intelligence App contact@example.com";

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickerCache: TickerEntry[] | null = null;
let tickerCacheFetchedAt = 0;
const TICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function loadCompanyTickers(): Promise<TickerEntry[]> {
  const now = Date.now();
  if (tickerCache && now - tickerCacheFetchedAt < TICKER_CACHE_TTL_MS) {
    return tickerCache;
  }

  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`SEC company_tickers.json fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as Record<string, TickerEntry>;
  tickerCache = Object.values(data);
  tickerCacheFetchedAt = now;
  return tickerCache;
}

export function padCik(cik: number | string): string {
  return String(cik).padStart(10, "0");
}

export async function searchSecCompanies(
  query: string,
  limit = 8,
): Promise<FiSearchCandidate[]> {
  const tickers = await loadCompanyTickers();
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const seenCik = new Set<number>();
  return tickers
    .filter((t) => t.title.toLowerCase().includes(q))
    .filter((t) => {
      if (seenCik.has(t.cik_str)) return false;
      seenCik.add(t.cik_str);
      return true;
    })
    .slice(0, limit)
    .map((t) => ({
      source: "sec_edgar" as const,
      name: t.title,
      fi_type: "other" as const,
      city: null,
      state: null,
      fdic_cert: null,
      sec_cik: padCik(t.cik_str),
    }));
}

export interface SecFinancialSnapshot {
  as_of_date: string | null;
  metrics: Record<string, number | null>;
  raw: unknown;
}

const US_GAAP_TAGS = {
  total_assets: "Assets",
  total_liabilities: "Liabilities",
  stockholders_equity: "StockholdersEquity",
  net_income: "NetIncomeLoss",
  deposits: "Deposits",
  revenues: "Revenues",
} as const;

interface CompanyFacts {
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<
      string,
      { units?: { USD?: Array<{ val: number; end: string; fy?: number; fp?: string; form?: string }> } }
    >;
  };
}

function latestAnnualValue(
  facts: CompanyFacts,
  tag: string,
): { val: number; end: string } | null {
  const usGaap = facts.facts?.["us-gaap"]?.[tag];
  const units = usGaap?.units?.USD;
  if (!units) return null;

  const annual = units.filter((u) => u.form === "10-K");
  const pool = annual.length > 0 ? annual : units;
  const sorted = [...pool].sort((a, b) => (a.end < b.end ? 1 : -1));
  return sorted[0] ? { val: sorted[0].val, end: sorted[0].end } : null;
}

export async function getSecFinancials(
  cik10: string,
): Promise<SecFinancialSnapshot> {
  const res = await fetch(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!res.ok) {
    throw new Error(`SEC companyfacts fetch failed: ${res.status}`);
  }
  const facts = (await res.json()) as CompanyFacts;

  const metrics: Record<string, number | null> = {};
  let asOfDate: string | null = null;

  for (const [key, tag] of Object.entries(US_GAAP_TAGS)) {
    const latest = latestAnnualValue(facts, tag);
    metrics[key] = latest ? latest.val : null;
    if (latest && (!asOfDate || latest.end > asOfDate)) {
      asOfDate = latest.end;
    }
  }

  return { as_of_date: asOfDate, metrics, raw: facts.entityName ?? null };
}
