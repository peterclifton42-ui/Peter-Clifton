# Curinos Client Intelligence

Select a financial institution and get a live financial snapshot, recent news, and
an LLM-generated ranking of which Curinos products would help it most, with a
rationale grounded in the specific metrics and headlines found.

## How it works

1. **Search** — `/api/fi/search` queries the FDIC BankFind API (banks/thrifts) and
   SEC EDGAR's company list (public companies/holding companies) live, in
   parallel, and merges the results.
2. **Select** — picking a result persists it to the `financial_institutions`
   table in Supabase (`/api/fi`).
3. **Ingest** — `/api/fi/[id]/ingest` fetches:
   - Financials: FDIC quarterly call-report data (assets, deposits, ROA, ROE,
     efficiency ratio, NIM, YoY growth) for banks, or SEC XBRL company facts
     (assets, net income, equity, deposits, revenue) for SEC-registered
     institutions.
   - News: Google News RSS for the institution's name.
   Both are cached in Supabase (`fi_financials`, `fi_news`).
4. **Analyze** — `/api/fi/[id]/match` sends the institution's financial profile,
   recent news, and the Curinos product catalog to Claude (`claude-opus-4-8`)
   with a JSON-schema-constrained output, and stores ranked matches with
   rationale in `fi_product_matches`.

The Curinos product catalog (Analyzers, Optimizers, Pricing Data, Advisory
Services, Curinos One) was seeded from curinos.com and curinosone.com into the
`products` table — see the `signals` column on each row for the financial/news
triggers used to match it.

## Known gaps

- **Credit unions aren't searchable yet.** FDIC only covers FDIC-insured banks;
  credit unions are NCUA-insured and need a separate data source (NCUA doesn't
  offer a simple REST API — would require ingesting their bulk call-report
  files). The `credit_union` / `ncua_charter` schema is already in place for
  this.
- Financials/news are only as fresh as the last "Refresh" click — there's no
  background refresh job yet.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase dashboard (Project
     Settings → API → service_role secret). The project itself
     (`SUPABASE_URL`) is already provisioned.
   - `ANTHROPIC_API_KEY` — from console.anthropic.com.
2. `npm install`
3. `npm run dev`

## Database

Schema (`financial_institutions`, `fi_financials`, `fi_news`, `products`,
`fi_product_matches`) lives in Supabase project `vsjymithrmcewnstnezn`. Row
Level Security is enabled with public read policies; all writes go through
the service-role key server-side (API routes), never through the browser.
