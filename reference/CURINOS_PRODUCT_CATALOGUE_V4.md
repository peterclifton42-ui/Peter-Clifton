# CURINOS COMPLETE PRODUCT CATALOGUE — V4
## Reference file for dashboard generation — consult this FIRST before building any Product Fit tab
## Last updated: 26 September 2026 | Sources: curinos.com (full sitemap and every product, outcome, capability, partner and advisory page fetch-verified 2026-09-26), Curinos One launch release (12 May 2026), Databricks Built-On release (9 July 2026), FIS / Zafin / Bankrate partner releases

> **What changed in V4.** V3 (August 2026) was accurate to the site on 22 August, but the scoring model inside it was not being applied: in one September 2026 build none of the sixteen stated fit scores matched the V3 formula, the gaps ranged from +2 to +22 points, and two V3 rules were broken in the same file (Curinos One Compound at P1 on a 88.9% loan-to-deposit ratio; Distribution Optimizer at P1 on an unsourced branch count). V4 fixes that at the root:
>
> 1. **Scoring is now executed by `score_v4.py`, not typed.** Run A supplies evidence in a `scoringInputs` block; the script applies gates, computes dimensions, caps and floors, and writes `fit`, `pri` and a full `scoring` block. Section K documents the model; the script is its machine-readable twin.
> 2. **Gates are gates.** Size, geography, type, segment, branch and maturity rules are hard pass/fail filters applied before any score is computed. A product that fails one is Do Not Recommend, full stop. V3 scored them as a 15% dimension, which is why Deposit Optimizer Essentials could reach P2 at a $180B bank.
> 3. **Need drives the score, readiness can only subtract.** Fit = (0.70 × Need + 0.30 × Timing) × Readiness. Maturity and Feasibility no longer add points; they form a 0.60–1.00 multiplier. V3's 60% of structural weight compressed every in-scope product into the 75–95 band and forced post-hoc distribution quotas that contradicted "never hand-scored".
> 4. **Need is mechanical.** Each product names 2–6 metrics with fixed severity bands, computed against the FDIC full-group benchmark median (Section K10) where the institution is a bank, falling back to the median of the dashboard's own sourced peer cohort (minimum two peers) for credit unions and metrics the benchmark lacks.
> 5. **Rules that lived only in the build log are now in the catalogue**: benchmark score-down, unknown ≠ absent, the two-part Compound trigger, branch gate on a sourced lower bound.
> 6. **The product list matches the live site.** curinosone.com now redirects to curinos.com. Seven V3 products no longer have their own page (Section S2); five products and packages the site now sells were missing (Commercial Data, Treasury Management Fee Analyzer, Wealth Cash Analyzer/Optimizer Suite, the Commercial and Retail Deposit A/O Suites, the Pricing Data split); eBenchmarkers is a UK/EMEA product and can no longer be recommended to US or Canadian institutions; every `[N]`/`[X]` placeholder is filled from the product pages.
>
> **Curinos One sits ALONGSIDE the pillar products, not above or inside them** — unchanged from V3. Never describe a pillar product as "part of Curinos One", and never describe Curinos One as replacing anything.
>
> **Provisional entries.** A gate Curinos has not published is marked `PROVISIONAL`. It is a working assumption for scoring, never a sourced fact, and must never be quoted to a client as Curinos policy.
>
> **Published figures.** Every statistic in this catalogue is taken from the named curinos.com page as fetched on 26 September 2026. Quote them with the page named; do not round, combine or extrapolate them.

---

## HOW TO USE THIS CATALOGUE

This catalogue is the input to every Product Fit tab. For each institution:

1. **Classify the institution** → Section A: size band, institution type code, country
2. **Assign a maturity tier** → Section B, from observable signals only
3. **Gather the scoring evidence** → Section K2: fill `scoringInputs` in the intel JSON — segments, metrics with peer arrays, flags, catalysts, stated priorities, tech stack. Every value must trace to a source already cited in the dashboard; unknowns stay `null`
4. **Run the scorer** → `python3 /mnt/project/score_v4.py <intel.json> --write`. It applies Section C gates and Section K, writes `products[]` and `dnrProducts[]`, and lists any recommended product still missing narrative
5. **Write the narrative** for every product the scorer recommends, using the "Signals" and "Published facts" in Sections CO–H. Never change a score, a priority or a DNR decision by hand — if a score looks wrong, the evidence in `scoringInputs` is wrong or incomplete; fix that and re-run
6. **Re-run the scorer** after any change to `scoringInputs` (it is idempotent and preserves narrative)

---

## SECTION A: INSTITUTION CLASSIFICATION

### A1 — Size Bands (by Total Assets)

| Band | Assets | Typical Institution |
|------|--------|---------------------|
| Micro | < $5B | Community banks, small credit unions |
| Small | $5B–$25B | Regional community banks, mid-size credit unions |
| Mid | $25B–$75B | Regional banks, large credit unions |
| Upper-Mid | $75B–$150B | Super-regional banks |
| Large | $150B–$500B | Large regionals / near-national banks |
| Mega | > $500B | Money-center / global banks |

### A2 — Institution Types

- **Commercial bank (full-service)** — FDIC-insured, broad retail + commercial + wealth
- **Community bank** — FDIC-insured, < $10B, locally focused, limited analytics staff
- **Credit union** — NCUA-insured, cooperative, "members" not "customers," Net Worth Ratio not CET1
- **Neobank / digital-only** — No physical branches, digital acquisition focus
- **Specialty lender** — Card, auto, home improvement, student — limited or no deposit franchise
- **Wealth / Private bank** — AUM-driven, HNW/UHNW focus, advisory model
- **Mortgage / consumer specialist** — Servicer or originator, UPB-driven, no retail deposits
- **Savings institution / thrift** — NEW in V4. Savings-and-loan or savings-bank charter (e.g. OCC federal savings association). V3 had no such type, so thrifts were mapped by judgement and scored as "type not listed". Scores exactly as a commercial or community bank of the same size.
- **Broker-dealer / wealth platform** — NEW in V4. Retail brokerage or wealth platform whose cash sweep programme places client cash at banks. In scope only for the Wealth Cash Analyzer/Optimizer Suite; every deposit and lending product is gated out.
- **Insurance provider** — out of scope for Product Fit tabs. Curinos sells eBenchmarkers – Insurance to UK insurers only; it is not scored.

### A3 — Type codes and geography (for `scoringInputs`)

| Institution type | `type` code | Notes |
|---|---|---|
| Commercial bank (full-service) | `commercial_bank` | Default for regional and national banks |
| Community bank | `community_bank` | < $10B, locally focused |
| Savings institution / thrift | `savings_institution` | Scores as a bank |
| Credit union | `credit_union` | Separate size gates for the deposit optimizers (Section C) |
| Neobank / digital-only | `neobank` | Branch products gate out on branch count |
| Specialty lender | `specialty_lender` | Deposit products need a confirmed retail deposit franchise |
| Wealth / private bank | `wealth_private` | |
| Mortgage / consumer specialist | `mortgage_specialist` | No deposit products |
| Broker-dealer / wealth platform | `broker_dealer` | Wealth Cash suite only |

`country` is `US`, `CA` or `UK`. Most products are sold in the US and Canada; several are US-only and eBenchmarkers – Banking is UK-only (Section C1). Where a Canadian availability is not published, V4 follows V3 and allows US + Canada; confirm with Product before pitching a US-only-tagged product to a Canadian institution.

---

## SECTION B: DATA & ANALYTICS MATURITY TIERING

Assign one tier per institution based on observable signals. This determines which Optimizer-class products are appropriate.

### Tier 1 — Basic
- Small analytics team (1–5 FTEs wearing multiple hats)
- Core banking + Excel + basic ALM system; few or no APIs
- Weak or lagged competitive pricing data
- No dedicated data warehouse or BI platform
- **Appropriate products**: Pricing Data, Commercial Data, Deposit Optimizer Essentials (Tier 1–3 range, ideal 1–2), Advisory (all). eBenchmarkers – Banking only for UK institutions

### Tier 2 — Emerging
- Some data warehouse / BI capability
- ALCO/ALM uses data well, but mostly internal views
- Digital transformation initiated but not complete
- Limited or emerging API strategy
- **Appropriate products**: Everything Tier 1 plus Treasury Analyzer, Retail Deposit Analyzer, Treasury Management Fee Analyzer, LendersBenchmark Analyzers, Small Business Deposit Analyzer, Marketing Analyzer, Distribution Analyzer, Digital Banking Analyzer, Wealth Analyzer, Wealth Cash suite, Commercial Analyzer, Distribution Optimizer, Curinos One Capture and Compound (range; ideal is Tier 3–4)

### Tier 3 — Advanced
- Enterprise data platform (data lake, modern BI stack)
- API ecosystem; digital products with modern mobile/web
- Dedicated analytics / data science teams
- Active digital transformation programme
- **Appropriate products**: Everything Tier 2 plus Retail Deposit Optimizer, Commercial Optimizer, Wealth Optimizer; Curinos One modules at their ideal tier

### Tier 4 — Leading
- Real-time analytics and experimentation culture
- AI/ML, next-best-action, propensity modelling in production
- CDP / enterprise CRM integrated with marketing automation (Salesforce, Adobe, Braze, etc.)
- Embedded finance or heavy API exposure
- **Appropriate products**: All products. Curinos One is the natural fit (Amplero is retired — Section S2). Optimizers at full capability.

### Maturity Signal Inference (from public information)
Boost tier estimate when you observe:
- Mention of: API platforms, embedded banking, digital-only subsidiaries, data lake/warehouse, data science teams, ML/AI, CDP, next-best-action
- Evidence of: Active product experimentation, personalisation at scale, real-time pricing decisions
- Complexity of balance sheet and product set (more complexity = higher maturity likely needed)

---

### Tier rules in scoring (V4)
- Institution tier in the product's **ideal** tiers → Maturity 100; within range but not ideal → 75; **one** tier below the minimum → 45 (allowed, flagged as needing delivery support); **two or more** below → hard gate, DNR; above the product's maximum → 40 (product likely underpowered).
- **The $50–75B Tier 2 gap is closed.** In V3 a $60B Tier 2 bank fitted neither deposit optimizer: Essentials failed the size ceiling and Retail Deposit Optimizer the maturity minimum. In V4 Retail Deposit Optimizer is allowed one tier below its Tier 3 minimum (Maturity 45, lower readiness), so such a bank still gets a scored optimizer rather than none.
- Tier must be assigned from evidence in the Analytics & Technology tab (`maturity.dimensions[]`) before scoring, and entered as the integer `tier` in `scoringInputs`.

---

## SECTION C: HARD GATES AND INCLUSION RULES

In V4 these rules are applied by `score_v4.py` **before** any score is computed. A product that fails any hard gate is Do Not Recommend with the gate named as the reason. There is no scoring route around a gate.

### C1 — Hard gates

| Rule | Condition | Action |
|------|-----------|--------|
| `deposit_optimizer_split` | Bank or thrift: assets < $50B → Deposit Optimizer Essentials; ≥ $50B → Retail Deposit Optimizer. Credit union: the boundary is **$30B** | The product on the wrong side of the line is DNR. One boundary per type — V3 stated $30B in C1 and $50B in C2 for credit unions; V4 uses $30B everywhere |
| `essentials_type` | Deposit Optimizer Essentials | Banks, thrifts, credit unions, and specialty lenders with a confirmed retail deposit franchise. Neobanks and wealth banks gate out |
| `geography` | Product not sold in the institution's country | DNR. eBenchmarkers – Banking is UK-only; Commercial, Wealth, Treasury, Lending, Marketing and Distribution Analyzer products are US-tagged on curinos.com; Distribution Optimizer is US + Canada; Digital Banking Analyzer is US, Canada and EMEA |
| `type` | Institution type not in the product's supported types | DNR |
| `size_floor` | Assets below half the product's guide floor (or below any floor marked hard) | DNR. Between half the floor and the floor: allowed, Feasibility −15 |
| `segment` | A required segment or function is confirmed **absent** (`false`) | DNR |
| `segment_unknown` | A required segment is **unconfirmed** (`null`) | Not a gate: product is scored but capped at P3 and the gap is stated in its card (Section K4, unknown ≠ absent) |
| `branch` | Distribution Analyzer ≥ 25 branches; Distribution Optimizer and Advisory: Network Optimization ≥ 50 | DNR if the sourced count is below the gate. If the exact count is unsourced but a sourced fact establishes a lower bound (e.g. "37 branches closed this year and a third round planned"), enter it as `branchesMin` with the evidence; the gate passes on the bound. With neither: unknown ≠ absent cap |
| `maturity_floor` | Institution tier two or more below the product's minimum tier | DNR. One tier below: allowed, Maturity 45 |
| `ma_gate` | Advisory: M&A Support | Requires `maRelevant`: an M&A announced or completed in the last five years, or acquisition appetite signalled by management |
| `c1_data_gate` | No usable first-party customer data | All Curinos One modules DNR. Default is `true` for any institution with a retail deposit franchise; set `false` only on evidence |
| `c1_size_gate` | Curinos One modules below $10B | Guide floor, PROVISIONAL (no published floor). Below $5B: DNR; $5–10B: allowed with Feasibility −15 |
| `retired` | Amplero Personalization Optimizer; Treasury Strategies | Not scored, not listed in `products[]` or `dnrProducts[]` (Section S2) |

### C2 — Floors (applied after scoring)

| Product | Floor |
|---------|-------|
| **Pricing Data** | Never below P2 for any deposit- or lending-active institution |
| **Advisory: Pricing Strategy & Optimization** | Never Do Not Recommend; minimum P3 |
| **Advisory: Treasury & Balance Sheet Management** | Minimum P3 wherever an ALCO exists |

V3's always-include rules for Treasury Analyzer, M&A Support, Network Optimization, Deposit Optimizer Essentials and eBenchmarkers are **withdrawn**. Each product now earns its place on need and timing, or is excluded on a gate. The eBenchmarkers rule in particular was wrong: it is a UK product (Section E).

### C3 — Caps (applied after scoring)

| Cap | Condition | Effect |
|-----|-----------|--------|
| `roadmap` | Curinos One Commit, Conserve, Calibrate — all "Coming Soon" on curinos.com | Maximum P3; card labelled ROADMAP — NOT YET AVAILABLE |
| `unlisted` | Product has no page on curinos.com (Section S2) | Maximum P3; card labelled AVAILABILITY UNCONFIRMED until Product confirms |
| `unknown_input` | A required segment, function or branch count is unconfirmed | Maximum P3; gap stated in the card |
| `benchmark` | The institution already leads its peers on the product's primary need metric | NeedFit capped at 40; card framed as extend/defend, never as repair |
| `compound_trigger` | Curinos One Compound computes to P1 | Held at P2 unless LDR ≥ 90% AND loan growth exceeds deposit growth (trailing YoY, or management guidance that it will) |

### C4 — Never omit Advisory
Unchanged: every Product Fit tab carries at least Advisory: Pricing Strategy & Optimization (guaranteed by the C2 floor).

---

## SECTION CO: CURINOS ONE — THE DECISION INTELLIGENCE PLATFORM

Launched 12 May 2026 at the Curinos Insight to Impact Growth Summit (Nashville). Curinos One is an AI-enabled decision intelligence platform sold and deployed **alongside** the pillar products. It integrates an institution's first-party data, third-party signals and Curinos benchmark intelligence into one decisioning engine that recommends and executes actions at the individual customer level across marketing, product and pricing, then learns from outcomes. Human-in-the-loop by design.

**Web presence (changed since V3).** curinosone.com now redirects to curinos.com. Curinos One is presented through five outcome pages and two capability pages on curinos.com. Cite those; never cite curinosone.com.

| Layer | Name | URL | Status |
|---|---|---|---|
| Capability | Compass — market intelligence layer | curinos.com/capabilities/market-intelligence | Available (not scored separately) |
| Capability | Catalyst — activation engine | curinos.com/capabilities/activation-engine | Available (not scored separately) |
| Outcome | **Capture** — New Relationship Acquisition | curinos.com/outcomes/new-relationship-acquisition | **Available** |
| Outcome | **Compound** — Deposit Deepening | curinos.com/outcomes/deposit-deepening | **Available** |
| Outcome | Commit — Primary Relationships | curinos.com/outcomes/primary-relationships | COMING SOON |
| Outcome | Conserve — Customer Retention | curinos.com/outcomes/customer-retention | COMING SOON |
| Outcome | Calibrate — Yield Optimization | curinos.com/outcomes/yield-optimization | COMING SOON |

**V3 open item K8.2 is closed.** Calibrate's status was inconsistent between the two V3 websites. With curinosone.com retired, the yield-optimization page reads "Curinos One Calibrate is Coming Soon" in the same form as Commit and Conserve. Treat all three identically: roadmap, capped at P3.

**Amplero is now part of the Curinos One story.** curinos.com/amplero-personalization-optimizer/ redirects to the Compound page, and the launch release describes Curinos One as powered by Curinos' "patented adaptive decisioning technology". Curinos' adaptive-AI patents and Amplero's award history sit in the same press archive; treat the lineage as internal context and confirm the wording with Product before saying it to a client. Do not score or pitch Amplero as a separate product (Section S2). If a client already licenses Amplero, the conversation is a Curinos One migration, and it is flagged with `existingCurinosClient`.

**Architecture facts that affect Feasibility (Section K2.4).**
- *Databricks Built-On partner (9 July 2026).* Curinos One runs natively on Databricks inside the bank's own governance and model-risk frameworks, with bi-directional integration and no parallel data store. An institution with Databricks in production gets Feasibility +15 on every Curinos One module.
- *Salesforce.* The Compound page shows activations landing "in the banker's existing CRM" in Salesforce. An institution running Salesforce CRM gets Feasibility +10 on Capture and Compound.
- *Sits above the execution stack.* It does not replace CRM, marketing automation or pricing systems. That is the answer to "we already have a martech stack".

**Sales framing (unchanged).** The pillar products tell an institution where it stands; Curinos One acts on it at the customer level. Lead with a pillar product when the problem is diagnosis; lead with a module when the problem is execution — campaigns that do not convert, balances that do not grow, attrition that is visible but not pre-empted.

**Verified public claims — quote only these, with the source named.**

| Claim | Exact source wording / figure | Source |
|---|---|---|
| Training base | "trained on 25 years of proprietary benchmarks" | Launch release, 12 May 2026 |
| Capture result | In an initial checking acquisition deployment, customers acquired through Curinos One carried more than double the balances at 120 days vs the direct-mail control — a **133%** improvement — with a **52%** lift in response rates and a **540%** increase in acquisition ROI | Launch release |
| Compound result | One early-adopting bank achieved **more than $1.6 billion** in additional deposits, a **38%** increase in new-to-bank deposits and a cross-sell conversion lift of **over 250%** maintained for more than a year | Launch release |
| Premium product take-up | **77%** of account openers chose the premium checking product vs **43%** organic, a Southeast Regional Bank | curinos.com homepage and Capture page |
| Named reference | Synovus — Lee Sessions, Chief Consumer Product & Client Solutions Officer, quoted on the always-on engine | Launch release |
| Market context | Acquiring a new checking customer is **126%** more expensive than in 2018; **50%** of switchers now spread balances across four-plus banks (7% in 2019); **<1%** of prospects generate meaningful value | curinos.com homepage; Databricks release |
| Mass-market graduation | About **20%** of mass-market customers become relationships **3x** more valuable within five years, representing as much as **60%** of deposit growth | Curinos Perspective, Growth Summit takeaways (May 2026) |

**Two claims conflict across curinos.com pages — use the release wording, never the variants.**
1. The homepage shows **130%** "higher average DDA balances vs. mail control, West Coast Regional Bank"; the launch release and the Banks & Credit Unions / USA pages say **133%**. V3 quoted 130%. Use 133% with the release as source.
2. The homepage labels the $1.6B as "incremental new-to-bank balances since launch, Top Digital Bank"; the release attributes it to a Compound early adopter as *additional deposits*. Use the release wording and do not describe the client.

Anything not in this table goes to Product Marketing with a source attached before a seller uses it.

---

### Curinos One Capture
**URL**: curinos.com/outcomes/new-relationship-acquisition
**Outcome**: New Relationship Acquisition · **Status**: Available
**Min assets**: $10B PROVISIONAL · **Maturity**: Tier 2–4 PROVISIONAL (ideal 3–4)
**Scoring need metrics**: `newMarketEntry` (primary), deposit growth vs peers, `cacPressure`, deposit growth (absolute)
**Timing themes**: `new_market`, `marketing_plan`

**Core value**: Plans acquisition around predicted funded balances and customer quality rather than mail volume: a prospect heatmap ranked by predicted deposit quality in every DMA the institution serves, scenario planning that shows predicted accounts and balances as audience size changes, and wave-by-wave campaign learning, with Curinos CoPilot summarising performance.

**Pairs with (curinos.com "Relevant Products")**: Marketing Analyzer, Distribution Analyzer, Digital Banking Analyzer, Deposit Analyzer/Optimizer Suite.

**Signals to boost fit:**
- New market entry, de novo branches or loan production offices where the franchise has no deposit-gathering history
- High account-opening volume with poor funding rates; acquisition cost per funded account rising
- A deposit campaign sized in dollars is already running or planned

---

### Curinos One Compound
**URL**: curinos.com/outcomes/deposit-deepening
**Outcome**: Deposit Deepening · **Status**: Available
**Min assets**: $10B PROVISIONAL · **Maturity**: Tier 2–4 PROVISIONAL (ideal 3–4)
**Scoring need metrics**: LDR (primary), loan growth minus deposit growth, non-interest-bearing balance trend, deposit growth vs peers, deposit growth (absolute)
**Timing themes**: `funding_gap`, `deposit_pricing`
**P1 trigger (two-part, C3)**: LDR ≥ 90% **and** loans outgrowing deposits (trailing YoY, or management guidance). V3 stated only the LDR half, and builds decided the second half by judgement — one build correctly held back a 98% LDR lender whose loan book was contracting; another promoted Compound to P1 at 88.9% LDR.

**Core value**: Finds the deposit opportunity already inside the book — customers segmented by tenure, balance tier and product mix, with predicted uplift per segment and the cross-bank intelligence behind it — and turns it straight into activation across email, in-app and banker outreach, with the prompt landing in the banker's Salesforce view.

**Pairs with**: Digital Banking Analyzer, Deposit Analyzer/Optimizer Suite, Pricing Data – Retail Deposits. With a deposit optimizer: the Optimizer sets the price; Compound works out who to take it to.

**Signals to boost fit:**
- Loan growth outrunning deposit growth; LDR at or above 90%
- Management has said deposit costs are at a floor while guiding loans ahead of deposits (no pricing lever left)
- Large existing base with low balances per relationship; non-interest-bearing share falling
- No capital cushion or excess liquidity to fund growth another way

---

### Curinos One Commit · Conserve · Calibrate (roadmap)
**Status**: COMING SOON on curinos.com. Capped at P3 (C3) and labelled roadmap in the card. Sell the direction of travel only where the outcome is already an explicit board priority, and only after an available module is in flight.
- **Commit** — primary relationships. Relevant products shown on its page: Deposit Optimizer/Analyzer Suite, LendersBenchmark Suite, Distribution Analyzer, Digital Banking Analyzer.
- **Conserve** — customer retention, pre-empting attrition.
- **Calibrate** — yield optimization. Relevant products shown: Deposit Suite, LendersBenchmark Suite, Distribution Analyzer and Optimizer, Marketing Analyzer, Pricing Data, Digital Banking Analyzer.

### Curinos CoPilot
A feature of Capture (it summarises campaign performance), and also the name of an earlier Curinos generative-AI deposit-pricing announcement in the curinos.com press archive. Not a separately sold SKU; not scored.

---

## SECTION CO2: SUITE PACKAGING

curinos.com now sells most analytics as Analyzer + Optimizer suites. Suites are packaging, not new capability. **Score the component products** (the gates differ); **name the suite** in client-facing copy when the conversation is about breadth.

| Suite | URL | Components scored in V4 | Published facts |
|---|---|---|---|
| Deposit Analyzer/Optimizer Suite | /products/deposit-analyzer-optimizer-suite | All deposit Analyzers and Optimizers across Consumer, Small Business, Wealth and Commercial | Peer data spanning **$6T** in deposits; the market's only source for marginal cost of funds |
| Retail Deposit Analyzer/Optimizer Suite | /products/retail-deposit-analyzer-optimizer-suite | Retail Deposit Analyzer (page calls it Consumer Deposit Analyzer), Retail Deposit Optimizer | **$3T** consumer deposits, roughly one-third of the US market, weekly account-level data; 50+ metrics across 17 dashboards |
| Commercial Analyzer/Optimizer Suite | /products/commercial-analyzer-optimizer-suite | Commercial Analyzer, Commercial Optimizer | **30+** institutions using it; **$2T** in the benchmark; **10–15bps** improvement in interest expense per $1B of interest-bearing commercial deposits |
| Wealth Deposit Analyzer/Optimizer Suite | /products/wealth-deposit-analyzer-optimizer-suite | Wealth Analyzer, Wealth Optimizer | **8–10bps** outperformance opportunity ($8M–$10M on a $10B book); **10bps** delivered on average by Wealth Analyzer |
| Wealth Cash Analyzer/Optimizer Suite | /products/wealth-cash-analyzer-optimizer-suite | Scored as one product (NEW) | **8–10bps** sweep margin improvement ($12M–$20M on a $15B–$20B sweep book) |
| LendersBenchmark Suite | /products/lenders-benchmark-suite | LendersBenchmark Analyzer (mortgage, home equity, unsecured) | **$2.5T** loan volume across **7M** transactions; ~**50%** of first mortgage and home equity markets; supports **80%** of the top 50 US lenders |

---

## SECTION P: PARTNER ECOSYSTEM (NEW IN V4)

Partners change feasibility and give sellers a warm route in. Feasibility bonuses are applied by `score_v4.py` only when the partner technology is **sourced** for the institution.

| Partner | What it means | Scoring effect (`techStack` key) | Source |
|---|---|---|---|
| **FIS** (IBS and HORIZON cores) | Deposit Optimizer Essentials integrated with the core; accelerated onboarding and faster time-to-value | Deposit Optimizer Essentials Feasibility +15 (`fisIbsHorizon`) | FIS release, 5 Aug 2024; curinos.com partner page |
| **Databricks** (Built-On) | Curinos One runs natively inside the bank's Databricks governance; no parallel store | All Curinos One modules +15 (`databricks`) | Curinos release, 9 Jul 2026 |
| **Salesforce** | Compound activations surface in the banker's Salesforce CRM | Capture, Compound +10 (`salesforce`) | curinos.com Compound page |
| **Zafin** (Deal Manager) | Curinos commercial benchmark pricing embedded in deal negotiation and billing | Commercial Analyzer, Commercial Optimizer, Commercial Data, TM Fee Analyzer +10 (`dealPricingTool`) | Zafin/Curinos release, 23 Oct 2025 |
| SunTec | Strategic relationship announced (scope not verified this cycle) | `dealPricingTool` only where SunTec is sourced as the institution's pricing engine | curinos.com partner page and press |
| Bankrate | Curinos data and measurement available through Bankrate's consumer deposit marketplace | Talking point for Capture and Marketing Analyzer; no score effect | Release, 31 Oct 2024 |
| Lender Price, Polly | Curinos data inside mortgage pricing engines | Talking point for LendersBenchmark; no score effect | curinos.com press |
| Existing Curinos client (any product) | Warm relationship, data already flowing | All products +10 (`existingCurinosClient`); owned products are listed in `ownedProducts` and presented as Expand / Renew | Rep input or public evidence only |

---

## SECTION S: SITE STATUS OF EVERY V3 PRODUCT (checked 26 September 2026)

### S1 — Listed on curinos.com (scored normally)
Pricing Data (plus three sub-pages: Retail Deposits, Retail Lending, Mortgage Lending) · Commercial Data (NEW) · Treasury Analyzer · Treasury Management Fee Analyzer (NEW) · Small Business Deposit Analyzer · Digital Banking Analyzer · Marketing Analyzer · Distribution Analyzer · Distribution Optimizer · LendersBenchmark Suite · LendersBenchmark Analyzer for Small Business Lending · eBenchmarkers – Banking (UK) · Wealth Cash Analyzer/Optimizer Suite (NEW) · Curinos One Capture, Compound · all nine Advisory engagements · NDepth (corporate treasury; not an FI product)

Listed **inside a suite** (old URL redirects to the suite page; scored normally): Retail Deposit Analyzer, Retail Deposit Optimizer, Commercial Analyzer, Commercial Optimizer, Wealth Analyzer, Wealth Optimizer. Deposit Optimizer Essentials is presented through the Curinos + FIS partner page; its old URL redirects to the Deposit Suite.

### S2 — No longer on curinos.com

| V3 product | What the old URL does now | V4 treatment |
|---|---|---|
| Amplero Personalization Optimizer | Redirects to the Curinos One Compound page | **RETIRED** — not scored. Use Curinos One |
| Treasury Strategies (consultancy) | Redirects to the homepage; only NDepth remains | **RETIRED** from Product Fit tabs (it was never an FI product) |
| Profitability Optimizer | Redirects to the product index; no page | **UNLISTED** — scored, capped at P3, "availability unconfirmed" |
| Lenders Optimizer | Redirects to the LendersBenchmark Suite, which describes no optimizer | **UNLISTED** — as above |
| Commercial Digital Analyzer | Redirects to the Commercial Suite, which does not mention it | **UNLISTED** — as above |

Confirm every UNLISTED product with Product Marketing. When confirmed live, change its `status` in `score_v4.py` to `listed` and remove it from this table; when confirmed retired, change it to `retired`.

---

## SECTION D: PILLAR 1 — INTELLIGENT DATA

---

### Pricing Data
**URL**: curinos.com/products/pricing-data · sub-pages /products/pricing-data-retail-deposits, /products/pricing-data-retail-lending, /products/pricing-data-mortgage-lending
**Pillar**: Intelligent Data
**Min assets**: None (universal)
**Institution types**: All
**Maturity**: Tier 1–4 (universal)
**Floor**: never below P2 for any deposit- or lending-active institution (C2)
**Scoring need metrics**: IB deposit cost vs peers (primary), marginal funding gap, NIM vs peers, deposit growth vs peers, time-deposit share, deposit growth · **Timing themes**: deposit_pricing, funding_gap, new_market, lending_growth

**What it covers**
- Retail Deposits: Rates, Fees (CD, MMA, Checking, Savings, IRA)
- Retail Lending: Home Equity, Personal, Vehicle, Small Business, Credit Card
- Mortgage Lending: Retail, Correspondent, Wholesale
- Commercial: Investment, Cash Sweeps, Commercial Deposit Rates, Treasury Management Fees
- Delivery: Self-service platform + CurinosConnect API (Excel add-in) + Alerts
- Scale (published): **2,500+** institutions tracked nationally, refreshed daily/weekly; rate sheets sourced directly from institutions and supplemented by an at-scale research team; **20+ years** of history
- Retail deposit coverage (Retail Deposits sub-page) includes escrow, HSA, HOA, insured sweeps, IOLTA, public funds and non-profit accounts, plus ATM, online banking, bill-pay, P2P and remote deposit capture fees — useful for specialty-deposit franchises
- The V3 placeholders for average savings and share-of-wallet lift are not published anywhere on curinos.com; do not quote a figure

**Especially strong fit when:**
- ALCO/ALM making frequent pricing decisions (weekly or monthly cadence)
- FI competes in highly saturated markets (top 100 US MSAs or dense CU/bank clusters)
- Direct bank or online bank competition mentioned in strategy or earnings commentary
- NIM pressure, margin compression, or rising deposit costs referenced in filings
- Management language: "rate shoppers," "flighty deposits," "price follower not leader"

**Weak fit / deprioritize when:**
- Institution < $1B with very simple product set and low rate competition
- Heavy reliance on correspondent / brokered channels only (limited price control)

**Feature hooks for sales narrative:**
- "Alerts on competitor price moves" → map when FI mentions rapid rate cycles or "we want to be a price follower"
- "CurinosConnect API" → map when FI has data platform / API strategy / in-house analytics team asking for raw data feeds

---

### Commercial Data — NEW IN V4
**URL**: curinos.com/products/commercial-data
**Pillar**: Intelligent Data · **Min assets**: none published · **Institution types**: banks and thrifts with commercial banking and treasury management · **Country**: US
**Required segments**: `commercial`, `treasuryManagement` · **Maturity**: Tier 1–4
**Scoring need metrics**: deposit service charges / deposits vs peers (primary), non-interest-bearing share vs peers, deposit cost vs peers · **Timing themes**: commercial_growth, product_redesign

**Core value**: Institution-level small business lending, commercial deposit and treasury-management rate and fee data, through the Pricing Data platform, the CurinosConnect Excel add-in and scheduled custom reports.

**Published facts**: TM pricing sourced directly from **165+** institutions; itemised pricing for **200+** standard TM fees; **20+ years** of history; covers banks, credit unions and fintechs in the footprint.

**Signals to boost fit:**
- Annual TM price event being planned, or fee income growth a stated priority
- Relationship managers pricing deals without an external benchmark
- A deal-pricing tool (Zafin, SunTec) in use — Curinos benchmarks can be embedded (Section P)

---

## SECTION E: PILLAR 2 — COMPARATIVE ANALYTICS

---

### Retail Deposit Analyzer
**URL**: curinos.com/products/retail-deposit-analyzer-optimizer-suite (sold in the Retail Deposit A/O Suite; the page calls it the **Consumer Deposit Analyzer**)
**Scoring need metrics**: deposit growth vs peers (primary), deposit cost vs peers, NIB share vs peers, NIB balance trend, deposit growth · **Timing themes**: deposit_pricing, funding_gap
**Published facts**: peer consortium of **$3T** in consumer deposits, roughly one-third of the US market, from weekly account-level data; cleared rates, flow of funds, acquisition mix, betas and the market's only marginal-cost-of-funds source
**Min assets**: $5B
**Institution types**: Banks and credit unions with meaningful retail deposit franchises
**Segments required**: Consumer checking, savings, MMA, CDs
**Maturity**: Tier 2–4

**Core value**: "What your customers actually do compared to what the market charges." Complements Pricing Data (market rates) by adding customer behaviour intelligence.

**Signals to boost fit:**
- Public commentary on NIM pressure or rising funding costs
- Large or complex product grids (multiple brands, multi-state, varied tenor)
- Very branch-heavy or multi-market distribution
- Recent CD maturity wall or promotional CD campaigns
- Language: "deposit mix shift," "non-interest bearing runoff," "repricing headwinds"

**Versus Deposit Optimizer Essentials:**
- If assets < $50B and limited analytics staff → Essentials first; Analyzer as a later build-on
- If assets $50B+ with dedicated team → Analyzer is appropriate now

---

### Treasury Analyzer
**URL**: curinos.com/products/treasury-analyzer
**Min assets**: $5B (especially important $15B+; required for any stress-tested entity)
**Institution types**: Banks, large credit unions with full ALM/ALCO
**Functions required**: ALCO, Treasury, Risk Management
**Maturity**: Tier 2–4
**Required function**: `alco` · **Country**: US (tagged) · V3's always-include rule is withdrawn — Treasury Analyzer now earns its place on need
**Scoring need metrics**: wholesale funding share (primary), uninsured share, AOCI / TCE, IRR-liquidity regulatory signal, LDR · **Timing themes**: alm_regulatory, funding_gap

**Core value**: Behavioural "deposit study" analytics — deposit beta, balance decay, weighted-average life and duration — benchmarked against **$6T** of account-level industry deposit data from consumer (including online/direct) through large corporate and public funds; **15+ years** of history for through-the-cycle analysis; deliverable quarterly rather than as a lagged annual study. Outputs feed ALM, FTP, internal liquidity stress testing and ALCO, and support model-risk and regulator dialogue on decay/WAL assumptions.

**Signals to boost fit:**
- Mention of IRR, liquidity coverage, NSFR, LCR, or Basel in filings
- Regulators / MRAs / MRIs referenced in 10-K or MD&A
- Complex funding mix: high wholesale, brokered CDs, large non-interest bearing exposure
- "Deposit betas" or "deposit decay assumptions" mentioned on earnings calls
- Major OCI swings or large securities portfolio
- New or revised FTP frameworks under discussion

---

### Wealth Analyzer
**URL**: curinos.com/products/wealth-deposit-analyzer-optimizer-suite (Wealth Deposit A/O Suite) · **Country**: US
**Scoring need metrics**: wealth / trust fee growth (primary), wealth balances in scope (size of prize) · **Timing themes**: wealth_growth
**Published facts**: 8–10bps outperformance opportunity ($8M–$10M on a $10B book); 10bps delivered on average; built on $6T+ of weekly account data
**Min assets**: $10B
**Institution types**: Banks with Wealth Management, Private Bank, or Trust business lines
**Required indicators**: Disclosed AUM/AUA; dedicated wealth brand/division/C-suite owner
**Maturity**: Tier 2–4

**Signals to boost fit:**
- Rapid wealth income growth (especially if record quarters highlighted)
- Explicit HNW or UHNW focus in strategy
- Geographic footprint in affluent MSAs
- Management language: "share of wallet," "primary advisor," "consolidating relationships"

**Deprioritize when:**
- No wealth or private banking division at all
- Only mass-market retail with small, basic investment offerings

---

### Wealth Cash Analyzer/Optimizer Suite — NEW IN V4
**URL**: curinos.com/products/wealth-cash-analyzer-optimizer-suite
**Institution types**: broker-dealers, wealth platforms, and banks that run a brokerage cash sweep · **Country**: US
**Required segment**: `cashSweep` · **Maturity**: Tier 2–4
**Scoring need metric**: sweep book in $B (size of prize) · **Timing themes**: wealth_growth

**Core value**: True rate visibility into negotiated sweep rates, peer benchmarking and flow-of-funds analysis, so a firm can balance competitive sweep pricing against margin and see where client assets sit outside the firm.

**Published facts**: sweep margin improved **8–10bps** on average; **$12M–$20M** on a $15B–$20B sweep book.

**Signals to boost fit:** brokerage or advisory cash sweep disclosed; sweep-rate litigation or regulatory attention on sweep pricing; cash sorting out of sweep into money funds.

---

### Commercial Analyzer
**URL**: curinos.com/products/commercial-analyzer-optimizer-suite · **Country**: US
**Scoring need metrics**: NIB share vs peers (primary), deposit cost vs peers, service charges vs peers · **Timing themes**: commercial_growth, funding_gap
**Published facts**: **30+** institutions on Commercial Analyzer/Optimizer; **$2T** in the benchmark; **10–15bps** interest-expense improvement per $1B of interest-bearing commercial deposits; benchmarks can be pushed into deal-pricing tools via API (Section P)
**Min assets**: $10B
**Institution types**: Banks with C&I, CRE, Business Banking, Mid-market or Corporate Banking segments
**Segments required**: Commercial deposits, ECR (Earnings Credit Rate), sweeps, TM fees
**Maturity**: Tier 2–4

**Signals to boost fit:**
- Treasury/transaction banking is a key fee growth pillar
- Commercial-heavy balance sheet (high C&I or CRE share)
- Corporate CFO / treasury management wins highlighted in earnings releases
- Competition versus large regionals or money-center banks for commercial relationships
- Language: "margin leakage," "relationship pricing," "ECR sweep programs"

**Deprioritize when:**
- Institution is almost entirely retail or mortgage / small business
- No treasury management offering

---

### Commercial Digital Analyzer
**Site status**: **UNLISTED** — the old URL redirects to the Commercial Suite, which does not mention it. Scored but capped at P3 with "availability unconfirmed" (C3) until Product confirms.
**Min assets**: $10B
**Institution types**: Banks serving mid-market or corporate clients digitally (cash management portals, APIs)
**Maturity**: Tier 3–4 (requires digital commercial infrastructure)

**Signals to boost fit:**
- Corporate API banking, embedded finance, or digital TM portals
- Investment in commercial online banking UX mentioned in earnings or strategy
- Competition vs "fintech treasury" providers (Mercury, Brex, Ramp, etc.)

---

### Treasury Management Fee Analyzer — NEW IN V4
**URL**: curinos.com/products/treasury-management-fee-analyzer
**Min assets**: $5B PROVISIONAL (none published) · **Institution types**: banks and thrifts with a TM business · **Country**: US
**Required segment**: `treasuryManagement` · **Maturity**: Tier 2–4
**Scoring need metrics**: deposit service charges / deposits vs peers (primary), NIB share vs peers · **Timing themes**: commercial_growth, product_redesign

**Core value**: Cleared-market TM pricing benchmarks for the most-used services, product-level growth trends (price vs volume), monthly dashboards and twice-yearly executive summaries, built to feed annual price events, deal reviews and deal-pricing tools.

**Published facts**: **$5B+** of annual gross TM fees benchmarked; ~**25%** of the US market; up to **7%** average annual TM fee increases incremental to business as usual.

**Signals to boost fit:**
- Treasury management named as a fee-growth pillar; TM fee income flat or lagging
- Annual repricing event approaching; exception pricing widespread
- Record commercial pipeline being onboarded — the moment TM pricing is set for years

---

### Digital Banking Analyzer
**URL**: curinos.com/products/digital-banking-analyzer · **Countries**: US, Canada, EMEA
**Scoring need metrics**: `digitalPriority` flag (primary), deposit growth vs peers, deposit growth · **Timing themes**: digital_program
**Published facts**: used by the majority of the top 20 US consumer banks and **80+** institutions globally; **300+** brands and **500K** digital journeys tracked; Journey Effort Score (application friction) and Action Communication and Experience Score (servicing); clients with better Journey Effort Scores achieve **2x** the checking approval and funding rates; **8pp** retention improvement from better servicing scores
**Min assets**: $5B
**Institution types**: Retail banks, large credit unions, neobanks
**Maturity**: Tier 2–4

**Signals to boost fit:**
- "Digital transformation" roadmap with specific mobile app metrics or NPS focus
- Competitive positioning versus direct banks or fintechs in strategy materials
- Heavy digital acquisition (online account opening, digital-only products)
- App store ratings, digital engagement metrics disclosed in annual reports

---

### LendersBenchmark Analyzer — Mortgage & Consumer
**URL**: curinos.com/products/lenders-benchmark-suite · **Country**: US
**Scored as**: "LendersBenchmark Analyzer" · **Scoring need metrics**: loan growth vs peers (primary), loan yield vs peers · **Timing themes**: lending_growth
**Published facts**: **$2.5T** in loan volume across **7M** transactions; weekly, lender-sourced (not self-reported) data to zip-code level; ~**50%** of the first mortgage and home equity markets; origination history to the early 2000s; **80%** of the top 50 US lenders supported by Curinos Pricing Data and LendersBenchmark
**Naming**: "LendersBenchmark" is one camel-case word. The live site presents a single LendersBenchmark Analyzer covering mortgage, home equity, unsecured and small business — it no longer shows two separate SKUs. The split below is retained because the gates differ; use the single name in client-facing output, or the LendersBenchmark Suite when describing full coverage.
**Min assets**: $5B (relevant for any FI with significant mortgage/consumer book)
**Institution types**: Banks and credit unions with mortgage or consumer lending
**Segments**: Mortgage, HELOC, auto, personal, credit card
**Maturity**: Tier 2–4

**Signals to boost fit:**
- Loan growth a key strategic priority
- NIM compression blamed on "competitive pricing" in lending markets
- Concern about margin versus volume trade-offs on rate sheets
- HELOC reactivation or mortgage recapture programmes

---

### LendersBenchmark Analyzer — Small Business Lending
**URL**: curinos.com/products/lendersbenchmark-analyzer-for-small-business-lending · **Country**: US
**Required segment**: `sbLending` · **Scoring need metrics**: loan growth vs peers, loan yield vs peers · **Timing themes**: lending_growth, commercial_growth
**Published facts**: tracks **35%+** of US small business loan originations; weekly applications, approvals and bookings across loans, lines and SBA products; monthly portfolio performance; every metric cut by NAICS, collateral and sales size; Tableau dashboards, Excel add-in and API
**Naming**: The page H1 reads "LendersBenchmark Analyzer For Small Business Lending". Retained as a separate entry for gating only — see the naming note on the Mortgage & Consumer entry.
**Min assets**: $1B
**Institution types**: Banks and credit unions with SBA channels or small-business loan portfolios
**Maturity**: Tier 2–4

**Signals to boost fit:**
- SBA loan volumes, PPP legacy, or small-business growth initiatives
- "Main Street" or "relationship banking" positioning
- Branch-based small-business focus with local underwriting

---

### Small Business Deposit Analyzer
**URL**: curinos.com/products/small-business-deposit-analyzer
**Required segment**: `smallBusiness` · **Scoring need metrics**: deposit growth vs peers (primary), NIB share vs peers, deposit growth · **Timing themes**: deposit_pricing, commercial_growth
**Published facts**: **>$250B** in balances from millions of individual accounts, **20%+** of US small business deposit balances; cleared (not posted) rate and beta benchmarks by segment and band; users achieve **5–10%** higher small business balance growth and retention
**Min assets**: $1B
**Institution types**: Banks and credit unions with small-business checking, MMAs, business CDs
**Maturity**: Tier 2–4

**Signals to boost fit:**
- "Small business is our core growth segment" in strategy or earnings
- Dedicated small-business segment leadership or P&L
- Public commentary on fee schedule updates or account redesign
- Business checking product redesign in progress

---

### Marketing Analyzer
**URL**: curinos.com/products/marketing-analyzer · **Country**: US
**Scoring need metrics**: deposit growth vs peers (primary), `cacPressure`, deposit growth · **Timing themes**: marketing_plan, new_market
**Published facts**: the only marketing-spend benchmark built on actual bank data; **$9B** of marketing spend analysed; proprietary cross-bank marketing mix model; clients see **20–30%** lower checking cost per acquisition within 12 months and acquire deposit customers at **2x** the peer rate
**Min assets**: $5B (strongest fit where annual marketing budget $10M+)
**Institution types**: Retail-heavy banks and credit unions, neobanks
**Maturity**: Tier 2–4

**Signals to boost fit:**
- Customer acquisition targets highlighted by CMO or CEO
- High digital ad spend; D2C acquisition strategy
- Pressure on marketing efficiency or customer acquisition cost (CAC)
- Multi-market campaigns with differentiated spend allocation

---

### Distribution Analyzer
**URL**: curinos.com/products/distribution-analyzer · **Country**: US
**Branch gate**: 25 (hard, C1) · **Scoring need metrics**: deposits per branch vs peers (primary), `branchProgram`, efficiency vs peers · **Timing themes**: branch_program
**Published facts**: **500+** branch-level metrics benchmarked against **20,000+** branches, normalised for market opportunity; **15 of the top 20** US banks in the data; clients' power ratios (acquisition share relative to branch share) run **2–3x** peers
**Min assets**: $5B
**Branch threshold**: ~25+ branches; strong fit at 50+
**Institution types**: Banks with sizeable branch networks
**Maturity**: Tier 2–4

**Signals to boost fit:**
- Branch restructuring, staffing optimisation, or "hub and spoke" initiatives
- Market footprint rationalisation following M&A
- Large variations in branch profitability or FTE costs
- Management language: "right-sizing," "optimizing our network," "digital migration"

---

### eBenchmarkers – Banking — UK / EMEA ONLY (changed in V4)
**URL**: curinos.com/products/ebenchmarkers-banking
**Country**: UK only (hard geography gate, C1) · **Maturity**: Tier 1–3
**Why the change**: V3 treated eBenchmarkers as a US "land" product and made it always-include for Tier 1 institutions. The product page is explicit that it is a UK benchmark — 25+ years in UK financial services, figures in sterling (a **£1.4T** multi-channel deposit benchmark, **30M** annual product sales, **71M** digital users) and an EMEA tag. It must not appear on a US or Canadian Product Fit tab, including as a DNR entry.

**Core value (UK)**: Anonymised peer benchmarks across customers (holdings, engagement, primacy), channels and products (current accounts, deposits, unsecured lending, mortgages), with expert-led analysis.

**US landing products instead**: Pricing Data and Advisory: Pricing Strategy & Optimization play the role V3 gave eBenchmarkers.

eBenchmarkers – Insurance (UK insurers) is outside the scope of Product Fit tabs.

---

## SECTION F: PILLAR 3 — OPTIMIZATION PLATFORMS

### ⚠️ CRITICAL DISTINCTION — ESSENTIALS vs. OPTIMIZER
| | Deposit Optimizer Essentials | Retail Deposit Optimizer |
|--|--|--|
| Asset threshold | Banks < $50B (sweet spot < $20B); credit unions < $30B | Banks ≥ $50B; credit unions ≥ $30B |
| Typical user | Community bank, credit union | Super-regional, large regional |
| Analytics staff | 1–5 FTEs, Excel-heavy | Dedicated pricing/analytics team |
| Maturity | Tier 1–3 (ideal 1–2) | Tier 3–4 (Tier 2 allowed at Maturity 45) |
| Integration | Minimal; web platform + emailed reports | Complex pricing operations, ALCO-driven |

---

### Deposit Optimizer Essentials
**URL**: curinos.com/who-we-help/partners/deposit-optimizer-essentials-curinos-fis (the old product URL redirects to the Deposit Suite)
**Hard gates**: banks/thrifts < $50B; credit unions < $30B (C1) · **Scoring need metrics**: deposit cost vs peers (primary), marginal funding gap, NIM vs peers, time-deposit share, deposit growth vs peers, deposit growth · **Timing themes**: deposit_pricing, funding_gap · **Feasibility**: +15 on FIS IBS or HORIZON cores (Section P)
**Min assets**: None | **Max assets**: ~$50B (sweet spot < $20B)
**Institution types**: Community banks, credit unions
**Maturity**: Tier 1–3 (ideal 1–2). Tier 3 is in range (Maturity 75) because a sub-$50B Tier 3 bank has no other deposit optimizer — Retail Deposit Optimizer is gated out on size

**What it does**: Web platform with executive dashboard and industry comparisons, named-competitor rate data, an emailed executive summary written for deposit-committee packs, and quarterly expert webinars with dedicated client success support. Launched October 2023 for community banks and credit unions.

**Published facts**: processes **$3T** of consumer account-level deposit data, **45%** of the market; **50–90%** reduction in analysis and report-generation time; integrated with FIS IBS and HORIZON cores for accelerated onboarding.

**Signals to boost fit:**
- Small treasury or analytics team (1–5 FTEs wearing multiple hats)
- Heavy use of Excel, basic ALM system, little in-house modelling
- NIM pressure and CD walls but low appetite for enterprise integration
- Language: "we don't have the bandwidth to build this ourselves"

**Deprioritize when:**
- Large regional or super-regional with dedicated analytics/pricing function (then use Retail Deposit Optimizer)

---

### Retail Deposit Optimizer
**URL**: curinos.com/products/retail-deposit-analyzer-optimizer-suite
**Hard gates**: banks/thrifts ≥ $50B; credit unions ≥ $30B (C1) · **Scoring need metrics**: as Deposit Optimizer Essentials · **Timing themes**: deposit_pricing, funding_gap
**Published facts**: "used by the vast majority of the top 25 banking institutions" (Curinos release, Oct 2023); price-elasticity models by product, market and segment; long-term value estimation; Deposit Optimizer + Analyzer clients outperform peers by **15bps** across rising and falling rate environments (Treasury Analyzer page) — as high as 15bps per the FIS release
**Min assets**: $50B (credit unions $30B)
**Institution types**: Super-regional and large regional banks; very large credit unions ($30B+)
**Maturity**: Tier 3–4

**Signals to boost fit:**
- Active and complex pricing operations (many products, varied tenor grid)
- Multiple geographies, states, or brands
- Savings, MMDA, CD, and non-interest checking pricing executed centrally
- NIM is a board-level KPI; CFO/ALCO very data-driven
- Language: "centralised pricing committee," "we price in real time," "we track competitor moves daily"

---

### Commercial Optimizer
**URL**: curinos.com/products/commercial-analyzer-optimizer-suite · **Country**: US · **Required**: `commercial`, `treasuryManagement` · **Feasibility**: +10 with a deal-pricing tool (Section P)
**Min assets**: $10B (strong fit $25B+)
**Institution types**: Banks with large commercial deposit and treasury management portfolios
**Maturity**: Tier 3–4

**Signals to boost fit:**
- Relationship-based pricing but concerns about "margin leakage"
- Large ECR/sweep programs at scale
- Complex TM fee schedules and negotiated relationship pricing
- Corporate/Commercial banking is a top earnings driver
- Language: "we leave money on the table with commercial relationships"

---

### Amplero Personalization Optimizer — RETIRED (V4)
curinos.com/amplero-personalization-optimizer/ now redirects to the Curinos One Compound page. Amplero is not scored and must not appear in `products[]` or `dnrProducts[]`. Where V3 would have recommended Amplero (CDP or marketing automation in production, next-best-action ambitions, cross-sell or retention objectives), score **Curinos One Capture / Compound** instead. For credit unions, keep V3's language rule: "member relevance", never "cross-sell".

---

### Profitability Optimizer
**Site status**: **UNLISTED** — old URL redirects to the product index; no page. Capped at P3, "availability unconfirmed" (C3).
**Min assets**: $5B
**Institution types**: Banks with multi-market footprints; branch profitability focus
**Maturity**: Tier 2–4

**Signals to boost fit:**
- Cost discipline, FTE optimisation, or ROA/ROE improvement programme
- Multi-market branch networks and segmented performance management
- Strong interest in relationship-level or customer-level profitability views
- Efficiency ratio is a strategic KPI

---

### Wealth Optimizer
**URL**: curinos.com/products/wealth-deposit-analyzer-optimizer-suite · **Country**: US
**Min assets**: $10B
**Institution types**: Banks with meaningful wealth or private banking franchises
**Maturity**: Tier 3–4

**Signals to boost fit:**
- Large cash sweeps and deposit-like components in AUM
- Complex tiered relationships and fee schedules for HNW clients
- Material interest in optimising wealth cash allocation and pricing
- Wealth division is a top earnings growth driver

---

### Lenders Optimizer
**Site status**: **UNLISTED** — old URL redirects to the LendersBenchmark Suite, which describes no optimizer. Capped at P3, "availability unconfirmed" (C3).
**Min assets**: $5B
**Institution types**: Banks and credit unions with sizable mortgage or consumer lending (or both)
**Maturity**: Tier 3–4

**Signals to boost fit:**
- Active rate sheet management (frequent pricing decisions)
- Desire to balance volume versus margin on rate sheets
- Heavy use of rate specials, promotions, or buydowns
- NIM compression attributed to competitive lending pricing

---

### Distribution Optimizer
**URL**: curinos.com/products/distribution-optimizer (single product; the V3 US/Canada split is gone — score one entry)
**Countries**: US and Canada · **Branch gate**: 50 (hard, C1), sweet spot 100+ · **Min assets**: $5B · **Maturity**: Tier 2–4
**Scoring need metrics**: deposits per branch vs peers (primary), `branchProgram`, efficiency vs peers · **Timing themes**: branch_program, new_market

**Core value**: Web-based GIS platform to evaluate current and future network configurations, locations, formats and real estate, using micro-markets, the Four Factor opportunity framework and block-group site-visibility scoring.

**Published facts**: **2,000+** markets analysed; **$6T** in deposits covered; **120K+** bank branch demographic records.

**Signals to boost fit:**
- Branch expansion or consolidation announced or planned; post-M&A overlap
- Multi-state footprint with dense urban markets; de novo market entry
- Branch ROI and market-potential analysis referenced in strategy materials

**Benchmark note**: when the institution already runs the best efficiency ratio in its cohort, the benchmark cap applies to the efficiency metric only if it is the primary metric — it is not, so a live branch programme can still carry this product.

---

## SECTION G: TREASURY STRATEGIES — RETIRED FROM PRODUCT FIT TABS (V4)

curinos.com/treasury-strategies/ now redirects to the homepage. The only corporate-treasury product still on the site is **NDepth** (curinos.com/ndepth): automated bank account analysis for corporate treasurers — upload monthly analysis statements in any format (PDF, EDI, TWIST/BSB/CAMT), map to product families, benchmark prices and ECR across banks, and flag contract-price deviations.

NDepth serves the *bank's corporate clients*, not the bank. It is **not scored** and never appears on a Product Fit tab. If a seller is positioning Curinos to an FI's corporate treasury clients, that is a separate conversation outside this pipeline. Do not confuse with Treasury Analyzer or Advisory: Treasury & Balance Sheet Management.

---

## SECTION H: PILLAR 5 — ADVISORY

> **URL change, August 2026.** The nine `curinos.com/advisory/[engagement]/` paths still return HTTP 200, but every one of them now renders the same Advisory Solutions hub — the per-engagement pages were retired in the site refresh. Citing an old path sends a seller to a page that does not discuss the engagement they named, which is worse than a 404 because nothing looks broken. All nine URLs below now point at the hub, with the engagement's card name given so the reader knows what to look for. The engagements themselves are unchanged and still sold.

**Global rule**: Advisory must appear in EVERY Product Fit tab. Never omit entirely. At minimum, include Pricing Strategy & Optimization.

Advisory engagements are bespoke consulting projects using Curinos proprietary data + expert consultants. They complement platform products and are often the entry point before platform adoption.

**Published scale behind Advisory** (advisory-solutions page): **$6T+** in deposit balances, **$3T+** in mortgage originations, **$9B+** of US annual marketing spend, **94M** checking accounts, **500K** digital journeys, **20K** bank branches. Case studies are now published online from that page. Each engagement card has a downloadable one-pager; case-study dollar figures are **not** on the page, so V3's `$[X]M` placeholders are removed — request figures from Advisory before quoting any.

---

### Advisory: Pricing Strategy & Optimization
**URL**: curinos.com/advisory-solutions (card: "Pricing Strategy & Optimization")
**Min assets**: $1B+ (but any size)
**Institution types**: All deposit-taking and lending institutions
**Maturity**: Tier 1–4 (most flexible; entry-level advisory)
**Floor**: never Do Not Recommend; minimum P3 (C2)
**Site card**: helps clients navigate deposit and lending pricing decisions across a wide range of environments and scenarios
**Scoring need metrics**: deposit cost vs peers (primary), marginal funding gap, NIM vs peers, time-deposit share, deposit growth · **Timing themes**: deposit_pricing, funding_gap

**Core value**: Navigate deposit and lending pricing with confidence using proprietary benchmarks + elasticity curves.
- Case-study themes (figures not published): CD maturity wall strategy; auto loan pricing optimisation

**Signals to boost fit:**
- NIM compression or NIM gap versus peers
- Looming CD maturity wall (large CD book repricing in 6–18 months)
- New pricing leadership or strategy refresh underway
- Severe rate-cycle transitions (fast rise or sharp fall in policy rates)
- Language: "we need to rethink our pricing approach," "we're losing deposits to online banks"

---

### Advisory: Treasury & Balance Sheet Management
**URL**: curinos.com/advisory-solutions (card: "Treasury & BS Management")
**Min assets**: $1B+
**Institution types**: Any bank or credit union with ALCO and IRR/liquidity risk responsibilities
**Maturity**: Tier 1–4
**Floor**: minimum P3 wherever an ALCO exists (C2) · **Required function**: `alco`
**Site card**: supports bank, investment-manager and fintech treasury/finance teams on interest-rate and liquidity risk, FTP and enterprise balance sheet strategy
**Scoring need metrics**: as Treasury Analyzer · **Timing themes**: alm_regulatory, funding_gap

**Core value**: IRR/liquidity risk management, FTP methodology, enterprise balance sheet strategy. Serves community banks, credit unions, national banks, fintechs, and investment managers.
- Case studies: FTP implementation for fintech, IRR programme review for top-5 Canadian bank, charter support for de novo bank, regulatory MRA remediation

**Signals to boost fit:**
- Regulatory commentary about IRR, liquidity, MRAs, MRIs, or risk management in filings
- Major balance sheet shifts (large securities portfolios, big OCI swings)
- New or revised FTP frameworks under discussion
- Complex funding mix warranting external advisory

---

### Advisory: Value Proposition
**URL**: curinos.com/advisory-solutions (card: "Value Proposition")
**Scoring need metrics**: deposit growth vs peers (primary), `newMarketEntry`, deposit growth · **Timing themes**: new_market, ma_integration, product_redesign
**Min assets**: Any
**Institution types**: All

**Signals to boost fit:**
- Rebrand or repositioning strategy underway
- Major competitive repositioning (new market segments, new customer types)
- M&A-driven brand rationalisation (post-merger identity)
- Entering new geographies where the brand is unknown

---

### Advisory: Market Playbook
**URL**: curinos.com/advisory-solutions (card: "Market Playbook")
**Required**: `multiMarket` · **Scoring need metrics**: `newMarketEntry` (primary), deposit growth vs peers, deposit growth · **Timing themes**: new_market, ma_integration
**Min assets**: $1B+ (stronger fit for multi-market regionals)
**Institution types**: Banks and credit unions operating in multiple markets

**Signals to boost fit:**
- Expansion into new geographies
- Underperformance in specific markets versus others (market-level P&L view)
- Aggressive local competitor actions requiring market-specific response
- Post-M&A market strategy rationalisation

---

### Advisory: Product Design
**URL**: curinos.com/advisory-solutions (card: "Product Design")
**Scoring need metrics**: NIB share vs peers (primary), service charges vs peers, NIB balance trend · **Timing themes**: product_redesign
**Min assets**: Any
**Institution types**: All

**Signals to boost fit:**
- Checking or savings product redesign underway
- Fee schedule optimisation initiative
- Desire to launch new products or change account features/tiers
- Language: "we haven't touched our product structure in years," "we need to simplify our CD ladder"

---

### Advisory: Network Optimization
**URL**: curinos.com/advisory-solutions (card: "Network Optimization")
**Min assets**: $5B
**Branch gate**: 50 (hard, C1); strongest at 100+. V3's always-include rule is withdrawn
**Scoring need metrics**: `branchProgram` (primary), deposits per branch vs peers, efficiency vs peers · **Timing themes**: branch_program, new_market

**Signals to boost fit:**
- Public branch closure or consolidation plans announced
- Major cost-cutting or efficiency ratio improvement targets
- Post-M&A network overlap requiring rationalisation
- Specific MSA market share objectives requiring branch repositioning

---

### Advisory: M&A Support
**URL**: curinos.com/advisory-solutions (card: "M&A Support")
**Min assets**: $1B+ (any size, but especially $1B+)
**Gate**: `maRelevant` (C1) · **Scoring need metric**: `maActivity` — announced/pending 100, integrating 80, appetite signalled 60, completed and integrated 40, ruled out 10 · **Timing themes**: ma_integration
V3's always-include rule is withdrawn: an acquisition closed and integrated two years ago, with further M&A ruled out, no longer earns a card.

**Signals to boost fit:**
- M&A announced or completed in last 5 years
- Management signalling acquisition appetite
- Integration challenges mentioned in filings or earnings
- Cross-state or cross-market expansion requiring customer/deposit analysis
- Deposit pricing harmonisation required post-acquisition

---

### Advisory: Commercial Strategy
**URL**: curinos.com/advisory-solutions (card: "Commercial Strategy")
**Required**: `commercial` · **Scoring need metrics**: service charges vs peers (primary), NIB share vs peers · **Timing themes**: commercial_growth
**Min assets**: $5B
**Institution types**: Banks with sizeable commercial franchises

**Signals to boost fit:**
- "Profitable growth" targeted in commercial banking division
- Treasury management fee growth is a stated priority
- Under-penetrated markets for business banking identified
- Language: "we want to win more primary banking relationships with mid-market companies"

---

### Advisory: Marketing Investment Planning
**URL**: curinos.com/advisory-solutions (card: "Marketing Inv. Planning")
**Scoring need metrics**: `cacPressure` (primary), deposit growth vs peers, deposit growth · **Timing themes**: marketing_plan, new_market
**Min assets**: $5B (strongest fit with $10M+ annual marketing budget)
**Institution types**: Banks and credit unions with multi-channel marketing

**Signals to boost fit:**
- Multi-channel marketing with complex spend allocation questions
- CMO mentioning "ROI on spend" or CAC pressure in earnings
- Geographic expansion requiring new market entry investment modelling

---

## SECTION I: PRODUCT SELECTION — DECISION SEQUENCE

### I1 — Order of operations (executed by `score_v4.py`)
1. **Retired products** (Amplero, Treasury Strategies) are never scored
2. **Hard gates** (C1): geography → type → size → required segments → branch count → maturity floor. Any failure is DNR with the gate named
3. **Dimensions** (K4): Need, Timing, Maturity, Feasibility → Readiness multiplier → Fit
4. **Priority table** (K5): P1 / P2 / P3 / DNR on Fit, Need and Timing
5. **Product-specific P1 rule**: the Compound two-part trigger (C3)
6. **Caps** (C3): roadmap, unlisted, unknown input → maximum P3; benchmark cap is applied inside Need
7. **Floors** (C2): Pricing Data ≥ P2; Advisory Pricing Strategy ≥ P3; Advisory T&BS ≥ P3 with ALCO

Nothing in steps 1–7 is a judgement call. Judgement lives in two places only: choosing the evidence for `scoringInputs`, and writing the narrative for each recommended product.

### I2 — Language rules (unchanged from V3)
- **Credit unions**: never position deposit products as "margin extraction" — frame as "member value per dollar of cost"; Curinos One is "member relevance", never "cross-sell"
- **Benchmark institutions**: when the benchmark cap fires, the card must say the institution already leads and frame the product as extending an advantage. A `salesPlaybook.landmines` entry should bar the repair pitch
- **Roadmap modules**: never "available", "live" or "deployed"; always "on the Curinos One roadmap"
- **Unlisted products**: never quote a price, timeline or client; the card carries "availability to be confirmed"

### I3 — Product category labels (use consistently)
Intelligent Data · Comparative Analytics · Optimization Platform · Advisory · Curinos One Module. "Suite" is a packaging label used in copy, never a scored category. "Treasury Strategies" is withdrawn.

---

## SECTION J: INSTITUTION TYPE → TYPICAL OUTCOMES (orientation only)

This section describes what the scorer **usually** produces, so a reviewer can spot an input error. It is not a rule set, and a build must never be edited to match it.

**Corrections to V3.** V3's J stacks referenced two products that do not exist ("Consumer Deposit Benchmark" and "Advisory: Deposit Pricing Strategy") and routinely listed Amplero and eBenchmarkers for US institutions. All four are removed.

### Bank or thrift, $10–$75B
Usually recommended: Pricing Data (floored at P2), Retail Deposit Analyzer, the deposit optimizer on the correct side of $50B, Advisory: Pricing Strategy, Treasury Analyzer where funding or ALM metrics show pain. Commercial products where the commercial book is material. Distribution products only with a sourced branch count or lower bound. Curinos One Compound when LDR ≥ 90% and loans outgrow deposits; Capture when entering markets without deposit history.
Usually excluded: the wrong-side deposit optimizer (gate); eBenchmarkers (geography); Wealth products without a wealth division.

### Bank, $75B+
As above with Retail Deposit Optimizer and Commercial Optimizer; Tier 3–4 maturity lifts Readiness for Optimizers and Curinos One.

### Credit union
Deposit Optimizer Essentials below $30B, Retail Deposit Optimizer at $30B+. Commercial, TM, Wealth and Commercial Data products usually gate out on segment. Frame everything as member value.

### Neobank / digital-only
Pricing Data, Digital Banking Analyzer, Marketing Analyzer, Curinos One Capture. Distribution products gate out on branches (0); Treasury Analyzer only where an ALCO exists.

### Specialty lender
Pricing Data (retail lending), LendersBenchmark, Advisory: Pricing Strategy. Deposit products only where a retail deposit franchise is confirmed (e.g. a branchless deposit bank funding a lending book); no distribution products; Compound only where a deposit base exists to deepen.

### Wealth / private bank
Wealth Analyzer, Wealth Optimizer at Tier 3+, Wealth Cash suite where a sweep programme exists, Pricing Data, Advisory: Treasury & BS where an ALCO exists.

### Mortgage / consumer specialist
Pricing Data (mortgage), LendersBenchmark Analyzer, Advisory: Pricing Strategy. No deposit, distribution or Curinos One products.

### Broker-dealer / wealth platform
Wealth Cash Analyzer/Optimizer Suite only.

---

## SECTION K: PRODUCT FIT SCORING MODEL (V4)

### K0 — Why the model changed

| V3 behaviour | Consequence | V4 fix |
|---|---|---|
| Five additive dimensions; Size/Type, Segment and Maturity carried 60% of the weight and sat near 100 for every in-scope product | Scores compressed into 75–95; the skill needed distribution quotas ("if all score above 80, reclassify three") to force a spread | Structural fit becomes hard gates (C1) that earn no points; Maturity and Feasibility become a readiness multiplier that can only subtract |
| Size scored as a dimension (max ~10 points) | A product the size gate excludes could still reach P2 (V3's own K5 example: Essentials at a $180B bank scored 63) | Size is a hard gate |
| Need and strategy tags assessed by judgement against a peer set that varied by build | Scores could not be reproduced; one September 2026 build's sixteen stated fit scores sat +2 to +22 points off the V3 formula | Named metrics per product, fixed severity bands, peer median from the dashboard's own sourced cohort, computed by script |
| Rules held in the build log, not the catalogue | Applied inconsistently (Compound promoted at 88.9% LDR; Distribution Optimizer at P1 on an unsourced branch count) | Codified as caps (C3) and enforced by script |
| K5 worked example arithmetic inconsistent (NeedFit 82 in the rationale, 88 in the table) | Copied into builds | Worked example (K6) is generated by the script |
| Timing/urgency not modelled | A real but distant need scored the same as one with a decision due next quarter | New Timing dimension from dated catalysts |

### K1 — The pipeline

```
Stage 1  Hard gates (C1)            -> any failure: DNR, reason = the gate
Stage 2  Need, Timing               -> Base = 0.70 × Need + 0.30 × Timing
         Maturity, Feasibility      -> Readiness = 0.60 + 0.40 × mean(Maturity, Feasibility) / 100
         Fit = round(Base × Readiness)                      (0–100)
Stage 3  Priority table (K5)        -> P1 / P2 / P3 / DNR
Stage 4  Product P1 rule, caps (C3), floors (C2)
```

Readiness runs from 0.60 (maturity and feasibility both at their floor) to 1.00. A perfectly ready institution with no need and no catalyst scores at most 0.70 × 10 + 0.30 × 20 = 13 — Do Not Recommend. A strong need with a dated catalyst at a Tier 2 institution that is one tier short of the product's minimum still scores in the 60s–70s: recommended, with the delivery gap visible in the card.

### K2 — `scoringInputs`: the evidence block Run A writes

Every value must trace to a source already cited in the dashboard. Unknown is `null` — never a guess, never a default typed in to make a product pass.

```json
"scoringInputs": {
  "country": "US",
  "type": "commercial_bank",
  "assetsB": 30.0,
  "tier": 2,
  "branches": null,
  "branchesMin": 50,
  "branchesEvidence": "Illustrative: a sourced statement that 50+ branches are being consolidated this year (earnings call)",
  "segments": {
    "retailDeposits": true, "smallBusiness": null, "commercial": true, "treasuryManagement": true,
    "wealth": true, "cashSweep": null, "mortgage": true, "homeEquity": true, "consumerLending": true,
    "sbLending": null, "alco": true, "firstPartyData": true, "digitalBanking": true,
    "multiMarket": true, "maRelevant": true, "maIntegrationActive": false
  },
  "metrics": {
    "ibDepositCostPct": 2.40, "peerIbDepositCostPct": [2.50],
    "nimPct": 3.50, "peerNimPct": [3.70, 3.30],
    "efficiencyPct": 52.0, "peerEfficiencyPct": [48.0, 58.0],
    "nibSharePct": null, "peerNibSharePct": [],
    "depositGrowthPct": -0.5, "peerDepositGrowthPct": [],
    "loanGrowthPct": 1.5, "peerLoanGrowthPct": [],
    "nibGrowthPct": -2.0, "timeDepositSharePct": 12.0, "ldrPct": 88.0,
    "uninsuredSharePct": null, "wholesaleFundingPct": 6.0, "aociToTcePct": null,
    "marginalFundingCostPct": 3.00, "bookDepositCostPct": 1.80,
    "depositsPerBranchM": null, "peerDepositsPerBranchM": [],
    "loanYieldPct": null, "peerLoanYieldPct": [],
    "serviceChargesToDepositsBps": null, "peerServiceChargesToDepositsBps": [],
    "wealthFeeGrowthPct": 2.0, "wealthBalancesB": 10.0, "sweepBookB": null
  },
  "flags": {
    "regulatoryIrrLiquidity": "none", "branchProgram": "announced", "newMarketEntry": true,
    "cacPressure": null, "digitalPriority": null, "attritionSignal": null,
    "maActivity": "completed_integrated"
  },
  "guidance": { "loansOutgrowDeposits": true, "depositCostFloor": true },
  "statedPriorities": ["grow_commercial", "market_expansion", "optimise_branch_network",
                       "right_size_distribution", "fund_loan_growth", "grow_retail_deposits"],
  "catalysts": [
    { "theme": "branch_program", "monthsOut": 3, "desc": "Next phase of the branch consolidation programme" },
    { "theme": "new_market", "monthsOut": 7, "desc": "De novo branches open in a new state" },
    { "theme": "deposit_pricing", "monthsOut": 3, "desc": "CD maturity wall reprices next quarter" },
    { "theme": "funding_gap", "monthsOut": 3, "desc": "Funding plan for guided loan growth due at next ALCO" },
    { "theme": "commercial_growth", "monthsOut": 3, "desc": "Annual treasury-management price event" }
  ],
  "techStack": {
    "fisIbsHorizon": null, "databricks": null, "salesforce": null, "dealPricingTool": null,
    "coreConversionActive": false, "fragmentedDataPostMerger": null,
    "employeesUnder200": false, "existingCurinosClient": null
  },
  "ownedProducts": []
}
```

> **All figures in this example are round, fictional values.** They exist only to show the schema and to reproduce the K6 table. Never copy a value, catalyst, priority tag or branch bound from here into an intel JSON — every `scoringInputs` value must come from the cycle's own sourced research.

**Field rules**
- **Peer arrays** hold the values for the peers in the dashboard's Peer Comparison cohort, for the same quarter, only where the measure is like-for-like (for example, cost of interest-bearing deposits, never cost of interest-bearing liabilities). The scorer takes the median and **requires at least two peers**; with fewer, that vs-peer metric is unavailable and is skipped, never estimated.
- **`wholesaleFundingPct`** = (borrowings + brokered deposits) / total assets. **`timeDepositSharePct`** = time deposits / total deposits. **`aociToTcePct`** = AOCI loss as a positive % of tangible common equity.
- **`marginalFundingCostPct`** only when management states a marginal or incremental funding cost; **`bookDepositCostPct`** is total cost of deposits for the same period.
- **`statedPriorities`** — tags from K4.2 only, each evidenced in `strategyPillars[]` or earnings commentary. Aspirational boilerplate ("we are customer-centric") earns no tag.
- **`catalysts`** — a dated or dateable decision point: CD maturity wall, deposit campaign, branch programme phase, market opening, M&A close or conversion, core conversion, ALCO or regulatory deadline, TM price event, planning cycle. `monthsOut` from the build date; `null` when management states it without a date.
- **`branchesMin`** — a lower bound established from a sourced fact, with `branchesEvidence` stating the fact. Never an inference from size alone.
- **`techStack`** — `true` only on evidence (earnings, 10-K, press, partner announcement, job postings cited as such).

### K3 — Product registry (mirrors `score_v4.py`)

Status: listed · listed_in_suite · unlisted (capped P3) · roadmap (capped P3). Size: guide floor unless marked **hard**; below half a guide floor is a hard fail.

| Product | Status | Countries | Types | Size gate ($B) | Required | Branches | Tiers (ideal) | Need metrics (primary first) | Timing themes |
|---|---|---|---|---|---|---|---|---|---|
| Pricing Data | listed | US/CA | all FI | – | any of retailDeposits/mortgage/homeEquity/consumerLending/commercial | – | 1–4 (1,2,3,4) | depCostVsPeer, marginalFundingGap, nimVsPeer, depGrowthVsPeer, timeDepShare, depGrowth | deposit_pricing, funding_gap, new_market, lending_growth |
| Commercial Data | listed | US | banks & thrifts | – | commercial, treasuryManagement | – | 1–4 (1,2,3,4) | svcChargesVsPeer, nibShareVsPeer, depCostVsPeer | commercial_growth, product_redesign |
| Retail Deposit Analyzer | listed_in_suite | US/CA | deposit-takers + lenders w/ deposits | ≥5 | retailDeposits | – | 2–4 (2,3) | depGrowthVsPeer, depCostVsPeer, nibShareVsPeer, nibTrend, depGrowth | deposit_pricing, funding_gap |
| Retail Deposit Optimizer | listed_in_suite | US/CA | deposit-takers + lenders w/ deposits | ≥50 hard (CU ≥30) | retailDeposits | – | 3–4 (3,4) | depCostVsPeer, marginalFundingGap, nimVsPeer, timeDepShare, depGrowthVsPeer, depGrowth | deposit_pricing, funding_gap |
| Deposit Optimizer Essentials | listed | US/CA | commercial bank, community bank, credit union, savings institution, specialty lender | <50 hard (CU <30) | retailDeposits | – | 1–3 (1,2) | depCostVsPeer, marginalFundingGap, nimVsPeer, timeDepShare, depGrowthVsPeer, depGrowth | deposit_pricing, funding_gap |
| Small Business Deposit Analyzer | listed | US/CA | deposit-takers | ≥1 | smallBusiness | – | 2–4 (2,3) | depGrowthVsPeer, nibShareVsPeer, depGrowth | deposit_pricing, commercial_growth |
| Commercial Analyzer | listed_in_suite | US | banks & thrifts | ≥10 | commercial | – | 2–4 (2,3) | nibShareVsPeer, depCostVsPeer, svcChargesVsPeer | commercial_growth, funding_gap |
| Commercial Optimizer | listed_in_suite | US | banks & thrifts | ≥10 | commercial, treasuryManagement | – | 3–4 (3,4) | nibShareVsPeer, depCostVsPeer, svcChargesVsPeer | commercial_growth, funding_gap |
| Treasury Management Fee Analyzer | listed | US | banks & thrifts | ≥5 | treasuryManagement | – | 2–4 (2,3) | svcChargesVsPeer, nibShareVsPeer | commercial_growth, product_redesign |
| Wealth Analyzer | listed_in_suite | US | banks, thrifts, wealth | ≥10 | wealth | – | 2–4 (2,3) | wealthFeeGrowth, wealthScale | wealth_growth |
| Wealth Optimizer | listed_in_suite | US | banks, thrifts, wealth | ≥10 | wealth | – | 3–4 (3,4) | wealthFeeGrowth, wealthScale | wealth_growth |
| Wealth Cash Analyzer/Optimizer Suite | listed | US | broker dealer, commercial bank, wealth private | – | cashSweep | – | 2–4 (2,3,4) | sweepScale | wealth_growth |
| Treasury Analyzer | listed | US | deposit-takers + lenders w/ deposits | ≥5 | alco | – | 2–4 (2,3,4) | wholesaleShare, uninsuredShare, aociToTce, regulatoryIrrLiquidity, ldr | alm_regulatory, funding_gap |
| LendersBenchmark Analyzer | listed | US | all FI | ≥5 | any of mortgage/homeEquity/consumerLending | – | 2–4 (2,3) | loanGrowthVsPeer, loanYieldVsPeer | lending_growth |
| LendersBenchmark Analyzer for Small Business Lending | listed | US | all FI | ≥1 | sbLending | – | 2–4 (2,3) | loanGrowthVsPeer, loanYieldVsPeer | lending_growth, commercial_growth |
| Lenders Optimizer | unlisted | US | all FI | ≥5 | any of mortgage/homeEquity/consumerLending | – | 3–4 (3,4) | loanGrowthVsPeer, loanYieldVsPeer | lending_growth |
| Marketing Analyzer | listed | US | deposit-takers + lenders w/ deposits | ≥5 | retailDeposits | – | 2–4 (2,3) | depGrowthVsPeer, cacPressure, depGrowth | marketing_plan, new_market |
| Distribution Analyzer | listed | US | deposit-takers | ≥5 | – | 25 | 2–4 (2,3) | depPerBranchVsPeer, branchProgram, effVsPeer | branch_program |
| Distribution Optimizer | listed | US/CA | deposit-takers | ≥5 | – | 50 | 2–4 (2,3,4) | depPerBranchVsPeer, branchProgram, effVsPeer | branch_program, new_market |
| Digital Banking Analyzer | listed | US/CA/UK | deposit-takers + lenders w/ deposits | ≥5 | digitalBanking | – | 2–4 (2,3,4) | digitalPriority, depGrowthVsPeer, depGrowth | digital_program |
| eBenchmarkers - Banking | listed | UK | deposit-takers + lenders w/ deposits | – | – | – | 1–3 (1,2) | depGrowthVsPeer, depGrowth | deposit_pricing |
| Commercial Digital Analyzer | unlisted | US | banks & thrifts | ≥10 | commercial, digitalBanking | – | 3–4 (3,4) | digitalPriority | digital_program |
| Profitability Optimizer | unlisted | US | deposit-takers | ≥5 | – | – | 2–4 (2,3) | effVsPeer | branch_program |
| Curinos One Capture | listed | US/CA | deposit-takers + lenders w/ deposits | ≥10 | retailDeposits, firstPartyData | – | 2–4 (3,4) | newMarketEntry, depGrowthVsPeer, cacPressure, depGrowth | new_market, marketing_plan |
| Curinos One Compound | listed | US/CA | deposit-takers + lenders w/ deposits | ≥10 | retailDeposits, firstPartyData | – | 2–4 (3,4) | ldr, loanMinusDepGrowth, nibTrend, depGrowthVsPeer, depGrowth | funding_gap, deposit_pricing |
| Curinos One Commit | roadmap | US/CA | deposit-takers + lenders w/ deposits | ≥10 | retailDeposits, firstPartyData | – | 2–4 (3,4) | nibShareVsPeer, nibTrend | funding_gap |
| Curinos One Conserve | roadmap | US/CA | deposit-takers + lenders w/ deposits | ≥10 | retailDeposits, firstPartyData | – | 2–4 (3,4) | attritionSignal, depGrowthVsPeer, depGrowth | deposit_pricing |
| Curinos One Calibrate | roadmap | US/CA | deposit-takers + lenders w/ deposits | ≥10 | retailDeposits, firstPartyData | – | 2–4 (3,4) | nimVsPeer, depCostVsPeer | deposit_pricing |
| Advisory: Pricing Strategy & Optimization | listed | US/CA | all FI | – | – | – | 1–4 (1,2,3,4) | depCostVsPeer, marginalFundingGap, nimVsPeer, timeDepShare, depGrowth | deposit_pricing, funding_gap |
| Advisory: Treasury & Balance Sheet Management | listed | US/CA | all FI | – | alco | – | 1–4 (1,2,3,4) | wholesaleShare, uninsuredShare, aociToTce, regulatoryIrrLiquidity, ldr | alm_regulatory, funding_gap |
| Advisory: Value Proposition | listed | US/CA | all FI | – | – | – | 1–4 (1,2,3,4) | depGrowthVsPeer, newMarketEntry, depGrowth | new_market, ma_integration, product_redesign |
| Advisory: Market Playbook | listed | US/CA | all FI | – | multiMarket | – | 1–4 (1,2,3,4) | newMarketEntry, depGrowthVsPeer, depGrowth | new_market, ma_integration |
| Advisory: Product Design | listed | US/CA | all FI | – | – | – | 1–4 (1,2,3,4) | nibShareVsPeer, svcChargesVsPeer, nibTrend | product_redesign |
| Advisory: Network Optimization | listed | US/CA | all FI | ≥5 | – | 50 | 1–4 (1,2,3,4) | branchProgram, depPerBranchVsPeer, effVsPeer | branch_program, new_market |
| Advisory: M&A Support | listed | US/CA | all FI | – | maRelevant | – | 1–4 (1,2,3,4) | maActivity | ma_integration |
| Advisory: Commercial Strategy | listed | US/CA | banks & thrifts | ≥5 | commercial | – | 1–4 (1,2,3,4) | svcChargesVsPeer, nibShareVsPeer | commercial_growth |
| Advisory: Marketing Investment Planning | listed | US/CA | all FI | ≥5 | retailDeposits | – | 1–4 (1,2,3,4) | cacPressure, depGrowthVsPeer, depGrowth | marketing_plan, new_market |

### K4 — The dimensions

#### K4.1 — Need (0–100)

`Need = 0.70 × MetricPain + 0.30 × StatedPriority`

**MetricPain** is `0.5 × (band score of the product's first-listed need metric) + 0.5 × (mean of all available need-metric band scores)`. The first-listed metric is the product's primary one; weighting it stops secondary metrics from diluting a severe primary problem (v4.1). If the primary metric is unavailable, MetricPain is the plain mean of those available. With none available it defaults to 30 (par) and the card must say the need could not be quantified. Band scores: severe **100** · moderate **80** · mild **60** · par **30** · better than peers **10**.

| Metric key | Measures | Unit | Severe (100) | Moderate (80) | Mild (60) | Par (30) | Better (10) |
|---|---|---|---|---|---|---|---|
| `depCostVsPeer` | Interest-bearing deposit cost vs peer median | bps | ≥ 50 | ≥ 25 | ≥ 10 | > -10 | ≤ -10 |
| `marginalFundingGap` | Marginal funding cost minus book deposit cost (management-stated) | bps | ≥ 125 | ≥ 75 | ≥ 40 | > 15 | ≤ 15 |
| `nimVsPeer` | NIM vs peer median | bps | ≤ -50 | ≤ -25 | ≤ -10 | < 10 | ≥ 10 |
| `nibShareVsPeer` | Non-interest-bearing share vs peer median | pts | ≤ -8 | ≤ -4 | ≤ -2 | < 2 | ≥ 2 |
| `depGrowthVsPeer` | Deposit growth YoY vs peer median | pts | ≤ -3 | ≤ -1.5 | ≤ -0.5 | < 0.5 | ≥ 0.5 |
| `depGrowth` | Deposit growth YoY (absolute) | % | ≤ -3 | ≤ -1 | ≤ 0.5 | < 4 | ≥ 4 |
| `nibTrend` | Non-interest-bearing balances YoY | % | ≤ -5 | ≤ -2 | ≤ 0 | < 2 | ≥ 2 |
| `timeDepShare` | Time deposits share of deposits (CD wall proxy) | % | ≥ 35 | ≥ 25 | ≥ 18 | > 10 | ≤ 10 |
| `ldr` | Loan-to-deposit ratio | % | ≥ 95 | ≥ 90 | ≥ 85 | > 75 | ≤ 75 |
| `loanMinusDepGrowth` | Loan growth minus deposit growth YoY | pts | ≥ 3 | ≥ 1.5 | ≥ 0.5 | > -0.5 | ≤ -0.5 |
| `loanGrowthVsPeer` | Loan growth YoY vs peer median | pts | ≤ -2 | ≤ -1 | ≤ -0.5 | < 0.5 | ≥ 0.5 |
| `loanYieldVsPeer` | Loan yield vs peer median | bps | ≤ -40 | ≤ -20 | ≤ -10 | < 10 | ≥ 10 |
| `uninsuredShare` | Uninsured deposits share | % | ≥ 45 | ≥ 35 | ≥ 25 | > 15 | ≤ 15 |
| `wholesaleShare` | Borrowings + brokered deposits / total assets | % | ≥ 20 | ≥ 12 | ≥ 6 | > 3 | ≤ 3 |
| `aociToTce` | AOCI loss / tangible common equity | % | ≥ 20 | ≥ 10 | ≥ 5 | > 2 | ≤ 2 |
| `effVsPeer` | Efficiency ratio vs peer median | pts | ≥ 5 | ≥ 3 | ≥ 1 | > -1 | ≤ -1 |
| `depPerBranchVsPeer` | Deposits per branch vs peer median | % | ≤ -35 | ≤ -20 | ≤ -10 | < 10 | ≥ 10 |
| `svcChargesVsPeer` | Deposit service charges / deposits vs peer median | % | ≤ -30 | ≤ -15 | ≤ -5 | < 5 | ≥ 5 |
| `wealthFeeGrowth` | Wealth / trust fee growth YoY | % | ≤ 0 | ≤ 3 | ≤ 6 | < 12 | ≥ 12 |
| `wealthScale` | Wealth balances in scope (size of prize) | $B | ≥ 15 | ≥ 8 | ≥ 3 | > 1 | ≤ 1 |
| `sweepScale` | Cash sweep book (size of prize) | $B | ≥ 15 | ≥ 8 | ≥ 3 | > 1 | ≤ 1 |

Vs-peer metrics are the institution's value minus the benchmark median (K10) for banks, or the dashboard peer median where no benchmark exists (deposits per branch and service charges as a % difference). Input keys: `ibDepositCostPct`, `nimPct`, `nibSharePct`, `depositGrowthPct`, `loanGrowthPct`, `loanYieldPct`, `efficiencyPct`, `depositsPerBranchM`, `serviceChargesToDepositsBps`, each with a `peer…` array; absolute inputs `nibGrowthPct`, `timeDepositSharePct`, `ldrPct`, `uninsuredSharePct`, `wholesaleFundingPct`, `aociToTcePct`, `marginalFundingCostPct` with `bookDepositCostPct`, `wealthFeeGrowthPct`, `wealthBalancesB`, `sweepBookB`.

| Flag key | Meaning | Values → band score |
|---|---|---|
| `regulatoryIrrLiquidity` | IRR / liquidity regulatory signal | mra → 100 · referenced → 80 · general → 60 · none → 30 |
| `branchProgram` | Branch programme | announced → 100 · under_review → 80 · none → 30 |
| `newMarketEntry` | Entering markets with no deposit history | true → 100 · false → 30 |
| `cacPressure` | Acquisition cost pressure stated | true → 80 · false → 30 |
| `digitalPriority` | Digital programme is a stated priority | true → 80 · false → 30 |
| `attritionSignal` | Attrition / run-off called out | true → 80 · false → 30 |
| `maActivity` | M&A activity | announced_pending → 100 · integrating → 80 · signalled_appetite → 60 · completed_integrated → 40 · ruled_out → 10 · none → 10 |

**Benchmark cap.** If the product's **primary** (first-listed) need metric lands in the "better than peers" band, Need is capped at 40. This codifies the standing instruction from the build log: never pitch repair where the institution is already the benchmark.

#### K4.2 — Stated priority (0–100)

≥ 2 of the product's strategy tags evidenced → **100** · exactly 1 → **70** · none → **10**. V3's "adjacent theme = 40" step is removed because it was not reproducible.

| Tag family | Tags |
|---|---|
| Deposits | grow_retail_deposits, optimise_deposit_pricing, reduce_funding_costs, improve_NIM, compete_on_deposits, fund_loan_growth |
| Pricing advisory | pricing_strategy_refresh, NIM_recovery, CD_maturity_management |
| ALM | manage_IRR, ALM_improvement, liquidity_management, balance_sheet_optimisation, regulatory_compliance |
| Commercial | grow_commercial, treasury_management_fees, deepen_commercial_relationships, expand_business_banking |
| Lending | grow_loan_book, improve_loan_pricing, increase_mortgage_volume, small_business_lending_growth |
| Distribution | optimise_branch_network, right_size_distribution, post_MA_integration, improve_efficiency_ratio, market_expansion |
| Acquisition & digital | customer_acquisition, marketing_efficiency, digital_acquisition, improve_digital_engagement |
| Relationships | deepen_relationships, cross_sell_growth, primacy, customer_retention, member_retention |
| Wealth | grow_wealth_revenue, HNW_client_acquisition, deepen_wealth_relationships |
| M&A | post_merger_integration, deposit_harmonisation, acquisition_strategy |
| Other advisory | rebrand, repositioning, product_redesign, fee_optimisation |

#### K4.3 — Timing (0–100)

Best catalyst matching the product's timing themes: ≤ 6 months **100** · 7–12 **80** · 13–18 **60** · > 18 **30** · stated but undated **40** · none **20**.

Themes: `deposit_pricing`, `funding_gap`, `alm_regulatory`, `branch_program`, `new_market`, `ma_integration`, `commercial_growth`, `lending_growth`, `wealth_growth`, `digital_program`, `marketing_plan`, `product_redesign`.

#### K4.4 — Maturity (0–100)

Ideal tier **100** · in range, not ideal **75** · one tier below minimum **45** · above maximum **40** · two or more below minimum → hard gate (C1).

#### K4.5 — Feasibility (20–100)

- Advisory and Intelligent Data products: base **100** (light footprint)
- Other products: ideal tier **90** · in range or above range **70** · below minimum **40**
- Penalties (platform products only, i.e. not Advisory or Data): core conversion in flight **−25**; M&A integration in flight **−10**; Curinos One with customer data fragmented post-merger **−15**; Optimizer or Curinos One at an institution under 200 employees **−20**
- Any product: below its guide asset floor **−15**
- Bonuses (Section P): FIS IBS/HORIZON → Essentials **+15**; Databricks → Curinos One **+15**; Salesforce → Capture, Compound **+10**; deal-pricing tool → Commercial Analyzer/Optimizer, Commercial Data, TM Fee Analyzer **+10**; existing Curinos client → all **+10**
- Floor 20, cap 100

#### K4.6 — Readiness and Fit

`Readiness = 0.60 + 0.40 × (Maturity + Feasibility) / 200`
`Fit = round((0.70 × Need + 0.30 × Timing) × Readiness)`

### K5 — Priority table, caps and floors

| Step | Condition | Result |
|---|---|---|
| 1 | Any hard gate failed | **DNR** (reason = gate) |
| 2 | Fit ≥ 75 **and** Need ≥ 70 **and** Timing ≥ 60 | **P1** |
| 3 | Fit ≥ 60 | **P2** |
| 4 | Fit ≥ 50 | **P3** |
| 5 | Fit < 50 | **DNR** (reason = below floor) |
| 6 | Compound at P1 without LDR ≥ 90% and loans outgrowing deposits | → P2 |
| 7 | Roadmap, unlisted, or unconfirmed required input | → max P3 |
| 8 | Floors (C2) | Pricing Data ≥ P2 · Advisory Pricing ≥ P3 · Advisory T&BS ≥ P3 with ALCO |

The P3 floor rises from 40 (V3) to **50**. A P3 card still needs a full narrative, and the 40–49 band in V3 builds was almost entirely products the seller was told not to raise; they are clearer as DNR entries with a reason.

**No distribution quotas.** V3's "expected P1 counts" and "reclassify at least three" rules are withdrawn. If a spread looks wrong, the inputs are wrong: re-check `scoringInputs`, never the priorities.

### K6 — Worked example (generated by `score_v4.py` from the K2 inputs; fictional institution)

**Example Regional Bank B** — a fictional ~$30B multi-state commercial bank, Tier 2 maturity, with trust and brokerage businesses (every figure is a round illustrative value). NIM at the peer median; efficiency better than the peer median; LDR 88% with loans guided to outgrow deposits; management-stated marginal funding cost ~3.00% against a 1.80% book; a CD maturity wall, an ALCO funding plan and a treasury-management price event all due next quarter; a branch-consolidation programme under way; de novo branches in a new state within seven months; branch count unsourced; small-business deposit and SBA books unconfirmed.

| Product | Pri | Fit | Need | Timing | Maturity | Feas | Gate / cap |
|---|---|---|---|---|---|---|---|
| Advisory: Network Optimization | P1 | 89 | 84 | 100 | 100 | 100 |  |
| Retail Deposit Analyzer | P1 | 84 | 79 | 100 | 100 | 90 |  |
| Advisory: Market Playbook | P1 | 83 | 84 | 80 | 100 | 100 |  |
| Curinos One Capture | P1 | 79 | 93 | 80 | 75 | 70 |  |
| Advisory: Value Proposition | P1 | 78 | 77 | 80 | 100 | 100 |  |
| Pricing Data | P2 | 76 | 65 | 100 | 100 | 100 |  |
| Distribution Analyzer | P2 | 76 | 68 | 100 | 100 | 90 |  |
| Distribution Optimizer | P2 | 76 | 68 | 100 | 100 | 90 |  |
| Advisory: Pricing Strategy & Optimization | P2 | 76 | 65 | 100 | 100 | 100 |  |
| Deposit Optimizer Essentials | P2 | 74 | 65 | 100 | 100 | 90 |  |
| Curinos One Compound | P2 | 74 | 76 | 100 | 75 | 70 |  |
| Marketing Analyzer | P2 | 73 | 72 | 80 | 100 | 90 |  |
| Advisory: Treasury & Balance Sheet Management | P2 | 72 | 60 | 100 | 100 | 100 |  |
| Treasury Analyzer | P2 | 70 | 60 | 100 | 100 | 90 |  |
| Advisory: Marketing Investment Planning | P2 | 68 | 63 | 80 | 100 | 100 |  |
| Small Business Deposit Analyzer | P3 | 79 | 72 | 100 | 100 | 90 | Unknown ≠ absent: unconfirmed smallBusiness — capped at P3, gap stated |
| Curinos One Commit | P3 | 63 | 59 | 100 | 75 | 70 | Roadmap module (COMING SOON) — capped at P3, never presented as available |
| Commercial Data | P3 | 59 | 42 | 100 | 100 | 100 |  |
| Advisory: Commercial Strategy | P3 | 59 | 42 | 100 | 100 | 100 |  |
| Commercial Analyzer | P3 | 58 | 42 | 100 | 100 | 90 |  |
| Treasury Management Fee Analyzer | P3 | 58 | 42 | 100 | 100 | 90 |  |
| Curinos One Conserve | P3 | 55 | 45 | 100 | 75 | 70 | Roadmap module (COMING SOON) — capped at P3, never presented as available |
| Profitability Optimizer | DNR | 49 | 28 | 100 | 100 | 90 | Not listed on curinos.com — capped at P3 until Product confirms availability · Score 49 is below the 50 recommendation floor |
| Advisory: Product Design | DNR | 47 | 59 | 20 | 100 | 100 | Score 47 is below the 50 recommendation floor |
| Commercial Optimizer | DNR | 46 | 42 | 100 | 45 | 40 | Score 46 is below the 50 recommendation floor |
| Wealth Analyzer | DNR | 46 | 59 | 20 | 100 | 90 | Score 46 is below the 50 recommendation floor |
| LendersBenchmark Analyzer for Small Business Lending | DNR | 46 | 24 | 100 | 100 | 90 | Unknown ≠ absent: unconfirmed sbLending — capped at P3, gap stated · Score 46 is below the 50 recommendation floor |
| Curinos One Calibrate | DNR | 42 | 24 | 100 | 75 | 70 | Roadmap module (COMING SOON) — capped at P3, never presented as available · Score 42 is below the 50 recommendation floor |
| Digital Banking Analyzer | DNR | 37 | 45 | 20 | 100 | 90 | Score 37 is below the 50 recommendation floor |
| Wealth Optimizer | DNR | 36 | 59 | 20 | 45 | 40 | Score 36 is below the 50 recommendation floor |
| Advisory: M&A Support | DNR | 28 | 31 | 20 | 100 | 100 | Score 28 is below the 50 recommendation floor |
| Commercial Digital Analyzer | DNR | 27 | 42 | 20 | 45 | 40 | Not listed on curinos.com — capped at P3 until Product confirms availability · Score 27 is below the 50 recommendation floor |
| Wealth Cash Analyzer/Optimizer Suite | DNR | 22 | 24 | 20 | 100 | 90 | Unknown ≠ absent: unconfirmed cashSweep — capped at P3, gap stated · Score 22 is below the 50 recommendation floor |
| LendersBenchmark Analyzer | DNR | 22 | 24 | 20 | 100 | 90 | Score 22 is below the 50 recommendation floor |
| Lenders Optimizer | DNR | 18 | 24 | 20 | 45 | 40 | Not listed on curinos.com — capped at P3 until Product confirms availability · Score 18 is below the 50 recommendation floor |
| Retail Deposit Optimizer | DNR | – | – | – | – | – | Size: $30.0B is below the $50B floor |
| eBenchmarkers - Banking | DNR | – | – | – | – | – | Geography: eBenchmarkers - Banking is sold in UK; institution is US |

Spread: P1 5, P2 10, P3 7, DNR 15

**What the example demonstrates**
- **Gates**: Retail Deposit Optimizer fails the $50B floor; eBenchmarkers fails geography. Neither can be scored back in.
- **Readiness**: Curinos One modules carry Maturity 75 and Feasibility 70 at Tier 2 (Readiness 0.89), so Compound's Fit (74) lands just under the P1 line of 75 despite a Need of 76 — and the two-part trigger would hold it at P2 anyway, because LDR is 88%, below 90%. Capture, with a higher Need (93), clears P1 at Fit 79.
- **Unknown ≠ absent**: Small Business Deposit Analyzer computes to 79 but is capped at P3 because the small-business deposit book is unconfirmed; the card must say so.
- **Branch lower bound**: the distribution products pass the 50-branch gate on a sourced lower bound (`branchesMin`), not on a guessed count.
- **Timing**: Wealth Analyzer has real need (fee growth of 2.0%, $10B in scope) but no dated catalyst, so it falls below the P3 floor — a later conversation.
- **Floors**: Pricing Data's computed P2 stands; its floor would only bite if the score fell further.

### K7 — Scoring Curinos One (updated)
1. **Score modules and pillar products independently.** Both can be P1: one diagnoses, one acts. A high Compound score never suppresses a deposit optimizer.
2. **Need reflects an execution gap.** Compound's metrics are funding-gap metrics (LDR, loan-minus-deposit growth, NIB trend), Capture's are acquisition metrics (new-market entry, deposit growth, acquisition cost). A bank that only lacks benchmarks has an Analyzer need.
3. **Feasibility reflects data readiness.** Databricks and Salesforce raise it; fragmented post-merger customer data lowers it. The gap is the honest sales conversation, never a reason to inflate.
4. **Roadmap modules are capped at P3** and labelled — procurement will check.
5. **Amplero is retired** into Curinos One (Section S2).

### K8 — Limitations and calibration
- **Thresholds are V3's where V3 had them** (NIM, deposit cost, deposit growth, loan growth, efficiency) and new where V3 had none. They are starting points. Recalibrate after 20 V4 builds by comparing scored priorities with rep feedback; change the script and this section together.
- **Dashboard peer cohorts are small** (2–4 sourced peers) and a median of two is fragile, which is why v4.1 scores banks against the FDIC full-group benchmark (K10). The peer table remains the narrative comparison; credit unions and any metric the benchmark lacks still use it. Benchmarks are bank-level FDIC data while a holding company's own figures can differ (Wintrust-type multi-charter groups especially).
- **Wealth and sweep metrics measure size of prize, not pain.** Wealth franchises are opportunities more often than problems, and scoring them as pain systematically under-scored them.
- **Stated priorities can be aspirational.** That is why they carry 30% of Need, not more.
- **The score decides which products belong and in what order; the narrative is still written by Run A** from the signals and published facts in Sections CO–H.

### K9 — Open items for Product Marketing
1. **Unlisted products** — confirm live or retired: Profitability Optimizer, Lenders Optimizer, Commercial Digital Analyzer (Section S2).
2. **Curinos One commercial gates** — asset floor, maturity requirement and data prerequisites are still unpublished; the $10B floor remains PROVISIONAL.
3. **Proof-point conflicts** — 130% vs 133% and the two descriptions of the $1.6B client (Section CO). Ask Marketing to align the homepage with the launch release.
4. **Canadian availability** — curinos.com has a Canada page but most product pages are tagged USA only. Confirm which products are sold in Canada.
5. **Treasury Management Fee Analyzer asset floor** — $5B PROVISIONAL.

---

*End of Catalogue V4 — 26 September 2026*
*Sources: curinos.com sitemap and product, outcome, capability, partner and advisory pages, fetch-verified 2026-09-26; Curinos One launch release, 12 May 2026; Databricks Built-On release, 9 July 2026; FIS release, 5 August 2024; Zafin release, 23 October 2025; Bankrate release, 31 October 2024; Deposit Optimizer Essentials launch release, 18 October 2023.*
*Supersedes V3 (August 2026). Machine-readable twin: `score_v4.py` — change both together.*

### K10 — FDIC benchmark (v4.1)
`claude/bank-benchmark-<year>Q<q>.json` holds p10/p25/median/p75/p90 for nine metrics (`nim`, `roaa`, `eff`, `ibcost`, `nib`, `ldr`, `depg`, `loang`, `nibg`) across 133 US banks ($20B+ assets), derived from the FDIC financials API (`api.fdic.gov/banks/financials`, fields ASSET, DEP, NIMY, ROA, EEFFR, LNLSNET, DEPNIDOM, DEPIDOM and related), plus a `subset_20_50B` block. `score_v4.py` loads the newest `bank-benchmark-*.json` from the working directory (or beside the script) and uses its median as the peer value for the matching metric; `--no-benchmark` reverts to dashboard peers and `--benchmark path` forces a file. Credit unions never use it. Refresh quarterly after FDIC call-report data lands. The time-deposit share is not in the API response, so that metric still uses dashboard peers. The benchmark cap still applies: Need is held at 40 when the primary metric is better than the benchmark.
