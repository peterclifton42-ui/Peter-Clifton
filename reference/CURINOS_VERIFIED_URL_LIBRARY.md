# CURINOS DASHBOARD — VERIFIED URL LIBRARY
## Last updated: 2026-03-03  
## Rule: A URL is only marked FETCH-VERIFIED if web_fetch returned HTTP 200.

---

## VERIFICATION TIERS

| Tier | Meaning | Use? |
|---|---|---|
| FETCH 200 | web_fetch returned HTTP 200 — confirmed working | YES |
| BOT-BLOCKED | 403 to bots but works in browser. URL confirmed real via search metadata | YES with caution |
| DNS FAIL | Domain does not resolve | NEVER |
| 404 IN BROWSER | Returns 200 to bots but 404 to real users | NEVER |
| ASSUMED | Constructed by guessing — never tested | NEVER |

---

## FETCH-VERIFIED (HTTP 200 confirmed)

### FDIC
- FDIC BankFind Suite: https://banks.data.fdic.gov/bankfind-suite/bankfind
- FDIC Bank Data Guide: https://www.fdic.gov/bank-data-guide/banks
- FDIC IDI Resolution Plan Regions 2025 (PDF): https://www.fdic.gov/resolutions/regions-bank-2025-idi-resolution-plan-public-section.pdf

### Federal Reserve
- Fed Supervision & Regulation: https://www.federalreserve.gov/supervisionreg.htm

### Regions Financial
- RF Q4 2025 Earnings (BusinessWire): https://www.businesswire.com/news/home/20260116762547/en/Regions-Reports-Strong-Earnings-Growth-in-2025-New-Annual-Records-in-Wealth-Management-and-Treasury-Management-Income
- Regions 10-K FY2024 PDF: https://s202.q4cdn.com/476346942/files/doc_financials/2024/q4/RF-2024-12-31-10-K-for-website.pdf

### Peer Banks (Regions peer set — example only; do NOT reuse for other institutions)
- Huntington Q4 2024 Earnings: https://ir.huntington.com/news-presentations/press-releases/detail/914/huntington-bancshares-incorporated-reports-2024-fourth-quarter-earnings
- Truist Q4 2024 Earnings (PRNewswire): https://www.prnewswire.com/news-releases/truist-reports-fourth-quarter-2024-results-302353543.html

---

## BOT-BLOCKED (work in browser, confirmed real)

- Fifth Third IR: https://ir.53.com/home/default.aspx
- Regions IR: https://ir.regions.com/
- Regions Treasury Mgmt: https://www.regions.com/commercial-banking/treasury-management/commercial-cash-management

---

## DEAD — NEVER USE

| URL | Reason |
|---|---|
| newline.regions.com | DNS FAIL — domain does not exist. Newline = Fifth Third product, NOT Regions |
| federalreserve.gov/supervisionreg/large-financial-institutions.htm | 404 in browser (page removed 2019) |
| ir.regions.com/news-release-details/... (any deep path) | 404 in browser |
| fdic.gov/regulations/applications/resolutions/... | Old path — 404 |
| banks.data.fdic.gov/api/... (any API endpoint) | Machine API — not a web page |
| Any URL with double-slash // in path | Corrupted URL |

---

## PROTOCOL FOR NEW FI DASHBOARDS

### Step 1 — Earnings Release
SEARCH: "[Bank]" "[Q4 YEAR]" earnings prnewswire.com OR businesswire.com
FETCH:  web_fetch(exact URL from search metadata) → must return 200
USE:    Only if 200. Try prnewswire.com if businesswire.com fails.

### Step 2 — 10-K PDF
SEARCH: "[Bank]" 10-K 2024 site:sec.gov OR site:q4cdn.com
FETCH:  web_fetch → must return binary PDF
USE:    SEC EDGAR and q4cdn.com CDN paths are almost always reliable.

### Step 3 — FDIC IDI Resolution Plan  
SEARCH: "[Bank]" FDIC IDI resolution plan 2025 public section site:fdic.gov
FETCH:  web_fetch → must return binary PDF
USE:    fdic.gov/resolutions/ paths are reliable.

### Step 4 — IR Homepage
RULE:   Never use deep IR links unless fetch-confirmed.
        Use earnings press release on prnewswire.com or businesswire.com instead.

### Step 5 — Universal sources (no lookup needed, already fetch-confirmed)
- https://banks.data.fdic.gov/bankfind-suite/bankfind
- https://www.fdic.gov/bank-data-guide/banks
- https://www.federalreserve.gov/supervisionreg.htm

---

## MISTAKES TO NEVER REPEAT

1. newline.regions.com doesn't exist — Newline is Fifth Third's product
2. Never construct IR deep links — always search for the specific press release URL
3. Never trust Fed .htm pages without fetching — many 404 in browser despite returning 200 to bots
4. Never use FDIC API endpoints as source links — they return JSON not web pages
5. "Search confirmed" does NOT mean verified — only web_fetch 200 counts
6. Always fetch BEFORE building the dashboard — 5 minutes of checking prevents broken links
