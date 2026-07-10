export type FiType =
  | "bank"
  | "credit_union"
  | "mortgage_bank"
  | "fintech"
  | "insurance"
  | "wealth_manager"
  | "other";

export interface FinancialInstitution {
  id: string;
  name: string;
  fi_type: FiType;
  city: string | null;
  state: string | null;
  fdic_cert: string | null;
  sec_cik: string | null;
  ncua_charter: string | null;
  website: string | null;
  created_at: string;
}

export interface FiFinancials {
  id: string;
  fi_id: string;
  as_of_date: string | null;
  source: "fdic" | "sec_edgar" | "manual";
  metrics: Record<string, number | string | null>;
  raw_payload: unknown;
  fetched_at: string;
}

export interface FiNewsItem {
  id: string;
  fi_id: string;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  summary: string | null;
  fetched_at: string;
}

export type ProductCategory =
  | "comparative_analytics"
  | "optimization_platforms"
  | "intelligent_data"
  | "advisory_services"
  | "curinos_one";

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  description: string;
  target_segments: string[];
  signals: string[];
  source_url: string | null;
  created_at: string;
}

export interface FiProductMatch {
  id: string;
  fi_id: string;
  product_id: string;
  score: number;
  rationale: string;
  model: string;
  financials_fetched_at: string | null;
  news_fetched_at: string | null;
  generated_at: string;
  product?: Product;
}

/** Candidate returned by the live FI search endpoint (not yet persisted). */
export interface FiSearchCandidate {
  source: "fdic" | "sec_edgar";
  name: string;
  fi_type: FiType;
  city: string | null;
  state: string | null;
  fdic_cert: string | null;
  sec_cik: string | null;
}
