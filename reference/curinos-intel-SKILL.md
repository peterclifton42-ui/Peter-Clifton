---
name: curinos-intel
description: >
  Curinos Sales Intelligence dashboard builder. Trigger on: "run intel on [bank]",
  "build a dashboard for [bank]", "research [bank] for Curinos", "create a dashboard",
  "profile [bank]". Researches a U.S. financial institution, builds a structured JSON
  file, then immediately runs python3 /mnt/project/build_v2.py to produce the final HTML
  dashboard. Do NOT write HTML manually. Do NOT use any file in /mnt/project/ as a
  template. The correct output has 8 tabs: Financial Overview, Organisation & People,
  Balance Sheet & Funding, Strategy & Health, Analytics & Technology, Peer Comparison,
  Product Fit & Playbook, Recent News. After Step 9 runs build_v2.py automatically --
  no second prompt needed.
---

# Curinos Intel Skill — Research & Data Gathering
**Version 2.0 — Updated March 2026 · Product scoring updated to Catalogue V4 / score_v4.py, 26 September 2026**

You are gathering structured intelligence on a financial institution for a Curinos sales team.
Your output is a **JSON file** saved to `/mnt/user-data/outputs/[institution-slug]-intel.json`.

Do NOT generate any HTML. Do NOT build the dashboard. That is build_v2.py's job.

**CRITICAL QUALITY STANDARD**: The dashboard must match the depth and richness of the best-in-class Curinos intelligence output. Every panel must have real researched content. Empty panels, placeholder text, or thin data are unacceptable — sellers use this in live client meetings.

---

## STEP 1 — Read Reference Files

Before doing anything else, read these files:
```
/mnt/project/CURINOS_PRODUCT_CATALOGUE_V4.md
/mnt/project/sales-metrics-guide.md
```
and confirm the scorer is present (it does the product scoring in STEP 5):
```
/mnt/project/score_v4.py
```

---

## STEP 2 — Classify the Institution

From CURINOS_PRODUCT_CATALOGUE_V4.md Section A, determine type, size_band, and opportunity_rating. Also record the Section A3 `type` code and `country` — STEP 5 needs them.

- HIGH: Active M&A < 12 months; ROAA > 20bps below peer avg; NIM > 30bps below peer avg; CEO/CFO turnover < 12 months
- MEDIUM: Performance within 10-20bps of medians; digital investment underway; organic growth mode
- LOW: Top-quartile all metrics; stable leadership 3+ years; no M&A or regulatory issues

---

## STEP 3 — Research (minimum 16 searches)

**A -> basic{}, structure{}, demo{}**
- `[Institution] FDIC certificate headquarters CEO CFO founded employees`
- `[Institution] legal entity parent holding company subsidiaries regulators`

**B -> metrics[], finOverview{}, charts{}**
- `[Institution] Q4 2025 earnings total assets deposits NIM net interest income`
- `[Institution] CET1 efficiency ratio ROAA deposit cost loan-to-deposit 2025`
- `[Institution] annual report 2025 revenue NII non-interest income balance sheet history`
- `[Institution] NII guidance 2026 deposit cost outlook CFO ALCO earnings call`

**C -> news.analystRatings[], news.keyThemes[], news.earningsQA[]**
- `[Institution] analyst rating price target 2025 2026 buy overweight outperform`
- `[Institution] earnings call transcript Q4 2025 CFO guidance NIM deposit cost analyst Q&A`
- `[Institution] analyst themes efficiency ratio NIM ROAA investor concerns 2026`

**D -> contacts.execs[] (REQUIRED — not optional)**
- `[Institution] CEO CFO president executive team leadership 2025 2026`
- `[Institution] chief banking officer chief digital officer chief risk officer`

**E -> news.items[], news.articles[], strategy**
- `[Institution] strategy acquisitions M&A CEO priorities 2025 2026`
- `[Institution] news press releases Q4 2025 Q1 2026`
- `[Institution] press coverage recent news January February 2026`

**F -> decisionIntelligence[], techPlatforms[], maturity{}**
- `[Institution] digital banking technology platform analytics vendor fintech partnerships`
- `[Institution] core banking system data analytics mobile app technology investment`

**G -> loans{}, funding{}**
- `[Institution] loan portfolio mix commercial consumer mortgage deposit funding composition 2025`

---

## STEP 4 — Build 8 Metric Cards

Bank: Total Assets | Total Deposits | NIM | ROAA | CET1 Ratio | Efficiency Ratio | Deposit Cost | Loan-to-Deposit Ratio
Credit Union: Total Assets | Total Shares & Deposits | Net Worth Ratio | ROAA | Loan-to-Share Ratio | Share Cost | Efficiency Ratio | Member Count

Each card MUST include src[] array with 1-2 verified source URLs:
```json
{
  "l": "Total Assets", "v": "$3.00T", "s": "Q4 2025", "tr": "3.1% YoY", "tu": true,
  "t": {
    "m": "Full explanation with context",
    "sa": "Sales angle — Curinos opportunity",
    "o": "high",
    "p": ["Retail Deposit Optimizer"],
    "cite": "Example Mega Bank Q4 2025 Earnings Release",
    "src": [
      {"n": "Example Mega Bank Q4 2025 Earnings", "u": "https://investor.examplemegabank.com/press-releases"}
    ]
  }
}
```

---

## STEP 5 — Score Products (Catalogue V4, Section K) — BY SCRIPT, NEVER BY HAND

**You do not type fit scores, priorities or DNR decisions.** You gather evidence into `scoringInputs`, run `score_v4.py`, and write narrative for what it recommends. A September 2026 audit found shipped fit scores sitting 2–22 points off the V3 formula they claimed to use; V4 exists to stop that.

**5a. Assign the maturity tier first** (STEP 6 — do STEP 6 before 5b). `scoringInputs.tier` is the integer tier from `maturity.overall`.

**5b. Write `scoringInputs`** at the top level of the intel JSON, exactly as specified in Catalogue V4 Section K2:
- `country`, `type` (A3 code), `assetsB`, `tier`, `branches` or `branchesMin` + `branchesEvidence`
- `segments{}` — `true` only on evidence, `false` only on evidence of absence, otherwise `null`
- `metrics{}` — institution values plus `peer…` arrays built from the Peer Comparison cohort (same quarter, like-for-like measures only; the scorer ignores a vs-peer metric with fewer than two peers — never pad the array)
- `flags{}`, `guidance{}`, `statedPriorities[]` (K4.2 tags, each evidenced in `strategyPillars[]` or earnings commentary), `catalysts[]` (dated decision points; `monthsOut` from today), `techStack{}`, `ownedProducts[]`
- Every value must trace to a source already in `sources[]` or a metric card. No estimates, no defaults typed in to make a product pass.

**5c. Save the JSON** (STEP 9 path), then run:
```bash
python3 /mnt/project/score_v4.py /mnt/user-data/outputs/[slug]-intel.json --write
```
The script prints the scored table, writes `products[]` (fit, pri, priority, `scoring{}` with `modelVersion: "V4"`), writes `dnrProducts[]` with mechanical reasons, removes retired products, and sets `productScoringNote`. It preserves any narrative already on a product.

**5d. Write narrative** (`what`, `why`, `need`, `roi`, `time`, `talk`, `use[]`, `objections[]`, `contacts`) for every product the scorer listed under **NEEDS NARRATIVE**, using the Signals and Published facts in Catalogue V4 Sections CO–H. Exit code 2 means narrative is missing — the build must not proceed until it is written. Re-run 5c after writing (it is idempotent) and confirm exit code 0.

**5e. Card rules the scorer cannot write for you:**
- `caps` mentions **unknown ≠ absent** → the `need` text must state what is unconfirmed
- `caps` mentions **benchmark cap** → frame as extending an advantage; add a `salesPlaybook.landmines` entry barring the repair pitch
- `roadmap: true` → never "available"; always "on the Curinos One roadmap"
- `availabilityUnconfirmed: true` → no pricing, timeline or client claims; say availability is to be confirmed
- A DNR reason may be extended in plain English after the mechanical reason, never replaced

**If a score looks wrong, the evidence is wrong.** Fix `scoringInputs` and re-run. Never edit `fit`, `pri` or `scoring` by hand, and never move a product between `products[]` and `dnrProducts[]` by hand.

---

## STEP 6 — Assess Data Maturity

6 dimensions (1-4 scale): Technology Infrastructure | Talent & Org | Vendor & Partnerships | Product Sophistication | Regulatory Signals | Earnings Call Language

Each dimension: title, score, summary, evidence[] (icon +/!/=, text, cite), implication
Overall avg: Tier 1 (1.0-1.9) | Tier 2 (2.0-2.9) | Tier 3 (3.0-3.5) | Tier 4 (3.6-4.0)

---

## STEP 7 — Build Peer Cohort

5 rows (target first). Each row: n, a, br, st, cet1, roaa, nim, eff, dep_cost
Peers dict key = descriptive group name string (e.g. "mega_banks", "super_regionals")
nimTrend: {labels:[], target:[], peers:{"Peer Name": []}} — 8 quarters minimum

---

## STEP 8 — Write the JSON

### REQUIRED SCHEMA SUMMARY

**Basic sections** (same as before): meta, basic, structure, demo, contacts, siloAssessment, metrics, strategy, strategyIntro, salesTiming[], finOverview, charts, healthRating, healthColour, healthNote, swot, curinosAngle, maturity, productSequencing, decisionIntelligence[], techPlatforms[], capabilityGaps, peers, nimTrend, loans, funding, products[], productFitIntro, productFitIntroBody, productSectionSubtitles, salesPlaybook, sources[], **scoringInputs** (Catalogue V4 Section K2 — required), dnrProducts[] (written by score_v4.py)

**Key schema constraints:**
- `meta.slug`: lowercase-hyphenated, matches filename
- `peers`: DICT with group key (NOT array) — target institution first
- `nimTrend`: `{labels:[], target:[], peers:{"Name":[]}}`
- `loans.mix[]` NOT `loans.items[]`
- `productSectionSubtitles`: keys p1/p2/p3 (NOT priority1/2/3)
- `products[].pri`: MUST be INTEGER 1, 2, or 3 — NEVER the string "p1"/"p2"/"p3". `pri:"p1"` causes `ReferenceError: p1 is not defined` and a blank dashboard.
- `products[].need`: MUST be a descriptive STRING — the "Why [Bank] Needs This" paragraph rendered in the product card. NEVER store a numeric score here. The numeric Need score belongs only inside `scoring.need`, written by score_v4.py.
- `scoringInputs`: object per Catalogue V4 K2. Unknowns are `null`, never guesses.
- `curinosAngle`: `{title:"...", body:"..."}` object (NOT a string)
- `capabilityGaps`: `{intro:"...", strengths:[], gaps:[], opportunities:[], salesNote:"..."}`
- `productSequencing`: array of `{tier:"...", products:"...", active:bool, note:"..."}`
- `salesTiming[]`: array of `{label:"...", colour:"...", body:"..."}` (used in Strategy tab)

---

### decisionIntelligence[] — FLAT SIGNAL FORMAT (v2.0)

Use the flat `signal / implication / action` format. Minimum 4–6 signals.

```json
"decisionIntelligence": [
  {
    "signal": "Brief signal headline (what Curinos seller can observe)",
    "implication": "What this means for the institution and the sales conversation",
    "action": "Specific next step the seller should take with this signal",
    "source": "Optional: source label",
    "url": "Optional: source URL"
  }
]
```
build_v2.py auto-detects this format. Each signal should connect to a specific Curinos product.

---

### maturityProfile{} _(optional — populates Maturity & Liquidity tab)_

```json
"maturityProfile": {
  "buckets": [
    {"label": "< 3 Months", "value": "~$990B", "pct": "~30%", "colour": "#f87171", "signal": "High IRR sensitivity"},
    {"label": "3-12 Months", "value": "~$660B", "pct": "~20%", "colour": "#fbbf24", "signal": ""},
    {"label": "1-3 Years",   "value": "~$990B", "pct": "~30%", "colour": "#22c55e", "signal": "Core stable funding"},
    {"label": "> 3 Years",   "value": "~$660B", "pct": "~20%", "colour": "#60a5fa", "signal": "Long-dated"}
  ],
  "salesAngle": "Why this maturity profile creates Treasury Analyzer urgency"
}
```

### liquidity{} _(optional — populates Liquidity KPIs panel)_

```json
"liquidity": {
  "kpis": [
    {"label": "LCR", "value": "115%", "colour": "#22c55e", "note": "Well above 100% minimum"},
    {"label": "Global Liquidity Sources", "value": "$900B", "colour": "#60a5fa", "note": "Cash + unencumbered securities"},
    {"label": "NSFR", "value": ">100%", "colour": "#22c55e", "note": "Stable funding compliant"}
  ],
  "salesNote": "How liquidity position creates Curinos urgency"
}
```

---

### NEWS SECTION — FULL SCHEMA (v2.0)

This is the richest section. ALL sub-fields render on the Recent News tab.

```json
"news": {
  "headline": "Latest News — [Institution Name]",
  "intro": "Brief intro for the news tab",
  "currentPrice": "~$46",
  "consensusNote": "Analyst data is indicative. Verify on Bloomberg/FactSet before meetings.",

  "items": [
    {
      "title": "Headline of news item",
      "body": "2-3 sentence summary",
      "date": "January 14, 2026",
      "source": "Institution IR / Bloomberg",
      "url": "https://investor.[institution].com/press-releases",
      "colour": "green",
      "tag": "earnings",
      "salesAngle": "How this creates a Curinos opportunity",
      "quote": "Optional executive quote",
      "quoteAttrib": "CEO Name, Earnings Call Q4 2025"
    }
  ],

  "analystRatings": [
    {
      "firm": "Example Securities",
      "analyst": "Analyst Name",
      "rating": "Overweight",
      "target": "$52",
      "direction": "up",
      "note": "2-3 sentence analyst commentary",
      "date": "Jan 2026",
      "url": "https://investor.[institution].com/press-releases"
    }
  ],

  "keyThemes": [
    {
      "theme": "Deposit Beta & NII Recovery",
      "colour": "#ef4444",
      "icon": "🎯",
      "urgency": "CRITICAL",
      "detail": "Why this is an analyst focus area — 2-3 sentences",
      "salesAngle": "How this theme creates a Curinos sales opportunity",
      "source": "Q4 2025 Earnings Call Q&A",
      "url": "https://investor.[institution].com/press-releases"
    }
  ],

  "earningsQA": [
    {
      "question": "Full text of analyst question from earnings call",
      "analyst": "Analyst Name, Firm Name",
      "answer": "Management response — paraphrase with attribution",
      "salesAngle": "Why this Q&A is relevant to Curinos sellers",
      "source": "Q4 2025 Earnings Call Transcript",
      "url": "https://investor.[institution].com/press-releases"
    }
  ],

  "articles": [
    {
      "date": "Jan 16, 2026",
      "src": "Institution IR",
      "tag": "tag-earn",
      "tagLabel": "Earnings",
      "hl": "Headline of press coverage item",
      "sum": "2-3 sentence summary",
      "url": "https://investor.[institution].com/press-releases"
    }
  ],

  "salesTiming": {
    "intro": "Context for sales timing windows",
    "windows": [
      {
        "label": "NOW — Q1 2026",
        "colour": "#ef4444",
        "body": "What is happening now that creates urgency",
        "action": "Specific engagement action this week"
      },
      {
        "label": "NEAR — Q2-Q3 2026",
        "colour": "#fbbf24",
        "body": "Opportunities forming in the next 3-6 months",
        "action": "Specific action before budget cycles close"
      },
      {
        "label": "HORIZON — H2 2026+",
        "colour": "#3b82f6",
        "body": "Longer-term strategic opportunities",
        "action": "Specific relationship-building action"
      }
    ]
  }
}
```

**news.items[] colour values**: green (earnings) | blue (strategy) | amber (risk) | red (negative) | purple (digital)
**news.items[] tag values**: "earnings" | "strategy" | "digital" | "partnership" | "risk"
**articles[] tag values**: "tag-earn" | "tag-strat" | "tag-dig" | "tag-risk" | "tag-pship"
**analystRatings[] direction**: "up" (raised ▲) | "down" (cut ▼) | "hold" (maintained —)

---

## NEWS TAB MINIMUM REQUIREMENTS

Every dashboard MUST include:
1. Minimum 4 news items (with salesAngle on at least 2)
2. Minimum 4 analyst ratings (with direction + url on each)
3. Minimum 2 analyst key themes (with urgency + salesAngle)
4. Minimum 2 earnings call Q&A exchanges (with analyst attribution + salesAngle)
5. Minimum 3 press coverage articles (articles[]) with clickable source URLs
6. 3-window sales timing grid (windows[])

---

## STEP 9 — Save JSON and Build Dashboard

### Save JSON
```python
import json
slug = data['meta']['slug']
outpath = f"/mnt/user-data/outputs/{slug}-intel.json"
with open(outpath, 'w') as f:
    json.dump(data, f, indent=2)
print(f"Saved: {outpath}")
```

### Build
```bash
python3 /mnt/project/build.py
```

### Community Bank Chart Patch (assets < $5B ONLY)
```python
slug = data['meta']['slug']
outfile = f'/mnt/user-data/outputs/{slug}-curinos-dashboard.html'
with open(outfile) as f:
    html = f.read()
html = html.replace('label:"Total Assets ($B)"', 'label:"Total Assets ($M)"')
html = html.replace('label:"Total Loans ($B)"', 'label:"Total Loans ($M)"')
html = html.replace('label:"Total Deposits ($B)"', 'label:"Total Deposits ($M)"')
html = html.replace('label:"Net Interest Income ($B)"', 'label:"Net Interest Income ($M)"')
html = html.replace('label:"Non-Interest Income ($B)"', 'label:"Non-Interest Income ($M)"')
html = html.replace('c.dataset.label+": $"+c.parsed.y+"B"', 'c.dataset.label+": $"+(c.parsed.y*1000).toFixed(1)+"M"')
html = html.replace('return"$"+v+"B"', 'return"$"+(v*1000).toFixed(0)+"M"')
with open(outfile, 'w') as f:
    f.write(html)
print('Chart labels patched: $B -> $M')
```

### Community Bank ROI Patch (assets < $5B ONLY)
```python
import json, re as _re
with open(f'/mnt/user-data/outputs/{slug}-intel.json') as f:
    _d = json.load(f)
_dep_str = next((m['v'] for m in _d.get('metrics', []) if 'Deposit' in m['l'] and 'Total' in m['l']), None)
if _dep_str:
    _m = _re.search(r'\$([\d.]+)(M|B)', _dep_str.replace(',', ''))
    deposits_b = float(_m.group(1)) / 1000 if _m and _m.group(2) == 'M' else float(_m.group(1)) if _m else 0.5
else:
    deposits_b = 0.5
with open(outfile) as f:
    html = f.read()
html = html.replace('type="range" id="pp-calc-deposits" min="1" max="2000" value="${D.loans&&D.loans.totalLoansB?Math.round(D.loans.totalLoansB*1.3):50}" step="1"', f'type="range" id="pp-calc-deposits" min="0.05" max="2" value="{deposits_b}" step="0.01"')
html = html.replace('<span style="font-size:10px;color:#475569">$1B</span><span id="pp-dep-display"', '<span style="font-size:10px;color:#475569">$50M</span><span id="pp-dep-display"')
html = html.replace('</span><span style="font-size:10px;color:#475569">$2,000B</span>', '</span><span style="font-size:10px;color:#475569">$2B</span>')
html = html.replace('if(depDisplay)depDisplay.textContent="$"+deps+"B";', 'if(depDisplay)depDisplay.textContent=deps<1?"$"+(deps*1000).toFixed(0)+"M":"$"+deps.toFixed(2)+"B";')
html = html.replace('if(noteEl)noteEl.textContent="Based on $"+deps+"B deposit base, "+bps+"bps improvement, $"+contract+"M contract.";', 'if(noteEl)noteEl.textContent="Based on "+(deps<1?"$"+(deps*1000).toFixed(0)+"M":"$"+deps.toFixed(2)+"B")+" deposit base, "+bps+"bps improvement, $"+contract+"M contract.";')
html = html.replace('Deposit Base ($B)', 'Deposit Base')
with open(outfile, 'w') as f:
    f.write(html)
print(f'ROI calculator patched: default ${deposits_b*1000:.0f}M')
```

```bash
python3 /mnt/project/validate_updated.py
```

**Do not write HTML. Do not modify scripts. Just run them.**

If build.py succeeds, call `present_files` with the output path, then show:
```
Dashboard: [slug]-curinos-dashboard.html
[Institution] — [Type] — [Size Band]
Opportunity: [HIGH/MEDIUM/LOW] — [one sentence rationale]
Top P1 products: [list]
Key trigger: [one sentence]
```


## NEW FIELDS (v2.1)

⚠️ The `src[]` array enables clickable source links in metric tooltips. Always include 1-2 verified URLs per metric.
⚠️ `tr` (trend) must include the arrow: `"▲ 3.1% YoY"` or `"▼ 180bps YoY (improving)"`. `tu` = true means positive/upward trend (green), false = red.

**finOverview fields that drive key panels** (all must be populated):
- `salesTheme` — short headline for the Primary Sales Theme banner (e.g. `"⚡ PRIMARY SALES THEME: NII Recovery = Analytics Window"`)
- `salesThemeBody` — 2-3 sentence body for the Primary Sales Theme banner
- `analystConsensus.mgmtGuidance` — SHORT value like `"+5–7%"` (renders as large KPI display)
- `analystConsensus.streetConsensus` — SHORT value like `"+4–6%"` (renders as large KPI display)
- `analystConsensus.mgmtLabel` — label below mgmt guidance (e.g. `"NII FY2026 · CFO Reed"`)
- `analystConsensus.streetLabel` — label below street consensus (e.g. `"Analysts sit 1–2pts below mgmt"`)
- `analystConsensus.confidenceNote` — why the gap exists + urgency
- `analystConsensus.confidenceLevel` — `"AMBER"` | `"GREEN"` | `"RED"`
- `analystConsensus.salesRead` — what this means for Curinos sellers
- `analystConsensus.stockBadge{}` — `{label, value, ticker, vsValue, vsLabel, sub}` — stock performance card
- `analystConsensus.capitalBadge{}` — `{label, value, sub, signal}` — capital return card
- `analystConsensus.src[]` — `[{n: "Name", u: "URL"}]` — clickable sources for the tooltip
- `feeIncome.intro` — brief intro paragraph shown above fee items
- `feeIncome.items[].note` — contextual note per fee line
- `feeIncome.items[].product` — Curinos product mapped to this fee stream
- `feeIncome.items[].angle` — sales angle for this specific fee line
## NEW FIELDS (v2.2) — Silo Assessment Rich Format

```json
"siloAssessment": {
  "integration": "partial",
  "verdict": "Short headline of integration verdict",
  "intro": "1-2 sentence description shown in the verdict badge",
  "integrationSignals": [
    {"signal": "Evidence of cross-segment integration...", "src": "FDIC Resolution Plan 2025"}
  ],
  "siloSignals": [
    {"signal": "Evidence of fragmentation / siloed analytics...", "src": "Example Mega Bank 10-K FY2024"}
  ],
  "salesImplications": [
    {"label": "Multi-entry required", "body": "How the silo structure requires multi-thread sales approach"},
    {"label": "Opportunity in the seams", "body": "Where Curinos sits as a neutral intelligence layer"},
    {"label": "Key integration moment", "body": "Who has enterprise-wide authority and why now is the window"}
  ],
  "siloSrc": [
    {"n": "FDIC BankFind / Resolution Plan", "u": "https://banks.data.fdic.gov/bankfind-suite/bankfind"},
    {"n": "Institution 10-K — Segment Reporting", "u": "https://investor.examplemegabank.com/annual-reports-and-proxy-statements"}
  ]
}
```
⚠️ `integrationSignals[]` and `siloSignals[]` drive the 2-column evidence grid.
⚠️ `salesImplications[]` drives the detailed sales implications callout panel.
⚠️ Minimum 3-5 signals per side for a credible evidence grid.

---

## PRODUCT SCORING DISCIPLINE (V4 — replaces the V3 quota rules)

The V3 rules in this section — expected P1/P2/P3 counts, "reclassify at least three if all score above 80", and the hand-scored variation examples — are **withdrawn**. They existed because the V3 model compressed scores into 75–95 and quotas were the only lever. Under V4 the spread comes from the evidence:

1. **No quotas.** Do not reshape a distribution. If it looks wrong, re-check `scoringInputs` (a missing peer array, a segment set `true` without evidence, a catalyst with the wrong `monthsOut`).
2. **Gates are absolute.** A gated product (size, geography, type, segment, branch, maturity floor) is DNR and cannot be argued back in. Examples: Deposit Optimizer Essentials at a bank of $50B+; Retail Deposit Optimizer below $50B (credit unions: $30B); eBenchmarkers – Banking at any non-UK institution; Distribution products below the branch gate.
3. **Retired products never appear** — not in `products[]`, not in `dnrProducts[]`: Amplero Personalization Optimizer (now Curinos One) and Treasury Strategies.
4. **Unlisted products** (Profitability Optimizer, Lenders Optimizer, Commercial Digital Analyzer) can be recommended at P3 at most, labelled "availability unconfirmed".
5. **Unknown ≠ absent.** An unconfirmed required segment or branch count caps a product at P3 and the gap is stated; it is not a DNR and it is not a pass.
6. **Benchmark institutions are scored down automatically** when they lead peers on a product's primary need metric.
7. **Compound P1** requires LDR ≥ 90% AND loans outgrowing deposits — the script enforces it.

```json
"dnrProducts": [
  {"name": "Retail Deposit Optimizer", "reason": "Size: $30.0B is below the $50B floor"},
  {"name": "eBenchmarkers - Banking", "reason": "Geography: eBenchmarkers - Banking is sold in UK; institution is US"}
]
```
(written by `score_v4.py`; you may append a plain-English sentence after the mechanical reason)

### Scoring checks before building
1. ✓ `scoringInputs` present and every non-null value traceable to a cited source
2. ✓ `score_v4.py --write` last exit code was 0 (no NEEDS NARRATIVE)
3. ✓ Every product in `products[]` has `scoring.modelVersion == "V4"` (build_v2.py warns otherwise)
4. ✓ No product name from Catalogue Section S2 "retired" appears anywhere in the JSON
5. ✓ Card text honours the STEP 5e rules for caps, roadmap and unconfirmed products

## NEW FIELDS (v2.3) — Strategy Pillars + Peers Summary

### strategyPillars[] (required for Strategy & Health tab)
Replaces the free-text `strategy` string for rendering numbered Strategy 1/2/3 panels.

```json
"strategyPillars": [
  {
    "title": "NII Recovery — The $50B Annual Franchise",
    "body": "2-4 sentence explanation of this strategy pillar and why it matters to Curinos sellers.",
    "colour": "#34d399",
    "curinosLink": "Retail Deposit Optimizer + Treasury Analyzer"
  },
  {
    "title": "Wealth Franchise Growth",
    "body": "...",
    "colour": "#a78bfa",
    "curinosLink": "Wealth Analyzer + Wealth Optimizer"
  }
]
```
⚠️ Minimum 3-5 pillars. Each maps to Curinos products via `curinosLink`.
⚠️ Without `strategyPillars[]`, the strategy tab renders as a single plain text block.

### peers.summary (required for Peer Comparison tab Leads/Watch section)
```json
"peers": {
  "mega_banks": [...],
  "summary": {
    "leads": [
      "Digital banking engagement — top-rated for 3 consecutive years",
      "Wealth franchise scale — $4.0T client balances"
    ],
    "watch": [
      "NIM gap vs. top peers — 1.90% vs 2.70%",
      "AOCI drag constraining tangible book value"
    ]
  }
}
```
⚠️ Minimum 3-5 items in each list for the panel to be useful.

### Tab layout changes (v2.3)
- **Analytics & Technology tab**: First section is now `at-angle` = curinosAngle (The Data Gap No Internal Team Can Close)
- **Strategy & Health tab**: Numbered panels come from `strategyPillars[]`, NOT from `curinosAngle`
- **Organisation & People tab**: Order is Bank Profile → Executive Leadership → Corporate Structure → Silo Assessment

---

## CRITICAL SCHEMA FIXES (v2.4) — Read This Before Writing Any JSON

These are the exact field names that build.py requires. Getting these wrong causes blank panels. There is NO fallback or tolerance — wrong keys = empty dashboard panels.

---

### ⚠️ FIELD NAME CONTRACTS — EXACT KEYS REQUIRED

#### `basic{}` — EXACT keys (not arbitrary names)
```json
"basic": {
  "name": "Full institution name",
  "legal": "Legal registered name (often same as name)",
  "ticker": "NYSE: XXX or N/A (Private)",
  "fdic": "FDIC certificate number",
  "parent": "Holding company name or 'None — Independent'",
  "rssd": "RSSD ID from FDIC",
  "hq": "City, ST",
  "est": "Month Day, YYYY",
  "ceo": "Full Name (Title)",
  "cfo": "Full Name or 'Not publicly disclosed'",
  "employees": "52",
  "website": "https://www.example.com"
}
```
⛔ DO NOT use: `headquarters`, `founded`, `description` — build.py will crash on KeyError.

#### `structure{}` — EXACT nested format
```json
"structure": {
  "parent": {
    "name": "Holding company or 'None — Independent Community Bank'",
    "type": "Bank Holding Company or N/A",
    "regulator": "Fed / OCC / FDIC",
    "nasdaq": "Ticker or N/A",
    "rssd": "RSSD ID"
  },
  "bank": {
    "name": "Bank legal name",
    "type": "State-chartered commercial bank",
    "fdic": "Certificate number",
    "regulator": "FDIC / OCC",
    "charter": "Full charter description"
  },
  "intermediate": null,
  "subs": [],
  "regulators": ["FDIC"]
}
```
⛔ DO NOT use a flat string for `parent` or `bank` — build.py treats them as dicts.

#### `demo{}` — EXACT flat fields
```json
"demo": {
  "assets": "$520.6M",
  "branches": "5 full-service branches",
  "states": "the state",
  "atms": "4 ATM locations",
  "markets": ["Riverton, ST", "Lakeview, ST"],
  "employees": "52",
  "rank": "Largest independent bank in the region",
  "fortune": "N/A (Private)",
  "segments": ["Commercial Lending", "Agricultural Lending"],
  "digital": "Online banking, mobile app, online account opening"
}
```

#### `meta{}` — MUST include all 6 fields
```json
"meta": {
  "slug": "institution-name-slug",
  "institution": "Full Name",
  "type": "Community Bank",
  "size_band": "Micro",
  "opportunity_rating": "MEDIUM",
  "opportunity_rationale": "One sentence",
  "generated": "2026-03-10",
  "latestQuarter": "Q4 2025",
  "opportunity": "MEDIUM",
  "sizeBand": "Micro"
}
```
⛔ `latestQuarter`, `opportunity`, `sizeBand` are REQUIRED by build.py (separate from opportunity_rating/size_band).

---

### ⚠️ CHARTS — EXACT keys for Financial Overview charts

The `charts` object MUST use the nested `balanceSheet{}` and `revenue{}` structure below. Flat top-level arrays will silently produce empty charts with no error message.

**✅ CORRECT — nested structure (charts render):**
```json
"charts": {
  "balanceSheet": {
    "labels": ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024", "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"],
    "assets":   [9200, 9400, 9600, 9700, 9700, 9750, 9800, 9900],
    "loans":    [7000, 7100, 7200, 7300, 7200, 7300, 7500, 7500],
    "deposits": [7400, 7500, 7500, 7500, 7600, 7800, 7800, 7650]
  },
  "revenue": {
    "labels": ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024", "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"],
    "nii":   [83, 85, 87, 88, 88, 96, 100, 101],
    "nonii": [13, 14, 15, 14, 15, 16, 16, 16]
  }
}
```

**⛔ WRONG — flat arrays at top level (charts silently blank):**
```json
"charts": {
  "quarters": ["Q1 2024", ...],
  "assets": [9200, ...],
  "loans": [7000, ...],
  "deposits": [7400, ...],
  "nii": [83, ...],
  "nonii": [13, ...]
}
```
This is the most common chart failure mode. The build script reads `charts.balanceSheet.assets` — if you write `charts.assets` directly, the arrays are silently ignored and both charts render blank lines.

**Labels:** Use quarterly strings (`"Q1 2024"`) for banks that report quarterly, or annual strings (`"2020"`) for annual-only data. Both formats work. Must be strings, not integers.

**Values — $B vs $M scale:**
- Large banks (assets > $5B): store in `$M` integers (e.g. `9200` = $9.2B). The shell auto-detects values ≥ 2 as `$M`.
- Community banks (assets < $5B): also store in `$M` (e.g. `550` = $550M). Same auto-detect.
- If you store in `$B` decimals (e.g. `9.2`), the auto-detect treats values < 2 as `$B` — only use this for mega banks where all values remain below 2.
- The validator "CHART SCALE WARNING" is expected and not an error for `$M` values.

**Minimum data points:** 6 quarters minimum; 8 quarters preferred. If exact figures unavailable, use FDIC call report trend data.

⛔ DO NOT use: `assetHistory`, `nimHistory`, `revenueBreakdown` — these are WRONG keys.
⛔ Labels must be strings.
⛔ The `balanceSheet` and `revenue` sub-objects are both required — omitting either produces a blank chart.

---

### ⚠️ FUNDING — `items[]` not `mix[]`

```json
"funding": {
  "totalDepositsB": 0.463,
  "salesNote": "Why deposit mix creates Curinos opportunity",
  "items": [
    {
      "label": "Core Demand / Checking",
      "value": "$162M",
      "pct": 35,
      "colour": "#3b82f6",
      "note": "Strong non-interest-bearing commercial accounts"
    }
  ]
}
```
⛔ DO NOT use `mix[]` in `funding{}` — build.py reads `funding.items[]`.
✅ `loans.mix[]` is CORRECT for the loan portfolio breakdown.
✅ `funding.totalDepositsB` is required for the ROI calculator to scale correctly.

---

### ⚠️ PRODUCTS — ALL expansion fields required

Every product object MUST include these fields or the expanded panel will be blank:

```json
{
  "name": "Deposit Optimizer Essentials",
  "priority": "P1",
  "pri": 1,
  "fit": 82,
  "cat": "Deposit Analytics",
  "what": "2-3 sentences: what the product does, what data it uses, how it works",
  "why": "2-3 sentences: why it matters specifically to THIS institution now",
  "need": "2-3 sentence descriptive text explaining why THIS institution needs this product — rendered as the 'Why [Bank] Needs This' section. MUST be a STRING, never a number. Do NOT store the numeric NeedFit score here.",
  "roi": "$230K–$370K annually (5–8bps on $462M deposits)",
  "time": "30–60 days to first insights",
  "talk": "One-sentence talk track for the sales conversation",
  "use": [
    "Specific use case 1 relevant to this institution",
    "Specific use case 2 relevant to this institution"
  ],
  "objections": [
    {"q": "We don't have the analytics team to use this", "a": "No analytics team required — delivered as a weekly report"},
    {"q": "We already know our market", "a": "You know your market — we know all [N]+ institutions. Here's what you're missing."}
  ],
  "signals": ["Signal 1", "Signal 2"],
  "url": "https://curinos.com/"
}
```
⚙️ `fit`, `pri`, `priority`, `cat`, `url` and the `scoring{}` block are written by `score_v4.py` (STEP 5) — write the narrative fields only. `fitBreakdown` is a V3 field and is no longer used.
🚨 `pri` MUST be INTEGER 1, 2, or 3 — NEVER the string "p1"/"p2"/"p3". Writing `"pri": "p1"` causes `ReferenceError: p1 is not defined` and a completely blank dashboard. CORRECT: `"pri": 1`. WRONG: `"pri": "p1"`.
⛔ Missing `pri` (numeric) → products will not sort into P1/P2/P3.
⛔ Missing `what`, `need`, `roi`, `time`, `talk` → expanded product panel is blank.
⛔ Missing `objections[]` → objection handler section blank.
⛔ `priority` (string "P1") is an optional human-readable label only — `pri` (integer 1/2/3) is the required machine-readable field that drives rendering.

---

### ⚠️ SALES PLAYBOOK — Full structure required

```json
"salesPlaybook": {
  "intro": "2-3 sentence framing of the overall sales approach for this institution",
  "actionPlan": [
    {"period": "Week 1–2", "body": "Specific action: send outreach with sample Pricing Data report showing Example Community Bank's rates vs 9 Riverton competitors"},
    {"period": "Month 1", "body": "Specific action: schedule ALCO presentation with President Hale"},
    {"period": "Month 2–3", "body": "Specific action: demo Deposit Optimizer Essentials with their actual deposit book"}
  ],
  "discoveryQ": [
    {
      "audience": "President / CEO",
      "questions": [
        {"topic": "Competitive Pricing", "q": "How do you know if your CD rates are competitive this week across all 9 institutions in Riverton?"},
        {"topic": "Margin Management", "q": "When you see a competitor advertising a higher rate, how do you decide whether to match or hold?"}
      ]
    }
  ],
  "emailTemplates": [
    {
      "label": "Cold Outreach",
      "body": "Subject: Your deposit rates vs. 9 Riverton competitors\n\nPresident Hale,\n\nCongratulations on the civic centre naming rights..."
    }
  ],
  "landmines": [
    {
      "competitor": "Agricultural Lending Cooperative",
      "colour": "#ef4444",
      "obj": "We use Agricultural Lending Cooperative data for Ag pricing",
      "a": "The Agricultural Lending Cooperative covers Ag loans, not retail deposits. Curinos covers your CD, MMA, and savings rates where it has no data."
    }
  ],
  "proofPoints": [
    {"label": "[X]bps avg deposit savings", "body": "Curinos clients average [X]bps improvement in deposit cost within 6 months of implementing Pricing Data"},
    {"label": "[N]+ institutions", "body": "Example Community Bank's 9 competitors are all in our database — you'll see their exact rates every week"}
  ],
  "agenda": [
    {"label": "Opening (5 min)", "body": "Confirm understanding of Example Community Bank's deposit mix and competitive priorities"},
    {"label": "Demo (15 min)", "body": "Walk through sample Pricing Data report for the Riverton market"},
    {"label": "Q&A (10 min)", "body": "Address questions and objections; propose 30-day pilot"}
  ],
  "valueProps": [
    {"label": "Zero IT integration", "body": "Delivered as web portal + Excel add-in. No technical implementation required."},
    {"label": "Weekly rate intelligence", "body": "Know every competitor's rates every week — not quarterly"},
    {"label": "Community bank pricing", "body": "Priced for your scale. ROI positive on less than 1bps improvement."}
  ]
}
```
⛔ Empty `salesPlaybook{}` → entire Sales Playbook tab section is blank.
⛔ All 8 arrays (actionPlan, discoveryQ, emailTemplates, landmines, proofPoints, agenda, valueProps) should have content.

---

### ⚠️ CHARTS: Balance Sheet & Funding panels

These panels require separate data fields in `loans{}` that are often missing:

```json
"loans": {
  "totalLoansB": 0.310,
  "narrative": "2-3 sentences describing the loan portfolio composition and strategic context",
  "source": "FDIC Call Report Q1 2025",
  "fullSuite": {
    "commercial_re": "$120M CRE — local commercial property and businesses",
    "agricultural": "$95M Ag — dairy, crops, ranching (25-35% of portfolio)",
    "construction": "$37M construction lending",
    "cni": "$37M C&I operating loans",
    "consumer": "$25M consumer (small by design)"
  },
  "mix": [
    {
      "label": "Commercial Real Estate",
      "pct": 38,
      "value": "$120M",
      "opp": "medium",
      "note": "Local commercial property serving the Riverton business community"
    }
  ]
}
```

And `funding{}` must use `items[]` not `mix[]`:
```json
"funding": {
  "totalDepositsB": 0.463,
  "salesNote": "Over-funded position (67% LDR) suggests potential over-pricing — Pricing Data identifies exactly where to reduce cost without losing balances",
  "items": [
    {"label": "Core Demand / Checking", "value": "$162M", "pct": 35, "colour": "#3b82f6", "note": "Strong NIB commercial accounts"},
    {"label": "Savings & Money Market", "value": "$130M", "pct": 28, "colour": "#22c55e", "note": "Interest-bearing savings"},
    {"label": "Certificates of Deposit", "value": "$116M", "pct": 25, "colour": "#f59e0b", "note": "Community CD products + IRA CDs"},
    {"label": "Other / Time Deposits", "value": "$55M", "pct": 12, "colour": "#94a3b8", "note": "Miscellaneous time deposits"}
  ]
}
```

---

### ⚠️ MATURITY PROFILE & LIQUIDITY — Populate for Balance Sheet tab

These are "optional" in build.py but render prominent panels. Always include them:

```json
"maturityProfile": {
  "buckets": [
    {"label": "< 3 Months", "value": "$139M", "pct": "~30%", "colour": "#f87171", "signal": "Seasonal Ag paydown — repricing risk"},
    {"label": "3-12 Months", "value": "$93M", "pct": "~20%", "colour": "#fbbf24", "signal": "CD renewals expected"},
    {"label": "1-3 Years", "value": "$139M", "pct": "~30%", "colour": "#22c55e", "signal": "Core stable funding"},
    {"label": "> 3 Years", "value": "$92M", "pct": "~20%", "colour": "#60a5fa", "signal": "Long-dated time deposits"}
  ],
  "salesAngle": "Seasonal Ag cash flows create quarterly deposit repricing events. Without Curinos Pricing Data, Example Community Bank is guessing at market rates during each of these windows."
},
"liquidity": {
  "kpis": [
    {"label": "Loan-to-Deposit Ratio", "value": "67.1%", "colour": "#22c55e", "note": "Well below 75-80% industry average — ample liquidity"},
    {"label": "Cash & Equivalents", "value": "$59.5M", "colour": "#60a5fa", "note": "11.4% of total assets"},
    {"label": "AFS Securities", "value": "$129.8M", "colour": "#94a3b8", "note": "Available-for-sale buffer; IRR exposure if rates shift"}
  ],
  "salesNote": "Low LDR suggests potential over-pricing on certain deposit products. Curinos Pricing Data quantifies exactly where rates can be reduced without balance attrition."
}
```

---

### ⚠️ PRE-BUILD CHECKLIST

Before writing ANY JSON, verify you will include ALL of these. Missing any = blank dashboard panels.

**Financial Overview panels:**
- [ ] `charts.balanceSheet{}` with `{labels[], assets[], loans[], deposits[]}` — 6–8 quarters minimum, values in $M integers (e.g. 9200 = $9.2B). ⛔ NEVER write flat `charts.assets[]` — must be nested inside `charts.balanceSheet`.
- [ ] `charts.revenue{}` with `{labels[], nii[], nonii[]}` — same labels as balanceSheet. ⛔ NEVER write flat `charts.nii[]` — must be nested inside `charts.revenue`.
- [ ] `finOverview.analystConsensus` with all 10 sub-fields

**Balance Sheet & Funding panels:**
- [ ] `loans.mix[]` with `label/pct/value/opp/note` keys
- [ ] `loans.narrative` — text description
- [ ] `loans.fullSuite{}` — breakdown object
- [ ] `funding.items[]` (NOT `funding.mix[]`)
- [ ] `funding.totalDepositsB` — number in $B (drives ROI calculator scale)
- [ ] `funding.salesNote`
- [ ] `maturityProfile{}` with `buckets[]` and `salesAngle`
- [ ] `liquidity{}` with `kpis[]` and `salesNote`

**Product Fit & Playbook panels:**
- [ ] `scoringInputs{}` written and `score_v4.py --write` run with exit code 0
- [ ] Every product has: `pri` (int), `what`, `need`, `roi`, `time`, `talk`, `use[]`, `objections[]`
- [ ] `salesPlaybook.intro`, `actionPlan[]`, `discoveryQ[]`, `emailTemplates[]`
- [ ] `salesPlaybook.landmines[]`, `proofPoints[]`, `agenda[]`, `valueProps[]`

**Other required fields:**
- [ ] `basic` uses: `legal`, `hq`, `est`, `ceo`, `cfo` (NOT `headquarters`, `founded`)
- [ ] `structure.parent` and `structure.bank` are DICTS (NOT strings)
- [ ] `demo` has flat fields: `assets`, `branches`, `states`, `employees`
- [ ] `meta` includes `latestQuarter`, `opportunity`, `sizeBand` (build.py requires all three)


---

## CRITICAL SCHEMA FIXES (v2.5) — salesPlaybook Sub-Array Key Contracts

build.py requires EXACT key names in all salesPlaybook sub-arrays. Wrong keys = silent empty panels.

| Sub-array | Required keys | DO NOT use |
|-----------|--------------|------------|
| `landmines[]` | `competitor`, `colour`, `objection`, `rebuttal` | `obj`, `a` |
| `proofPoints[]` | `stat`, `label`, `colour` | `label`+`body` |
| `agenda[]` | `time`, `title`, `detail` | `label`, `body` |
| `valueProps[]` | `audience`, `pitch` | `label`, `body` |
| `actionPlan[]` | `period`, `body` | ✓ correct |
| `discoveryQ[]` | `audience`, `questions[{topic,q}]` | ✓ correct |
| `emailTemplates[]` | `label`, `body` | ✓ correct |

### Correct `salesPlaybook` structure (exact keys):
```json
"salesPlaybook": {
  "intro": "...",
  "actionPlan": [{"period": "Week 1-2", "body": "..."}],
  "discoveryQ": [{"audience": "CEO", "questions": [{"topic": "Pricing", "q": "..."}]}],
  "emailTemplates": [{"label": "Cold Outreach", "body": "..."}],
  "landmines": [{"competitor": "Agricultural Lending Cooperative", "colour": "#f59e0b", "objection": "...", "rebuttal": "..."}],
  "proofPoints": [{"stat": "[X]bps avg savings", "label": "Curinos clients average...", "colour": "#3b82f6"}],
  "agenda": [{"time": "Opening (5 min)", "title": "Opening", "detail": "..."}],
  "valueProps": [{"audience": "Zero IT integration", "pitch": "Delivered as web portal..."}]
}
```

## INFRASTRUCTURE FIXES APPLIED (v2.4/2.5) — Permanent in SHELL_BOTTOM & build.py

These bugs have been fixed at the infrastructure level. Do NOT apply workarounds in the JSON:

1. **ROI Calculator scale** — SHELL_BOTTOM now reads `D.loans.totalDepositsB` (set from `funding.totalDepositsB`) to scale the deposit slider correctly. Always include `funding.totalDepositsB` as a number in $B.

2. **NIM Chart y-axis** — SHELL_BOTTOM now uses `suggestedMin`/`suggestedMax` with ±0.3% padding around actual data range. Values will never show 0-baseline zeros. Ticks formatted as `v.toFixed(2)+"%"`.

3. **build.py** — Now passes `totalDepositsB` from `funding{}` through to `D.loans.totalDepositsB` in the HTML output.

---

## CRITICAL FIELD CONTRACTS (v2.6) — 7 Panels That Go Blank If Keys Are Wrong

These are the exact fields the SHELL reads. Wrong key names = completely blank panels. These were discovered through post-delivery audit and are now mandatory.

---

### 1. PRIMARY SALES THEME panel (Financial Overview)
Shell reads `D.finOverview.salesTheme` and `D.finOverview.salesThemeBody`.
Without these the green theme banner shows only the bank name and no body text.

```json
"finOverview": {
  "salesTheme": "⚡ PRIMARY SALES THEME: Post-Merger Analytics Gap",
  "salesThemeBody": "2-3 sentence explanation of the primary Curinos sales thesis for this institution, specific to their current situation and urgency.",
  ...
}
```
⛔ DO NOT omit `salesTheme` and `salesThemeBody` — they are the first thing a seller sees.

---

### 2. NII SENSITIVITY & DEPOSIT BETA panel (Financial Overview)
Shell reads `D.finOverview.niiSensitivity.upValue`, `downValue`, `betaMetrics[]`, `salesAngle`.
Without `niiSensitivity{}` the panel renders with "+TBD" and "−TBD" placeholders.

```json
"finOverview": {
  "niiSensitivity": {
    "upBps": 25,
    "upValue": "+$X.XM",
    "upLabel": "Per +25bps Fed move",
    "upPositive": true,
    "downBps": 25,
    "downValue": "-$X.XM",
    "downLabel": "Per -25bps Fed move",
    "downPositive": false,
    "betaMetrics": [
      {"label": "Deposit Beta (2022-23 cycle)", "value": "XX%", "colour": "#f59e0b", "note": "Context on beta behaviour"},
      {"label": "Cost of Deposits Q4 2025", "value": "X.XX%", "colour": "#60a5fa", "note": "vs peer avg of X.XX%"},
      {"label": "NII at Risk (−100bps shock)", "value": "$XXM", "colour": "#ef4444", "note": "Annual NII headwind"}
    ],
    "salesAngle": "Why this rate sensitivity creates Curinos urgency."
  }
}
```

---

### 3. ANALYST CONSENSUS & INVESTMENT SIGNALS panel (Financial Overview)
Shell reads `ac.mgmtGuidance` and `ac.streetConsensus` — the panel ONLY renders if one of these is present.
It does NOT render for `rating`, `avgTarget`, `currentPrice`, `upside`, `firms` — those are WRONG keys.

```json
"finOverview": {
  "analystConsensus": {
    "mgmtGuidance": "+5-7%",
    "mgmtLabel": "NII FY2026 guidance — CFO commentary",
    "streetConsensus": "+4-6%",
    "streetLabel": "Street sits 1-2pts below management",
    "confidenceNote": "Why the guidance gap exists and what this means for the sales conversation.",
    "confidenceLevel": "AMBER",
    "confidenceTitle": "Guidance Confidence",
    "salesRead": "What this means for Curinos sellers — why now is the moment to engage.",
    "stockBadge": {
      "label": "Stock vs. 52-Wk High",
      "value": "$28.00",
      "ticker": "NASDAQ: EXCB",
      "vsValue": "$35.40",
      "vsLabel": "52-week high",
      "sub": "~21% discount — insider buying signal"
    },
    "capitalBadge": {
      "label": "Dividend Yield",
      "value": "4.1%",
      "sub": "$1.16 annualized",
      "signal": "▲ Dividend increased in 2025"
    },
    "src": [
      {"n": "Example Research Feb 2026", "u": "https://investors.examplecommunitybank.com"},
      {"n": "Example Consensus Provider — EXCB", "u": "https://investors.examplecommunitybank.com"}
    ]
  }
}
```
⛔ DO NOT use: `rating`, `avgTarget`, `currentPrice`, `upside`, `firms`, `lastUpdated`, `epsEstimate2026` — these keys are NOT read by the shell and the panel will be completely blank.

---

### 4. FEE INCOME BREAKDOWN & CURINOS PRODUCT TIMING panel (Financial Overview)
Shell only renders this panel if `D.finOverview.feeIncome.items.length > 0`.
Without `feeIncome.items[]` the entire panel is absent.

```json
"finOverview": {
  "feeIncome": {
    "intro": "Brief context on fee income composition and strategic importance.",
    "salesAngle": "How fee income mix creates Curinos product timing opportunities.",
    "items": [
      {
        "label": "Wealth Management & Trust",
        "value": "$13.9M",
        "trend": "▲ 8% YoY",
        "colour": "#a78bfa",
        "note": "Private Bank + Retail Investment Services — 57% of non-interest income",
        "product": "Wealth Analyzer",
        "angle": "Growing wealth franchise with expanding HNW opportunity in the eastern markets"
      },
      {
        "label": "Service Charges & Interchange",
        "value": "$5.8M",
        "trend": "▲ 5% YoY",
        "colour": "#60a5fa",
        "note": "Business transactional and retail fee income",
        "product": "Commercial Analyzer",
        "angle": "Business fee income growth signals commercial relationship deepening"
      },
      {
        "label": "Mortgage Gain-on-Sale",
        "value": "$1.7M",
        "trend": "▼ vs 2024 (rate driven)",
        "colour": "#22c55e",
        "note": "Residential mortgage production with internal origination shift",
        "product": "LendersBenchmark Analyzer",
        "angle": "Rate-driven mortgage decline creates pricing intelligence urgency"
      },
      {
        "label": "BOLI & Other Income",
        "value": "$2.9M",
        "trend": "= Stable",
        "colour": "#94a3b8",
        "note": "Bank-owned life insurance and other miscellaneous fee streams",
        "product": "",
        "angle": ""
      }
    ]
  }
}
```

---

### 5. EXECUTIVE LEADERSHIP cards (Organisation & People tab)
Shell reads `ex.col`, `ex.badge`, `ex.since`, `ex.relevance`, `ex.insight`, `ex.products`.
The JSON fields `tenure`, `background`, `linkedin`, `email`, `phone`, `salesAngle` are NOT read.

```json
"contacts": {
  "execs": [
    {
      "name": "Jane A. Example, CFP",
      "title": "Chief Executive Officer",
      "since": "CEO since 2016 — at Example Community Bancorp since 1984",
      "col": "#3b82f6",
      "badge": "CEO",
      "bc": "#1e3a5f",
      "relevance": "Lifelong community banker; primary decision-maker on strategic partnerships and major vendor relationships. 'Best Bank in the region' vision drives openness to performance-enhancing tools.",
      "insight": "Open the CEO Example conversation with the organic growth narrative — she's measured on becoming the dominant regional community bank, and Curinos helps her benchmark that progress against every peer.",
      "products": "Pricing Data, Treasury Analyzer, Advisory",
      "io": "CEO"
    }
  ]
}
```
Field map (exact keys required by shell):
| Shell key | What to put there |
|-----------|-------------------|
| `col` | Hex colour for card top border (use role colour: blue=CEO/CFO, green=CLO, purple=CIO, amber=COO) |
| `badge` | Short role badge: `"CEO"`, `"CFO"`, `"CLO"`, `"CIO"`, `"President"` |
| `bc` | Badge background colour (dark shade of col) — e.g. `"#1e3a5f"` for blue |
| `since` | Tenure string shown below title |
| `relevance` | 2-3 sentences: why this person matters to Curinos sellers |
| `insight` | 1-2 sentences: specific Curinos conversation opener for this exec |
| `products` | Comma-separated Curinos products relevant to this exec |
| `io` | Role abbreviation for internal use: `"CEO"`, `"CFO"`, `"CLO"` etc. |

⛔ DO NOT use: `tenure`, `background`, `linkedin`, `email`, `phone`, `salesAngle` — these are ignored.

---

### 6. CURINOS TARGET TEAMS panel (Organisation & People tab)
Shell reads `t.team`, `t.size`, `t.approach`, `t.colour`, `t.products`.
Either key is accepted for the description: build_v2.py cross-fills `approach` and `note`, so content written to either one reaches the shell. The shell renders `t.approach`, so `approach` is preferred.

```json
"contacts": {
  "targetTeams": [
    {
      "team": "ALCO / Treasury",
      "colour": "#60a5fa",
      "size": "3-5 FTEs: CFO Roberts + ALCO committee",
      "approach": "Lead with post-merger FTP recalibration challenge. Treasury Analyzer solves the exact problem CFO Roberts is navigating — deposit beta models built on pre-merger data applied to a doubled balance sheet.",
      "products": "Treasury Analyzer, Pricing Data"
    },
    {
      "team": "Retail Deposit / ALCO Pricing",
      "colour": "#22c55e",
      "size": "ALCO committee + branch operations",
      "approach": "Pricing Data entry conversation — show weekly regional competitive rate intelligence as a leave-behind. Zero IT integration makes this an immediate win.",
      "products": "Pricing Data, Deposit Optimizer Essentials"
    },
    {
      "team": "Commercial Banking / CLO",
      "colour": "#f59e0b",
      "size": "CLO Marsh + commercial lending team",
      "approach": "LendersBenchmark entry after Pricing Data relationship is established. Focus on new eastern markets where Example Community Bancorp inherited Example Heritage Bancorp's commercial book.",
      "products": "LendersBenchmark Analyzer, Commercial Analyzer"
    },
    {
      "team": "Wealth Management",
      "colour": "#a78bfa",
      "size": "Private Bank + Retail Investment Services",
      "approach": "Wealth Analyzer conversation once Pricing Data/Treasury are in place. Frame around the County A / County B expansion — new affluent markets where Example Community Bancorp needs pricing benchmarks.",
      "products": "Wealth Analyzer"
    }
  ],
  "strategy": "Multi-thread entry: Lead with CFO Roberts on Treasury Analyzer + Pricing Data, expand to CLO Marsh on LendersBenchmark once financial data tools are established. CEO Example is the relationship anchor for the full Curinos partnership."
}
```
✅ Either `approach` or `note` is accepted for the description text — build_v2.py cross-fills the two keys. The shell renders `t.approach`, so `approach` is preferred.

---

### 7. SILO ASSESSMENT panel (Organisation & People tab)
Shell reads a completely different structure than the `silos[]` array that was previously used.
Required: `integration` string, `verdict`, `intro`, `groups[]`, `integrationSignals[]`, `siloSignals[]`, `salesImplications[]`, `siloSrc[]`.

```json
"siloAssessment": {
  "integration": "partial",
  "verdict": "Partially Integrated — Post-Merger Harmonisation Underway",
  "intro": "Example Community Bancorp is mid-way through integrating two bank cultures, two deposit pricing histories, and two commercial banking approaches. Systems are consolidated but analytics and decision-making are still converging.",
  "groups": [
    {
      "title": "ALCO / Finance",
      "status": "fragmented",
      "detail": "FTP and deposit decay models built on legacy Example Community Bancorp data — not yet recalibrated for the $1.4B Example Heritage Bancorp book with different customer behavior profiles.",
      "salesAngle": "Treasury Analyzer urgency — ALCO is making $3.6B balance sheet decisions on models that were built for a $2.7B bank."
    },
    {
      "title": "Retail Deposit Pricing",
      "status": "partial",
      "detail": "Two legacy deposit pricing teams now consolidated but rate-setting processes across 9 counties still being harmonised. Inconsistent pricing intelligence across the western vs. eastern markets.",
      "salesAngle": "Pricing Data solves the immediate problem — weekly rate intelligence across all 9 counties from a single source."
    },
    {
      "title": "Commercial Banking",
      "status": "partial",
      "detail": "Legacy Example Community Bancorp commercial team (the western markets) and legacy Example Heritage Bancorp team (the eastern markets) operationally combined but still building shared relationship management practices.",
      "salesAngle": "Commercial Analyzer entry point — ECR and commercial deposit benchmarking for the expanded 9-county book."
    },
    {
      "title": "Wealth Management",
      "status": "integrated",
      "detail": "Wealth Management function (Private Bank + Retail Investment Services) operates as a unified channel with consistent products and processes across the enlarged franchise.",
      "salesAngle": "Wealth Analyzer is a longer-term conversation — the function is stable and the growth angle is the new affluent market access in the eastern markets."
    },
    {
      "title": "Technology & Data",
      "status": "partial",
      "detail": "Core banking system integration complete. Advanced treasury management platform deployed. However, data analytics infrastructure has not scaled with the institution — no external benchmarking tool in place.",
      "salesAngle": "Curinos is the first analytics vendor this bank needs — white space with no incumbents to displace."
    }
  ],
  "integrationSignals": [
    {"signal": "Core banking system consolidation complete March 2025 — single operating system for all 56 offices", "src": "Example Community Bancorp Q1 2025 Press Release"},
    {"signal": "Advanced treasury management platform launched 2023 — deployed across combined franchise", "src": "Example Community Bancorp Press Release May 2023"},
    {"signal": "Single brand identity — all offices operating under the Example Community Bank name as of March 14, 2025", "src": "Example Community Bancorp Consolidation Press Release"},
    {"signal": "CEO Example confirmed Q4 2025: 'merger behind us... focus on serving clients and growing core business'", "src": "EXCB Q4 2025 Earnings"}
  ],
  "siloSignals": [
    {"signal": "ALCO models built on pre-merger $2.7B data — not yet recalibrated for $4.4B combined franchise with different deposit behavior profiles", "src": "EXCB Investor Presentations 2025"},
    {"signal": "Deposit cost management cited as a 2026 challenge — CFO flagged rate floor friction across markets with different competitive dynamics", "src": "EXCB Q4 2025 Earnings Release"},
    {"signal": "No disclosed external analytics vendor — competitive rate benchmarking across 9-county footprint appears to rely on internal/manual processes", "src": "Public filings review"},
    {"signal": "The western markets (legacy Example Community Bancorp) and the eastern markets (legacy Example Heritage Bancorp) had materially different deposit pricing histories — harmonisation still underway", "src": "EXCB Merger Integration Disclosures 2025"}
  ],
  "salesImplications": [
    {"label": "ALCO is the primary entry point", "body": "CFO Roberts is navigating a doubled balance sheet with outdated models. Treasury Analyzer and Pricing Data are the immediate solution — lead every conversation here before expanding to commercial or wealth."},
    {"label": "Multi-market intelligence gap is the hook", "body": "Example Community Bancorp now competes in 9 counties with very different competitive dynamics. The western-markets pricing playbook does not apply to County A or County B. Curinos solves this with a single unified competitive rate view."},
    {"label": "No incumbent analytics vendor — first mover advantage", "body": "There is no Curinos competitor entrenched at this institution. The post-merger window is closing — the analytics infrastructure decisions being made now will lock in vendors for 3-5 years. This is the moment to establish Curinos as the foundational data layer."}
  ],
  "siloSrc": [
    {"n": "EXCB Q4 2025 Earnings Release", "u": "https://investors.examplecommunitybank.com"},
    {"n": "EXCB Investor Presentations 2025", "u": "https://investors.examplecommunitybank.com"}
  ]
}
```
⛔ DO NOT use `siloAssessment.silos[]` — that key is never read by build.py or the shell.
✅ USE `siloAssessment.groups[]` with keys: `title`, `status` (`"integrated"`/`"partial"`/`"fragmented"`), `detail`, `salesAngle`.

---

### 8. sources[] — Corporate Structure source links
Shell reads `s.url` and `s.label` (NOT `s.u` and `s.n`).
The Corporate Structure panel tooltip uses `D.sources` for its clickable source links.

```json
"sources": [
  {"label": "Example Community Bancorp Q4 2025 Earnings Release", "url": "https://investors.examplecommunitybank.com"},
  {"label": "FDIC BankFind — FDIC Cert 99999", "url": "https://banks.data.fdic.gov/bankfind-suite/bankfind/details/99999"},
  {"label": "Example Community Bank Official Website", "url": "https://www.examplecommunitybank.com"}
]
```
⛔ DO NOT use `n` and `u` keys in `sources[]` — use `label` and `url`.
Note: metric tooltip `src[]` arrays inside `metrics[].t.src[]` correctly use `n`/`u` — that is different and correct.

---

### UPDATED PRE-BUILD CHECKLIST (v2.6)

Before writing ANY JSON, verify ALL of the following. Each item maps to a specific panel. Missing = blank panel.

**Financial Overview — 5 required fields:**
- [ ] `finOverview.salesTheme` — short headline string (PRIMARY SALES THEME banner)
- [ ] `finOverview.salesThemeBody` — 2-3 sentence body for the theme banner
- [ ] `finOverview.niiSensitivity{}` — with `upValue`, `downValue`, `betaMetrics[]`, `salesAngle`
- [ ] `finOverview.analystConsensus{}` — with `mgmtGuidance`, `streetConsensus`, `mgmtLabel`, `streetLabel`, `confidenceNote`, `confidenceLevel`, `salesRead`, `stockBadge{}`, `capitalBadge{}`, `src[]`
- [ ] `finOverview.feeIncome{}` — with `items[]` each having `label`, `value`, `trend`, `colour`, `note`, `product`, `angle`

**Organisation & People — 3 required structures:**
- [ ] `contacts.execs[]` — each with `col`, `badge`, `bc`, `since`, `relevance`, `insight`, `products`, `io`
- [ ] `contacts.targetTeams[]` — each with `team`, `colour`, `size`, `approach` (or `note`), `products`
- [ ] `siloAssessment{}` — with `integration`, `verdict`, `intro`, `groups[]`, `integrationSignals[]`, `siloSignals[]`, `salesImplications[]`, `siloSrc[]`

**Sources array:**
- [ ] `sources[]` — each with `label` and `url` keys (NOT `n`/`u`)


---

## CRITICAL BUG FIX (v2.7) — niiSensitivity empty dict causes blank panel

### ⚠️ `niiSensitivity: {}` is NOT the same as a populated object

In build.py, `niiSensitivity` is serialised with the ternary: `nii_str = f"{{...}}" if nii else '{}'`

An empty dict `{}` is **falsy in Python**, so build.py outputs a bare JS `{}` — making `nii.upBps` undefined in the browser. The shell condition `if(nii.upBps||nii.downBps)` then evaluates false and the entire NII Sensitivity & Deposit Beta panel is silently skipped.

**The symptom:** NII Sensitivity panel is completely absent with no error.

**The fix:** Always populate `niiSensitivity` with real values. Never leave it as `{}` or omit it.

For private banks or institutions without public IRR disclosures, estimate from available data:
- `upValue` / `downValue`: `assets × 0.0025 × sensitivity_factor` (e.g. $520M × 0.25% = ~$1.3M total, asset-sensitive portion ~45% = $580K)
- `betaMetrics`: always include deposit beta estimate, deposit cost, NIM vs peer gap, LDR
- `salesAngle`: required — always explain the Curinos opportunity in this specific context


---

## CRITICAL MISSING FIELDS — v2.8 (Added after Example Regional Bancorp diagnostic March 2026)

These fields caused multiple panels to be BLANK. Every field below is REQUIRED for a complete dashboard. Do NOT omit any of them.

---

### 1. ANALYST CONSENSUS — mgmtGuidance & streetConsensus MUST BE SHORT DISPLAY VALUES

The Analyst Consensus panel renders these as large KPI numbers. They MUST be short — like a stock ticker card.

```json
"analystConsensus": {
  "mgmtGuidance": "+8-10%",        ← SHORT! (NOT a paragraph)
  "mgmtLabel": "Operating revenue growth 2026 — CEO earnings call",
  "streetConsensus": "$4.65",       ← SHORT! (EPS, NII, or growth %)
  "streetLabel": "Consensus 2026 EPS estimate — 5 analysts covering",
  "confidenceTitle": "Guidance Confidence — Watch Item",
  "confidenceNote": "Why analysts are cautious / aligned...",
  "confidenceLevel": "AMBER",       ← "GREEN" | "AMBER" | "RED"
  "salesRead": "What this means for Curinos sellers",
  "stockBadge": {
    "label": "EXRB: ~$51", "value": "~$51", "ticker": "NYSE: EXRB",
    "vsValue": "$68", "vsLabel": "52-wk high",
    "sub": "~25% below 52-week high"
  },
  "capitalBadge": {
    "label": "Tier 1: ~9.4%", "value": "~9.4%",
    "sub": "Well-capitalised — active buyback", "signal": "Strong"
  }
}
```

⛔ NEVER set mgmtGuidance or streetConsensus to a full sentence — they render as GIANT display values.

---

### 2. CORPORATE STRUCTURE — D.businessSegments[] is REQUIRED

The "Corporate Structure" panel under Organisation & People ONLY renders if `D.businessSegments[]` is populated. Without it, the entire Corporate Structure section is BLANK.

```json
"businessSegments": [
  {
    "name": "Banking Services",
    "colour": "#3b82f6",
    "head": "Michael Sample, CBO (Jan 2026)",
    "stat": "~150 branches · multi-state footprint · $20.0B assets",
    "products": "Core deposits, commercial lending, treasury management, mortgage, de novo expansion"
  },
  {
    "name": "Employee Benefit Services",
    "colour": "#22c55e",
    "head": "Benefits Administration Division Leadership",
    "stat": "National scale · collective investment fund admin · actuarial consulting",
    "products": "Employee benefits admin, trust services, 401k/retirement plan design"
  }
]
```

⛔ WITHOUT businessSegments[], the op-structure anchor section is BLANK — this is one of the most visible missing panels.
✅ Include ALL major business segments. For a community bank: Banking, Wealth, Insurance if applicable.
✅ Use `head` for the business unit leader, `stat` for key metrics, `products` for what the segment offers.

---

### 3. STRATEGY TAB — Must use D.strategyPillars[] for "Strategy 1, Strategy 2..." panels

The Strategy & Health tab renders numbered panels ONLY if `D.strategyPillars[]` is provided. Without it, the tab falls back to splitting D.strategy on double-newlines which often produces a single un-structured block.

```json
"strategyPillars": [
  {
    "title": "De Novo Branch Expansion",
    "body": "Full explanation of this strategy pillar — 2-4 sentences with specifics, numbers, timeline.",
    "curinosLink": "Pricing Data, Distribution Analyzer"
  },
  {
    "title": "Selective Acquisitions",
    "body": "Full explanation — what was acquired, when, strategic rationale, integration status.",
    "curinosLink": "Commercial Analyzer, Treasury Analyzer"
  },
  {
    "title": "Revenue Diversification",
    "body": "How the non-banking segments work and why they matter strategically.",
    "curinosLink": "Wealth Analyzer, Advisory products"
  },
  {
    "title": "AI & Automation Investment",
    "body": "What automation investment is underway, CEO language, 2026 priorities.",
    "curinosLink": "Treasury Analyzer, Retail Deposit Optimizer Essentials"
  }
]
```

⛔ Without strategyPillars[], "Strategy 1:", "Strategy 2:" headers will NOT appear.
✅ Minimum 3 pillars. Maximum 6. Each must map to a Curinos product via curinosLink.

---

### 4. HEALTH RATING — Must be TEXT not a number

D.healthRating renders inside a styled badge. It must be a SHORT TEXT LABEL, not a numeric score.

```json
"healthRating": "GOOD — Expanding",   ← TEXT (NOT 72 or 8/10)
"healthColour": "#34d399",             ← green for good, amber for watch, red for distress
"healthNote": "2-3 sentence health summary shown below the badge"
```

Acceptable values: "STRONG", "GOOD — Expanding", "SATISFACTORY", "WATCH — Under Pressure", "DISTRESSED"
⛔ NEVER set healthRating to a number — it renders inside a badge element and a number looks broken.

---

### 5. PEERS — Must include summary.leads[], summary.watch[], AND watchlist[]

The "Where [Bank] Leads & Where to Watch" panel and "Competitive Intelligence Watchlist" are BLANK without these.

```json
"peers": {
  "northeast_regionals": [...],
  "summary": {
    "leads": [
      "Deposit cost advantage — 1.20% vs peer avg 1.38%",
      "NIM expansion — 7 consecutive quarters"
    ],
    "watch": [
      "Efficiency ratio 64% above best-in-class peers",
      "Securities portfolio yield drag limits NIM"
    ]
  },
  "watchlist": [
    {
      "competitor": "Example National Bank (adjacent metro)",
      "colour": "#f87171",
      "urgency": "HIGH RISK",
      "detail": "Dominant incumbent in the market Example Regional Bancorp just entered — aggressive deposit defender."
    }
  ],
  "salesAngle": "Why Example Regional Bancorp's peer position creates a Curinos opportunity",
  "commentary": {
    "table": "2-3 sentences: observation on where target leads/lags in the table + Curinos sales angle + relevant products. E.g. 'The target leads on capital (15.43% CET1) but lags all peers on NIM (2.97% vs ~3.2% median). On $735M deposits, closing half this gap = $920K annual NII. Curinos Pricing Data and Deposit Optimizer Essentials directly address this.'",
    "nim": "2-3 sentences on the NIM trajectory chart: trend direction, gap vs peers, urgency, Curinos product recommendation.",
    "radar": "2-3 sentences on the radar chart: what the shape shows, where strengths/gaps are, Curinos product that addresses the gap dimensions.",
    "depositCost": "2-3 sentences on deposit cost bars: which peers are higher/lower, what this means for the target, Curinos product recommendation.",
    "efficiency": "2-3 sentences on efficiency ratio bars: the target's position vs peers, revenue vs cost lever framing, Curinos product recommendation."
  }
}
```

⛔ Without peers.summary, the "Leads & Watch" panel is BLANK.
⛔ Without peers.watchlist, the "Competitive Intelligence Watchlist" is BLANK.
⛔ Without peers.commentary{}, ALL observation/sales angle boxes below the table, NIM chart, radar, deposit cost, and efficiency charts are BLANK. This is required on every build.
✅ Minimum 2 leads, 2 watch items, 2-3 watchlist competitors, all 5 commentary keys populated.

---

### 6. BALANCE SHEET TAB — Required fields for all sub-panels

These sub-panels are BLANK without the following:

**Loan Portfolio — Sales Context:**
```json
"loans": {
  "narrative": "2-3 sentence sales-angle commentary on the loan portfolio mix and what it means for Curinos."
}
```

**Full Product Suite:**
```json
"loans": {
  "fullSuite": {
    "Commercial Real Estate": "Description of CRE book",
    "Commercial & Industrial": "Description of C&I book",
    "Residential Mortgage": "Description of mortgage book",
    "Consumer": "Description of consumer book"
  }
}
```

**Funding Maturity Profile & IRR Signal:**
```json
"maturityProfile": {
  "buckets": [
    {"label": "< 3 Months", "value": "~$3.6B", "pct": "~25%", "colour": "#f87171", "signal": "Short-term IRR sensitivity"},
    {"label": "3-12 Months", "value": "~$2.9B", "pct": "~20%", "colour": "#fbbf24", "signal": "CD repricing window"},
    {"label": "1-3 Years",   "value": "~$4.3B", "pct": "~30%", "colour": "#22c55e", "signal": "Core stable funding"},
    {"label": "> 3 Years",   "value": "~$3.6B", "pct": "~25%", "colour": "#60a5fa", "signal": "Long-dated institutional"}
  ],
  "salesAngle": "Why this maturity profile creates Treasury Analyzer urgency"
}
```

**Liquidity KPIs:**
```json
"liquidity": {
  "kpis": [
    {"label": "Available Liquidity", "value": "$6.2B", "colour": "#22c55e", "note": "240% of uninsured deposits"},
    {"label": "FHLB Capacity",       "value": "$1.18B", "colour": "#60a5fa", "note": "Unused FHLB borrowing capacity"},
    {"label": "Uninsured Coverage",  "value": "240%",   "colour": "#22c55e", "note": "Well above comfort threshold"}
  ],
  "salesNote": "How liquidity position creates Curinos opportunity"
}
```

---

### 7. SALES PLAYBOOK — All sub-sections REQUIRED

The entire Product Fit & Playbook tab's lower section is BLANK without `D.salesPlaybook`. This is the most critical section for sellers. ALL sub-sections must be populated:

```json
"salesPlaybook": {
  "intro": "One sentence intro for the playbook header",
  "actionPlan": [
    {"period": "Week 1-2 — Research & Request", "body": "Specific actions this week to initiate the relationship"},
    {"period": "Month 1 — ALCO Entry",           "body": "How to land the first product"},
    {"period": "Month 2-3 — Expand",             "body": "How to expand after entry"},
    {"period": "Month 4-6 — Full Suite",          "body": "Path to full Curinos commitment"}
  ],
  "discoveryQ": [
    {
      "audience": "CFO",
      "questions": [
        {"topic": "Deposit Pricing", "q": "Specific question for this exec about their pricing challenge"},
        {"topic": "NIM Management",  "q": "Question about NIM and rate environment"}
      ]
    },
    {
      "audience": "CBO / Commercial",
      "questions": [
        {"topic": "Commercial Markets", "q": "Question about commercial deposit and loan pricing strategy"}
      ]
    }
  ],
  "emailTemplates": [
    {"label": "Cold Outreach — CFO", "body": "Subject: ...\n\nFull email text here"},
    {"label": "Follow-Up — Post Demo", "body": "Subject: ...\n\nFull follow-up email text"}
  ],
  "landmines": [
    {
      "competitor": "Competitor or Objection Type",
      "colour": "#f87171",
      "objection": "What they will say",
      "rebuttal": "How to respond"
    }
  ],
  "proofPoints": [
    {"stat": "5bps → $7M", "label": "NII impact of 5bps improvement on $14B deposit base", "colour": "#34d399"}
  ],
  "agenda": [
    {"time": "0:00-0:05", "title": "Intro & Context",    "detail": "What to say and do in this time slot"},
    {"time": "0:05-0:15", "title": "Key Demo",           "detail": "What to show and how to frame it"},
    {"time": "0:15-0:25", "title": "NIM Modelling",      "detail": "Treasury Analyzer scenario"},
    {"time": "0:25-0:30", "title": "ROI & Next Steps",   "detail": "ROI calculator + close for next meeting"}
  ],
  "valueProps": [
    {"audience": "CFO",             "pitch": "One-sentence value prop for the CFO"},
    {"audience": "CBO",             "pitch": "One-sentence value prop for the CBO"},
    {"audience": "CEO",             "pitch": "One-sentence value prop for the CEO"},
    {"audience": "Wealth Mgmt",     "pitch": "One-sentence value prop for wealth management leadership"}
  ]
}
```

⛔ WITHOUT salesPlaybook, the 90-Day Plan, Discovery Qs, Email Templates, Landmines, Proof Points, Meeting Agenda, and Value Props are ALL blank.
✅ This is the seller's most-used section — it must be fully populated on every build.

---

### 8. BALANCE/REVENUE TREND COMMENTARY — finOverview fields

The charts have commentary panels below them driven by these fields:

```json
"finOverview": {
  "balanceSheetTrend": "2-3 sentence commentary on what the balance sheet chart is showing — asset growth drivers, loan portfolio trends, what it means for Curinos. Include: Curinos Products: [product names].",
  "revenueTrend": "2-3 sentence commentary on NII and non-interest income trends — 7 consecutive quarters of expansion, diversification. Include: Curinos Products: [product names]."
}
```

---

### 9. TARGET TEAMS — description key (`approach` or `note`)

build_v2.py accepts either key for the description in Curinos Target Teams cards — it cross-fills `approach` and `note`. The shell renders `t.approach`, so `approach` is preferred.

```json
"targetTeams": [
  {
    "team": "Finance / ALCO",
    "colour": "#1e40af",
    "size": "CFO + Treasury team description",
    "approach": "Full sales approach text — what to say, how to frame, what product to lead with",    ← 'approach' preferred; 'note' also accepted
    "products": "Pricing Data, Treasury Analyzer"
  }
]
```

✅ Either key renders — build_v2.py cross-fills `approach` and `note`. Prefer `approach`, which is the key the shell reads.

---

### UPDATED PRE-BUILD CHECKLIST (v2.8)

Before writing ANY JSON, verify ALL of the following:

**Financial Overview:**
- [ ] `finOverview.salesTheme` — short banner headline
- [ ] `finOverview.salesThemeBody` — 2-3 sentence body
- [ ] `finOverview.balanceSheetTrend` — chart commentary with Curinos products
- [ ] `finOverview.revenueTrend` — chart commentary with Curinos products
- [ ] `finOverview.niiSensitivity{}` — upValue, downValue, upBps (NUMBER), downBps (NUMBER), betaMetrics[], salesAngle
- [ ] `finOverview.analystConsensus.mgmtGuidance` — SHORT (e.g. "+8-10%") NOT a paragraph
- [ ] `finOverview.analystConsensus.streetConsensus` — SHORT (e.g. "$4.65") NOT a paragraph
- [ ] `finOverview.analystConsensus.stockBadge{}` — {label, value, ticker, vsValue, vsLabel, sub}
- [ ] `finOverview.analystConsensus.capitalBadge{}` — {label, value, sub, signal}
- [ ] `finOverview.feeIncome{}` — items[] each with label, value, trend, colour, note, product, angle

**Organisation & People:**
- [ ] `businessSegments[]` — REQUIRED for Corporate Structure panel (name, colour, head, stat, products)
- [ ] `contacts.execs[]` — each with col, badge, bc, since, relevance, insight, products, io
- [ ] `contacts.targetTeams[]` — each with team, colour, size, approach (or note), products
- [ ] `siloAssessment{}` — integration, verdict, intro, groups[], integrationSignals[], siloSignals[], salesImplications[], siloSrc[]

**Strategy & Health:**
- [ ] `strategyPillars[]` — REQUIRED for "Strategy 1, 2..." panels (title, body, curinosLink)
- [ ] `salesTiming[]` — 3 windows (NOW/NEAR/HORIZON) with label, colour, body
- [ ] `healthRating` — TEXT label (e.g. "GOOD — Expanding") NOT a number
- [ ] `healthColour` — hex colour matching health status
- [ ] `healthNote` — 2-3 sentence health description
- [ ] `swot{}` — strengths[], weaknesses[], opportunities[], threats[]
- [ ] `curinosAngle{}` — {title, body}

**Balance Sheet & Funding:**
- [ ] `loans.narrative` — for "Loan Portfolio — Sales Context" panel
- [ ] `loans.fullSuite{}` — for "Full Product Suite" panel (key-value dict)
- [ ] `maturityProfile{}` — for "Funding Maturity Profile & IRR Signal" (buckets[], salesAngle)
- [ ] `liquidity{}` — for "Liquidity KPIs" (kpis[], salesNote)
- [ ] `funding.items[]` — for deposit sub-mix bars (label, pct, colour, value, note)
- [ ] `funding.salesNote` — sales angle for deposit funding mix
- [ ] `loans.fundingMix[]` OR `funding.items[]` — one of these populates the Funding Mix panel

**Peer Comparison:**
- [ ] `peers[key][]` — 5 rows, target first
- [ ] `peers.summary.leads[]` — for "Where [Bank] Leads" panel (minimum 3 items)
- [ ] `peers.summary.watch[]` — for "Where to Watch" panel (minimum 2 items)
- [ ] `peers.watchlist[]` — for "Competitive Intelligence Watchlist" (competitor, colour, urgency, detail)
- [ ] `peers.salesAngle` — fallback sales angle text (used if `peers.commentary.table` is absent)
- [ ] `peers.commentary{}` — **REQUIRED** for observation/sales angle boxes below each chart. Keys: `table`, `nim`, `radar`, `depositCost`, `efficiency`. Each is a 2-3 sentence string combining observation + Curinos sales angle + relevant products. Without this the commentary boxes are blank.
- [ ] `nimTrend{}` — {labels[], target[], peers:{}}

**Chart Scale — Balance Sheet & Revenue:**
- Charts auto-detect $M vs $B: values < 2 are treated as $B (large bank); values >= 2 are treated as $M (community bank)
- For community banks store values in $M (e.g. assets: [550, 640, 738, 816] = $M). For large banks store in $B (e.g. [0.55, 0.64, 0.74] = $B or [550, 640] but then the auto-detect will show $M which is correct).
- The validator warning "CHART SCALE WARNING" is expected for community banks with $M values — it is not an error.


**Product Fit & Playbook:**
- [ ] `products[]` — each with cat, name, fit, pri, need, what, why, use[], roi, time, talk, contacts, objections[]
- [ ] `productFitIntro` — section intro
- [ ] `productFitIntroBody` — section body
- [ ] `productSectionSubtitles{}` — {p1, p2, p3}
- [ ] `salesPlaybook{}` — intro, actionPlan[], discoveryQ[], emailTemplates[], landmines[], proofPoints[], agenda[], valueProps[]

**Sources:**
- [ ] `sources[]` — each with `label` and `url` (NOT n/u)

