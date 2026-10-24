#!/usr/bin/env python3
"""
score_v4.py — Curinos Product Fit scoring engine, Catalogue V4 (Section K).

The Product Fit tab is scored by this script and nothing else. Run A supplies
evidence (`scoringInputs` in the intel JSON); this script turns evidence into
gates, dimension scores, caps, floors and a priority. No score is typed by hand.

Usage
  python3 score_v4.py intel.json                 # print the scored table, change nothing
  python3 score_v4.py intel.json --write         # write scores into products[] / dnrProducts[]
  python3 score_v4.py intel.json --report out.md # also write a markdown scoring report
  python3 score_v4.py intel.json --benchmark bank-benchmark-2026Q2.json   # explicit benchmark file
  python3 score_v4.py intel.json --no-benchmark  # force sourced-peer medians (used to generate Catalogue K6)

Benchmark (v4.1, 2026-10-02)
  Vs-peer metrics are measured against the MEDIAN OF A FULL BANK GROUP when a
  benchmark file is available (FDIC call reports, every active bank with $10B-$100B
  in assets, built quarterly: claude/bank-benchmark-YYYYQn.json). The file is found
  via --benchmark, else the newest bank-benchmark-*.json in the working directory or
  beside this script. Without a file, or for credit unions (the benchmark is
  banks only), the median of the 2-4 hand-sourced peers is used exactly as before.
  Metrics the benchmark does not carry (loan yield, deposits per branch, service
  charges) always use the sourced peers.
  A 3-peer median is just the middle bank: swapping one peer moved Cathay from 0 P1s
  to 5 in testing. The group median does not move when one peer changes.

Need aggregation (v4.1)
  MetricPain = 0.5 x the product's FIRST need metric + 0.5 x the mean of all its need
  metrics. The first metric is the product's defining problem. A plain mean let
  strengths on secondary metrics dilute one severe, evidenced problem (a $3.4B CD
  roll-off at 34bps above benchmark scored only P2). With no first-metric reading the
  plain mean is used.

What --write does
  * Every catalogue product is evaluated.
  * Products that fail a hard gate, or score below 50 with no floor, go to
    dnrProducts[] with a mechanical reason (an existing hand-written reason for
    the same product is kept and the mechanical reason is prepended).
  * Products that pass are written to products[] with fit, pri, priority and a
    V4 `scoring` block. Narrative fields Run A already wrote (what, why, need,
    roi, talk, use, objections, contacts...) are preserved untouched.
  * A passing product with no narrative is reported as NEEDS NARRATIVE and is
    still written (with empty narrative) so the gap is visible, never hidden.
  * Retired products are removed from both lists.

The registry below is the machine-readable form of Catalogue V4 Section K3.
If the two ever disagree, fix the catalogue AND this file in the same change.
"""
import glob
import json
import os
import statistics
import sys

MODEL_VERSION = "V4"
# Fit = (0.70 × Need + 0.30 × Timing) × Readiness
# Readiness = 0.60 + 0.40 × mean(Maturity, Feasibility) / 100   (range 0.60–1.00)
# Readiness can only take points away: a ready institution with no need scores low.
W_NEED, W_TIMING, R_FLOOR, R_SPAN = 0.70, 0.30, 0.60, 0.40

DEPOSIT_TYPES = ["commercial_bank", "community_bank", "savings_institution",
                 "credit_union", "neobank", "wealth_private"]
BANK_TYPES = ["commercial_bank", "community_bank", "savings_institution"]
ALL_FI_TYPES = DEPOSIT_TYPES + ["specialty_lender", "mortgage_specialist"]
US_CA = ["US", "CA"]
# Deposit products also accept specialty lenders, but only through the retailDeposits
# segment gate (e.g. a branchless deposit bank funding a lending book).
DEP_PLUS = DEPOSIT_TYPES + ["specialty_lender"]

# --------------------------------------------------------------------------------------
# Need metrics. band order: severe(100) / moderate(80) / mild(60) / par(30) / better(10)
# kind "higher_worse": value >= t_severe -> severe ... ; "lower_worse": value <= t_severe
# Values are either derived deltas (vs benchmark median) or absolute institution figures.
# --------------------------------------------------------------------------------------
METRICS = {
    # key: (label, kind, [severe, moderate, mild, par], unit)
    "depCostVsPeer":      ("Interest-bearing deposit cost vs benchmark median", "higher_worse", [50, 25, 10, -10], "bps"),
    "marginalFundingGap": ("Marginal funding cost minus book deposit cost (management-stated)", "higher_worse", [125, 75, 40, 15], "bps"),
    "nimVsPeer":          ("NIM vs benchmark median", "lower_worse", [-50, -25, -10, 10], "bps"),
    "nibShareVsPeer":     ("Non-interest-bearing share vs benchmark median", "lower_worse", [-8, -4, -2, 2], "pts"),
    "depGrowthVsPeer":    ("Deposit growth YoY vs benchmark median", "lower_worse", [-3, -1.5, -0.5, 0.5], "pts"),
    "depGrowth":          ("Deposit growth YoY (absolute)", "lower_worse", [-3, -1, 0.5, 4], "%"),
    "nibTrend":           ("Non-interest-bearing balances YoY", "lower_worse", [-5, -2, 0, 2], "%"),
    "timeDepShare":       ("Time deposits share of deposits (CD wall proxy)", "higher_worse", [35, 25, 18, 10], "%"),
    "ldr":                ("Loan-to-deposit ratio", "higher_worse", [95, 90, 85, 75], "%"),
    "loanMinusDepGrowth": ("Loan growth minus deposit growth YoY", "higher_worse", [3, 1.5, 0.5, -0.5], "pts"),
    "loanGrowthVsPeer":   ("Loan growth YoY vs benchmark median", "lower_worse", [-2, -1, -0.5, 0.5], "pts"),
    "loanYieldVsPeer":    ("Loan yield vs benchmark median", "lower_worse", [-40, -20, -10, 10], "bps"),
    "uninsuredShare":     ("Uninsured deposits share", "higher_worse", [45, 35, 25, 15], "%"),
    "wholesaleShare":     ("Borrowings + brokered deposits / total assets", "higher_worse", [20, 12, 6, 3], "%"),
    "aociToTce":          ("AOCI loss / tangible common equity", "higher_worse", [20, 10, 5, 2], "%"),
    "effVsPeer":          ("Efficiency ratio vs benchmark median", "higher_worse", [5, 3, 1, -1], "pts"),
    "depPerBranchVsPeer": ("Deposits per branch vs benchmark median", "lower_worse", [-35, -20, -10, 10], "%"),
    "svcChargesVsPeer":   ("Deposit service charges / deposits vs benchmark median", "lower_worse", [-30, -15, -5, 5], "%"),
    "wealthFeeGrowth":    ("Wealth / trust fee growth YoY", "lower_worse", [0, 3, 6, 12], "%"),
    "wealthScale":        ("Wealth balances in scope (size of prize)", "higher_worse", [15, 8, 3, 1], "$B"),
    "sweepScale":         ("Cash sweep book (size of prize)", "higher_worse", [15, 8, 3, 1], "$B"),
}
# Categorical / flag metrics: value -> band score
FLAGS = {
    "regulatoryIrrLiquidity": ("IRR / liquidity regulatory signal", {"mra": 100, "referenced": 80, "general": 60, "none": 30}),
    "branchProgram":          ("Branch programme", {"announced": 100, "under_review": 80, "none": 30}),
    "newMarketEntry":         ("Entering markets with no deposit history", {True: 100, False: 30}),
    "cacPressure":            ("Acquisition cost pressure stated", {True: 80, False: 30}),
    "digitalPriority":        ("Digital programme is a stated priority", {True: 80, False: 30}),
    "attritionSignal":        ("Attrition / run-off called out", {True: 80, False: 30}),
    "maActivity":             ("M&A activity", {"announced_pending": 100, "integrating": 80, "signalled_appetite": 60,
                                                 "completed_integrated": 40, "ruled_out": 10, "none": 10}),
}

# --------------------------------------------------------------------------------------
# Product registry (Catalogue V4 Section K3)
# --------------------------------------------------------------------------------------
def P(name, cat, cls, **kw):
    d = dict(name=name, cat=cat, cls=cls, status="listed", url="", countries=US_CA,
             types=ALL_FI_TYPES, min_assets=None, max_assets=None, hard_min=False,
             cu_min=None, cu_max=None, required=[], required_any=[], branch_min=None,
             tiers=(1, 4), ideal=(1, 2, 3, 4), need=[], tags=[], timing=[], feas={},
             floor=None, p1_rule=None, aliases=[])
    d.update(kw)
    return d

CAT_DATA, CAT_CA, CAT_OPT, CAT_ADV, CAT_C1 = ("Intelligent Data", "Comparative Analytics",
                                              "Optimization Platform", "Advisory", "Curinos One Module")
DEP_NEED = ["depCostVsPeer", "marginalFundingGap", "nimVsPeer", "timeDepShare", "depGrowthVsPeer", "depGrowth"]
DEP_TAGS = ["grow_retail_deposits", "optimise_deposit_pricing", "reduce_funding_costs", "improve_NIM",
            "compete_on_deposits", "fund_loan_growth"]
ALM_NEED = ["wholesaleShare", "uninsuredShare", "aociToTce", "regulatoryIrrLiquidity", "ldr"]
ALM_TAGS = ["manage_IRR", "ALM_improvement", "liquidity_management", "balance_sheet_optimisation",
            "regulatory_compliance", "fund_loan_growth"]
COM_TAGS = ["grow_commercial", "treasury_management_fees", "deepen_commercial_relationships",
            "expand_business_banking"]
LEND_TAGS = ["grow_loan_book", "improve_loan_pricing", "increase_mortgage_volume",
             "small_business_lending_growth"]
DIST_TAGS = ["optimise_branch_network", "right_size_distribution", "post_MA_integration",
             "improve_efficiency_ratio", "market_expansion"]
U = "https://www.curinos.com"

REGISTRY = [
    # ---------------- Intelligent Data
    P("Pricing Data", CAT_DATA, "data", url=U + "/products/pricing-data",
      required_any=["retailDeposits", "mortgage", "homeEquity", "consumerLending", "commercial"],
      need=["depCostVsPeer", "marginalFundingGap", "nimVsPeer", "depGrowthVsPeer", "timeDepShare", "depGrowth"],
      tags=DEP_TAGS + ["improve_loan_pricing"], timing=["deposit_pricing", "funding_gap", "new_market", "lending_growth"],
      floor=("P2_if_active", None)),
    P("Commercial Data", CAT_DATA, "data", url=U + "/products/commercial-data", countries=["US"],
      types=BANK_TYPES, required=["commercial", "treasuryManagement"],
      need=["svcChargesVsPeer", "nibShareVsPeer", "depCostVsPeer"], tags=COM_TAGS,
      timing=["commercial_growth", "product_redesign"], feas={"dealPricingTool": 10}),
    # ---------------- Deposit Analyzer/Optimizer family
    P("Retail Deposit Analyzer", CAT_CA, "analyzer", status="listed_in_suite",
      url=U + "/products/retail-deposit-analyzer-optimizer-suite", types=DEP_PLUS,
      required=["retailDeposits"], min_assets=5, tiers=(2, 4), ideal=(2, 3),
      need=["depGrowthVsPeer", "depCostVsPeer", "nibShareVsPeer", "nibTrend", "depGrowth"],
      tags=DEP_TAGS, timing=["deposit_pricing", "funding_gap"], aliases=["Consumer Deposit Analyzer"]),
    P("Retail Deposit Optimizer", CAT_OPT, "optimizer", status="listed_in_suite",
      url=U + "/products/retail-deposit-analyzer-optimizer-suite", types=DEP_PLUS,
      required=["retailDeposits"], min_assets=50, hard_min=True, cu_min=30, tiers=(3, 4), ideal=(3, 4),
      need=DEP_NEED, tags=DEP_TAGS, timing=["deposit_pricing", "funding_gap"],
      aliases=["Consumer Deposit Optimizer"]),
    P("Deposit Optimizer Essentials", CAT_OPT, "essentials",
      url=U + "/who-we-help/partners/deposit-optimizer-essentials-curinos-fis",
      types=["community_bank", "commercial_bank", "savings_institution", "credit_union", "specialty_lender"],
      required=["retailDeposits"], max_assets=50, cu_max=30, tiers=(1, 3), ideal=(1, 2),
      need=DEP_NEED, tags=DEP_TAGS, timing=["deposit_pricing", "funding_gap"], feas={"fisIbsHorizon": 15}),
    P("Small Business Deposit Analyzer", CAT_CA, "analyzer", url=U + "/products/small-business-deposit-analyzer",
      types=DEPOSIT_TYPES, required=["smallBusiness"], min_assets=1, tiers=(2, 4), ideal=(2, 3),
      need=["depGrowthVsPeer", "nibShareVsPeer", "depGrowth"], tags=["expand_business_banking"] + DEP_TAGS,
      timing=["deposit_pricing", "commercial_growth"]),
    P("Commercial Analyzer", CAT_CA, "analyzer", status="listed_in_suite",
      url=U + "/products/commercial-analyzer-optimizer-suite", types=BANK_TYPES, countries=["US"],
      required=["commercial"], min_assets=10, tiers=(2, 4), ideal=(2, 3),
      need=["nibShareVsPeer", "depCostVsPeer", "svcChargesVsPeer"], tags=COM_TAGS,
      timing=["commercial_growth", "funding_gap"], feas={"dealPricingTool": 10}),
    P("Commercial Optimizer", CAT_OPT, "optimizer", status="listed_in_suite",
      url=U + "/products/commercial-analyzer-optimizer-suite", types=BANK_TYPES, countries=["US"],
      required=["commercial", "treasuryManagement"], min_assets=10, tiers=(3, 4), ideal=(3, 4),
      need=["nibShareVsPeer", "depCostVsPeer", "svcChargesVsPeer"], tags=COM_TAGS,
      timing=["commercial_growth", "funding_gap"], feas={"dealPricingTool": 10}),
    P("Treasury Management Fee Analyzer", CAT_CA, "analyzer", url=U + "/products/treasury-management-fee-analyzer",
      types=BANK_TYPES, countries=["US"], required=["treasuryManagement"], min_assets=5, tiers=(2, 4), ideal=(2, 3),
      need=["svcChargesVsPeer", "nibShareVsPeer"], tags=["treasury_management_fees", "grow_commercial"],
      timing=["commercial_growth", "product_redesign"], feas={"dealPricingTool": 10}),
    P("Wealth Analyzer", CAT_CA, "analyzer", status="listed_in_suite",
      url=U + "/products/wealth-deposit-analyzer-optimizer-suite", countries=["US"],
      types=BANK_TYPES + ["wealth_private"], required=["wealth"], min_assets=10, tiers=(2, 4), ideal=(2, 3),
      need=["wealthFeeGrowth", "wealthScale"], tags=["grow_wealth_revenue", "HNW_client_acquisition",
                                                    "deepen_wealth_relationships"],
      timing=["wealth_growth"], aliases=["Wealth Deposit Analyzer"]),
    P("Wealth Optimizer", CAT_OPT, "optimizer", status="listed_in_suite",
      url=U + "/products/wealth-deposit-analyzer-optimizer-suite", countries=["US"],
      types=BANK_TYPES + ["wealth_private"], required=["wealth"], min_assets=10, tiers=(3, 4), ideal=(3, 4),
      need=["wealthFeeGrowth", "wealthScale"], tags=["grow_wealth_revenue", "deepen_wealth_relationships"],
      timing=["wealth_growth"], aliases=["Wealth Deposit Optimizer"]),
    P("Wealth Cash Analyzer/Optimizer Suite", CAT_OPT, "analyzer", url=U + "/products/wealth-cash-analyzer-optimizer-suite",
      countries=["US"], types=["broker_dealer", "wealth_private", "commercial_bank"], required=["cashSweep"],
      tiers=(2, 4), ideal=(2, 3, 4), need=["sweepScale"], tags=["grow_wealth_revenue", "deepen_wealth_relationships"],
      timing=["wealth_growth"]),
    P("Treasury Analyzer", CAT_CA, "analyzer", url=U + "/products/treasury-analyzer", countries=["US"],
      types=DEPOSIT_TYPES + ["specialty_lender"], required=["alco"], min_assets=5, tiers=(2, 4), ideal=(2, 3, 4),
      need=ALM_NEED, tags=ALM_TAGS, timing=["alm_regulatory", "funding_gap"]),
    # ---------------- Lending
    P("LendersBenchmark Analyzer", CAT_CA, "analyzer", url=U + "/products/lenders-benchmark-suite", countries=["US"],
      required_any=["mortgage", "homeEquity", "consumerLending"], min_assets=5, tiers=(2, 4), ideal=(2, 3),
      need=["loanGrowthVsPeer", "loanYieldVsPeer"], tags=LEND_TAGS, timing=["lending_growth"],
      aliases=["LendersBenchmark Analyzer — Mortgage & Consumer", "LendersBenchmark Analyzer - Mortgage"]),
    P("LendersBenchmark Analyzer for Small Business Lending", CAT_CA, "analyzer",
      url=U + "/products/lendersbenchmark-analyzer-for-small-business-lending", countries=["US"],
      required=["sbLending"], min_assets=1, tiers=(2, 4), ideal=(2, 3),
      need=["loanGrowthVsPeer", "loanYieldVsPeer"], tags=["small_business_lending_growth", "grow_loan_book"],
      timing=["lending_growth", "commercial_growth"],
      aliases=["LendersBenchmark Analyzer — Small Business Lending", "LendersBenchmark SB Lending"]),
    P("Lenders Optimizer", CAT_OPT, "optimizer", status="unlisted", countries=["US"],
      required_any=["mortgage", "homeEquity", "consumerLending"], min_assets=5, tiers=(3, 4), ideal=(3, 4),
      need=["loanGrowthVsPeer", "loanYieldVsPeer"], tags=LEND_TAGS, timing=["lending_growth"]),
    # ---------------- Channel / distribution / marketing / digital
    P("Marketing Analyzer", CAT_CA, "analyzer", url=U + "/products/marketing-analyzer", countries=["US"],
      types=DEP_PLUS, required=["retailDeposits"], min_assets=5, tiers=(2, 4), ideal=(2, 3),
      need=["depGrowthVsPeer", "cacPressure", "depGrowth"], tags=["customer_acquisition", "marketing_efficiency",
                                                                   "grow_retail_deposits", "market_expansion"],
      timing=["marketing_plan", "new_market"]),
    P("Distribution Analyzer", CAT_CA, "analyzer", url=U + "/products/distribution-analyzer", countries=["US"],
      types=DEPOSIT_TYPES, branch_min=25, min_assets=5, tiers=(2, 4), ideal=(2, 3),
      need=["depPerBranchVsPeer", "branchProgram", "effVsPeer"], tags=DIST_TAGS, timing=["branch_program"]),
    P("Distribution Optimizer", CAT_OPT, "optimizer", url=U + "/products/distribution-optimizer", countries=US_CA,
      types=DEPOSIT_TYPES, branch_min=50, min_assets=5, tiers=(2, 4), ideal=(2, 3, 4),
      need=["depPerBranchVsPeer", "branchProgram", "effVsPeer"], tags=DIST_TAGS,
      timing=["branch_program", "new_market"], aliases=["Distribution Optimizer — US", "Distribution Optimizer - US",
                                                        "Distribution Optimizer — Canada"]),
    P("Digital Banking Analyzer", CAT_CA, "analyzer", url=U + "/products/digital-banking-analyzer",
      countries=["US", "CA", "UK"], types=DEPOSIT_TYPES + ["specialty_lender"], required=["digitalBanking"],
      min_assets=5, tiers=(2, 4), ideal=(2, 3, 4), need=["digitalPriority", "depGrowthVsPeer", "depGrowth"],
      tags=["improve_digital_engagement", "digital_acquisition", "customer_acquisition"], timing=["digital_program"]),
    P("eBenchmarkers - Banking", CAT_CA, "analyzer", url=U + "/products/ebenchmarkers-banking", countries=["UK"],
      types=DEPOSIT_TYPES + ["specialty_lender"], tiers=(1, 3), ideal=(1, 2),
      need=["depGrowthVsPeer", "depGrowth"], tags=["compete_on_deposits", "customer_acquisition"],
      timing=["deposit_pricing"], aliases=["eBenchmarkers", "eBenchmarkers Analyzer"]),
    P("Commercial Digital Analyzer", CAT_CA, "analyzer", status="unlisted", countries=["US"], types=BANK_TYPES,
      required=["commercial", "digitalBanking"], min_assets=10, tiers=(3, 4), ideal=(3, 4),
      need=["digitalPriority"], tags=COM_TAGS + ["improve_digital_engagement"], timing=["digital_program"]),
    P("Profitability Optimizer", CAT_OPT, "optimizer", status="unlisted", countries=["US"], types=DEPOSIT_TYPES,
      min_assets=5, tiers=(2, 4), ideal=(2, 3), need=["effVsPeer"], tags=["improve_efficiency_ratio",
                                                                          "right_size_distribution"],
      timing=["branch_program"]),
    # ---------------- Curinos One
    P("Curinos One Capture", CAT_C1, "platform", url=U + "/outcomes/new-relationship-acquisition", countries=US_CA,
      types=DEP_PLUS, required=["retailDeposits", "firstPartyData"], min_assets=10, tiers=(2, 4), ideal=(3, 4),
      need=["newMarketEntry", "depGrowthVsPeer", "cacPressure", "depGrowth"],
      tags=["customer_acquisition", "grow_retail_deposits", "market_expansion", "digital_acquisition"],
      timing=["new_market", "marketing_plan"], feas={"databricks": 15, "salesforce": 10}),
    P("Curinos One Compound", CAT_C1, "platform", url=U + "/outcomes/deposit-deepening", countries=US_CA,
      types=DEP_PLUS, required=["retailDeposits", "firstPartyData"], min_assets=10, tiers=(2, 4), ideal=(3, 4),
      need=["ldr", "loanMinusDepGrowth", "nibTrend", "depGrowthVsPeer", "depGrowth"],
      tags=["grow_retail_deposits", "fund_loan_growth", "deepen_relationships", "cross_sell_growth"],
      timing=["funding_gap", "deposit_pricing"], feas={"databricks": 15, "salesforce": 10}, p1_rule="compound"),
    P("Curinos One Commit", CAT_C1, "platform", status="roadmap", url=U + "/outcomes/primary-relationships",
      types=DEP_PLUS, required=["retailDeposits", "firstPartyData"], min_assets=10, tiers=(2, 4), ideal=(3, 4),
      need=["nibShareVsPeer", "nibTrend"], tags=["primacy", "deepen_relationships"], timing=["funding_gap"],
      feas={"databricks": 15, "salesforce": 10}),
    P("Curinos One Conserve", CAT_C1, "platform", status="roadmap", url=U + "/outcomes/customer-retention",
      types=DEP_PLUS, required=["retailDeposits", "firstPartyData"], min_assets=10, tiers=(2, 4), ideal=(3, 4),
      need=["attritionSignal", "depGrowthVsPeer", "depGrowth"], tags=["member_retention", "customer_retention"],
      timing=["deposit_pricing"], feas={"databricks": 15, "salesforce": 10}),
    P("Curinos One Calibrate", CAT_C1, "platform", status="roadmap", url=U + "/outcomes/yield-optimization",
      types=DEP_PLUS, required=["retailDeposits", "firstPartyData"], min_assets=10, tiers=(2, 4), ideal=(3, 4),
      need=["nimVsPeer", "depCostVsPeer"], tags=["improve_NIM", "optimise_deposit_pricing"],
      timing=["deposit_pricing"], feas={"databricks": 15, "salesforce": 10}),
    # ---------------- Advisory (all at curinos.com/advisory-solutions)
    P("Advisory: Pricing Strategy & Optimization", CAT_ADV, "advisory", url=U + "/advisory-solutions",
      need=["depCostVsPeer", "marginalFundingGap", "nimVsPeer", "timeDepShare", "depGrowth"],
      tags=["pricing_strategy_refresh", "NIM_recovery", "CD_maturity_management"] + DEP_TAGS,
      timing=["deposit_pricing", "funding_gap"], floor=("P3", None)),
    P("Advisory: Treasury & Balance Sheet Management", CAT_ADV, "advisory", url=U + "/advisory-solutions",
      required=["alco"], need=ALM_NEED, tags=ALM_TAGS, timing=["alm_regulatory", "funding_gap"],
      floor=("P3", "alco")),
    P("Advisory: Value Proposition", CAT_ADV, "advisory", url=U + "/advisory-solutions",
      need=["depGrowthVsPeer", "newMarketEntry", "depGrowth"], tags=["rebrand", "repositioning", "market_expansion"],
      timing=["new_market", "ma_integration", "product_redesign"]),
    P("Advisory: Market Playbook", CAT_ADV, "advisory", url=U + "/advisory-solutions", required=["multiMarket"],
      need=["newMarketEntry", "depGrowthVsPeer", "depGrowth"], tags=["market_expansion", "post_MA_integration"],
      timing=["new_market", "ma_integration"]),
    P("Advisory: Product Design", CAT_ADV, "advisory", url=U + "/advisory-solutions",
      need=["nibShareVsPeer", "svcChargesVsPeer", "nibTrend"], tags=["product_redesign", "fee_optimisation"],
      timing=["product_redesign"]),
    P("Advisory: Network Optimization", CAT_ADV, "advisory", url=U + "/advisory-solutions", branch_min=50,
      min_assets=5, need=["branchProgram", "depPerBranchVsPeer", "effVsPeer"], tags=DIST_TAGS,
      timing=["branch_program", "new_market"]),
    P("Advisory: M&A Support", CAT_ADV, "advisory", url=U + "/advisory-solutions", required=["maRelevant"],
      need=["maActivity"], tags=["post_merger_integration", "deposit_harmonisation", "acquisition_strategy"],
      timing=["ma_integration"]),
    P("Advisory: Commercial Strategy", CAT_ADV, "advisory", url=U + "/advisory-solutions", types=BANK_TYPES,
      required=["commercial"], min_assets=5, need=["svcChargesVsPeer", "nibShareVsPeer"], tags=COM_TAGS,
      timing=["commercial_growth"]),
    P("Advisory: Marketing Investment Planning", CAT_ADV, "advisory", url=U + "/advisory-solutions",
      required=["retailDeposits"], min_assets=5, need=["cacPressure", "depGrowthVsPeer", "depGrowth"],
      tags=["customer_acquisition", "marketing_efficiency", "market_expansion"], timing=["marketing_plan", "new_market"]),
]
RETIRED = {
    "Amplero Personalization Optimizer": "Retired as a standalone product — curinos.com/amplero-personalization-optimizer/ "
                                         "now redirects to the Curinos One Compound page. Score Curinos One instead.",
    "Treasury Strategies": "Corporate (buy-side) treasury consulting, no longer on curinos.com; only NDepth remains. "
                           "Never an FI product — omit from every Product Fit tab.",
}
BY_NAME = {}
for _p in REGISTRY:
    BY_NAME[_p["name"].lower()] = _p
    for _a in _p["aliases"]:
        BY_NAME[_a.lower()] = _p


def canonical(name):
    p = BY_NAME.get(str(name).strip().lower())
    return p["name"] if p else None


# --------------------------------------------------------------------------------------
def _med(xs):
    xs = [x for x in (xs or []) if isinstance(x, (int, float))]
    return statistics.median(xs) if len(xs) >= 2 else None


BENCH = {}          # scoringKey -> group median, filled by load_benchmark()
BENCH_FILE = None


def load_benchmark(path=None):
    """Load the group benchmark. Returns the file used, or None."""
    global BENCH, BENCH_FILE
    BENCH, BENCH_FILE = {}, None
    cands = [path] if path else sorted(
        glob.glob("bank-benchmark-*.json") +
        glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "bank-benchmark-*.json")))
    for c in reversed(cands):
        try:
            d = json.load(open(c))
            BENCH = {m["scoringKey"]: m["median"] for m in d["metrics"].values()
                     if m.get("scoringKey") and isinstance(m.get("median"), (int, float))}
            BENCH_FILE = c
            return c
        except (OSError, ValueError, KeyError, TypeError):
            continue
    return None


def derive(inp):
    """Turn raw scoringInputs.metrics into the METRICS keys. Peer figures must be a
    list of >= 2 sourced peer values; fewer and the vs-peer metric is unavailable."""
    m = inp.get("metrics", {}) or {}
    out = {}

    def pair(val_key, peer_key, scale=1.0, pct=False):
        v = m.get(val_key)
        # Group benchmark first (banks only); sourced peer median is the fallback.
        pm = BENCH.get(val_key) if (BENCH and inp.get("type") != "credit_union") else None
        if pm is None:
            pm = _med(m.get(peer_key))
        if not isinstance(v, (int, float)) or pm is None:
            return None
        if pct:
            return (v - pm) / pm * 100 if pm else None
        return (v - pm) * scale

    out["depCostVsPeer"] = pair("ibDepositCostPct", "peerIbDepositCostPct", 100)
    out["nimVsPeer"] = pair("nimPct", "peerNimPct", 100)
    out["nibShareVsPeer"] = pair("nibSharePct", "peerNibSharePct")
    out["depGrowthVsPeer"] = pair("depositGrowthPct", "peerDepositGrowthPct")
    out["loanGrowthVsPeer"] = pair("loanGrowthPct", "peerLoanGrowthPct")
    out["loanYieldVsPeer"] = pair("loanYieldPct", "peerLoanYieldPct", 100)
    out["effVsPeer"] = pair("efficiencyPct", "peerEfficiencyPct")
    out["depPerBranchVsPeer"] = pair("depositsPerBranchM", "peerDepositsPerBranchM", pct=True)
    out["svcChargesVsPeer"] = pair("serviceChargesToDepositsBps", "peerServiceChargesToDepositsBps", pct=True)
    for src, dst in (("depositGrowthPct", "depGrowth"), ("nibGrowthPct", "nibTrend"),
                     ("timeDepositSharePct", "timeDepShare"), ("ldrPct", "ldr"),
                     ("uninsuredSharePct", "uninsuredShare"), ("wholesaleFundingPct", "wholesaleShare"),
                     ("aociToTcePct", "aociToTce"), ("wealthFeeGrowthPct", "wealthFeeGrowth"),
                     ("wealthBalancesB", "wealthScale"), ("sweepBookB", "sweepScale")):
        v = m.get(src)
        out[dst] = v if isinstance(v, (int, float)) else None
    lg, dg = m.get("loanGrowthPct"), m.get("depositGrowthPct")
    mf, bk = m.get("marginalFundingCostPct"), m.get("bookDepositCostPct")
    out["marginalFundingGap"] = (mf - bk) * 100 if isinstance(mf, (int, float)) and isinstance(bk, (int, float)) else None
    out["loanMinusDepGrowth"] = (lg - dg) if isinstance(lg, (int, float)) and isinstance(dg, (int, float)) else None
    for k in FLAGS:
        v = (inp.get("flags") or {}).get(k)
        out[k] = v
    return out


def band(key, v):
    if v is None:
        return None
    if key in FLAGS:
        return FLAGS[key][1].get(v)
    _, kind, t, _ = METRICS[key]
    if kind == "higher_worse":
        return 100 if v >= t[0] else 80 if v >= t[1] else 60 if v >= t[2] else 30 if v > t[3] else 10
    return 100 if v <= t[0] else 80 if v <= t[1] else 60 if v <= t[2] else 30 if v < t[3] else 10


def label(key):
    return FLAGS[key][0] if key in FLAGS else METRICS[key][0]


def fmt(key, v):
    if key in FLAGS:
        return str(v)
    unit = METRICS[key][3]
    return f"{v:+.1f}{unit}" if "Vs" in key or key in ("loanMinusDepGrowth", "nibTrend", "depGrowth",
                                                          "wealthFeeGrowth") else f"{v:.1f}{unit}"


# --------------------------------------------------------------------------------------
def score_product(p, inp, D):
    seg = inp.get("segments", {}) or {}
    tech = inp.get("techStack", {}) or {}
    typ, country = inp.get("type"), inp.get("country", "US")
    # assetsB / tier are validated in score_all(); never default them here. A
    # present-but-null key defeats .get(k, default) (the default only fires when
    # the key is absent), which used to crash on float(None) / int(None).
    assets, tier = float(inp["assetsB"]), int(inp["tier"])
    r = dict(name=p["name"], cat=p["cat"], url=p["url"], status=p["status"], gates=[], caps=[], notes=[])

    def fail(msg):
        r["gates"].append(msg)

    # ---- Stage 1: hard gates
    if country not in p["countries"]:
        fail(f"Geography: {p['name']} is sold in {'/'.join(p['countries'])}; institution is {country}")
    if typ not in p["types"]:
        fail(f"Institution type '{typ}' is not a supported type for this product")
    cu = typ == "credit_union"
    mn = p["cu_min"] if (cu and p["cu_min"] is not None) else p["min_assets"]
    mx = p["cu_max"] if (cu and p["cu_max"] is not None) else p["max_assets"]
    below_min = False
    if mn is not None and assets < mn:
        if p["hard_min"] or assets < 0.5 * mn:
            fail(f"Size: ${assets:.1f}B is below the ${mn:g}B floor")
        else:
            below_min = True
    if mx is not None and assets >= mx:
        fail(f"Size: ${assets:.1f}B is at or above the ${mx:g}B ceiling")
    unknown = []
    for s in p["required"]:
        v = seg.get(s)
        if v is False:
            fail(f"Segment/function absent: {s}")
        elif v is None:
            unknown.append(s)
    if p["required_any"]:
        vals = [seg.get(s) for s in p["required_any"]]
        if all(v is False for v in vals):
            fail(f"None of the required segments present: {', '.join(p['required_any'])}")
        elif not any(v is True for v in vals):
            unknown.append("/".join(p["required_any"]))
    if p["branch_min"]:
        br, brmin = inp.get("branches"), inp.get("branchesMin")
        if isinstance(br, (int, float)):
            if br < p["branch_min"]:
                fail(f"Branches: {int(br)} is below the {p['branch_min']}-branch gate")
        elif isinstance(brmin, (int, float)) and brmin >= p["branch_min"]:
            r["notes"].append(f"Branch gate met on sourced lower bound (≥{int(brmin)}), exact count unsourced")
        else:
            unknown.append(f"branch count (gate {p['branch_min']})")
    lo, hi = p["tiers"]
    if tier <= lo - 2:
        fail(f"Maturity: Tier {tier} is two or more tiers below the Tier {lo} minimum")
    if r["gates"]:
        r.update(pri=0, fit=None, priority="DNR")
        return r

    # ---- Stage 2: dimensions
    parts, rationale = [], []
    for k in p["need"]:
        b = band(k, D.get(k))
        if b is not None:
            parts.append(b)
            rationale.append(f"{label(k)} {fmt(k, D[k])} → {b}")
    if parts:
        mean_pain = sum(parts) / len(parts)
        first = band(p["need"][0], D.get(p["need"][0])) if p["need"] else None
        pain = mean_pain if first is None else 0.5 * first + 0.5 * mean_pain
    else:
        pain = 30
        r["notes"].append("No need metric available — MetricPain defaulted to 30 (par)")
        rationale.append("no metric available (default 30)")
    tags = set(inp.get("statedPriorities") or [])
    hits = sorted(tags.intersection(p["tags"]))
    stated = 100 if len(hits) >= 2 else 70 if len(hits) == 1 else 10
    need = 0.7 * pain + 0.3 * stated
    primary = p["need"][0] if p["need"] else None
    if primary and band(primary, D.get(primary)) == 10 and need > 40:
        need = 40
        r["caps"].append(f"Benchmark cap: institution already leads peers on {label(primary).lower()} — NeedFit capped at 40")
    painR = "; ".join(rationale) + f". MetricPain {pain:.0f} (50% first metric, 50% mean). Stated priorities matched: " + \
            (", ".join(hits) if hits else "none") + f" → {stated}. NeedFit = 0.7×{pain:.0f} + 0.3×{stated}"

    best, bestR = 20, "No dated catalyst for this product's themes → 20"
    for c in inp.get("catalysts") or []:
        if c.get("theme") not in p["timing"]:
            continue
        mo = c.get("monthsOut")
        s = 40 if mo is None else 100 if mo <= 6 else 80 if mo <= 12 else 60 if mo <= 18 else 30
        if s > best:
            best, bestR = s, f"{c.get('desc', c['theme'])} ({'undated' if mo is None else f'~{mo} months'}) → {s}"
    timing = best

    ideal = p["ideal"]
    if tier in ideal:
        mat, matR = 100, f"Tier {tier} is an ideal tier ({'/'.join(map(str, ideal))})"
    elif lo <= tier <= hi:
        mat, matR = 75, f"Tier {tier} within range {lo}–{hi} but not ideal"
    elif tier < lo:
        mat, matR = 45, f"Tier {tier} is one below the Tier {lo} minimum — delivery support required"
    else:
        mat, matR = 40, f"Tier {tier} is above the Tier {hi} maximum — product likely underpowered"

    if p["cls"] in ("advisory", "data"):
        feas, fr = 100, ["light-footprint product (base 100)"]
    else:
        feas = 90 if tier in ideal else 70 if lo <= tier <= hi else 70 if tier > hi else 40
        fr = [f"maturity base {feas}"]
        if tech.get("coreConversionActive"):
            feas -= 25; fr.append("core conversion in flight −25")
        if seg.get("maIntegrationActive"):
            feas -= 10; fr.append("M&A integration in flight −10")
        if p["cls"] == "platform" and tech.get("fragmentedDataPostMerger"):
            feas -= 15; fr.append("customer data fragmented post-merger −15")
        if p["cls"] in ("optimizer", "platform") and tech.get("employeesUnder200"):
            feas -= 20; fr.append("<200 employees −20")
    for k, b in p["feas"].items():
        if tech.get(k):
            feas += b; fr.append(f"{k} +{b}")
    if tech.get("existingCurinosClient"):
        feas += 10; fr.append("existing Curinos client +10")
    if below_min:
        feas -= 15; fr.append(f"below the ${mn:g}B guide floor −15")
    feas = max(20, min(100, feas))

    readiness = R_FLOOR + R_SPAN * (mat + feas) / 200
    fit = round((W_NEED * need + W_TIMING * timing) * readiness)

    # ---- Stage 3/4: priority table, caps, floors
    if fit >= 75 and need >= 70 and timing >= 60:
        pri = 1
    elif fit >= 60:
        pri = 2
    elif fit >= 50:
        pri = 3
    else:
        pri = 0
    if pri == 1 and p["p1_rule"] == "compound":
        ldr, gap = D.get("ldr"), D.get("loanMinusDepGrowth")
        guided = (inp.get("guidance") or {}).get("loansOutgrowDeposits") is True
        ok = isinstance(ldr, (int, float)) and ldr >= 90 and ((isinstance(gap, (int, float)) and gap > 0) or guided)
        if not ok:
            pri = 2
            r["caps"].append("Compound P1 trigger not met (needs LDR ≥ 90% AND loans outgrowing deposits) — held at P2")
    if unknown:
        r["caps"].append("Unknown ≠ absent: unconfirmed " + ", ".join(unknown) + " — capped at P3, gap stated")
    if p["status"] == "roadmap":
        r["caps"].append("Roadmap module (COMING SOON) — capped at P3, never presented as available")
    if p["status"] == "unlisted":
        r["caps"].append("Not listed on curinos.com — capped at P3 until Product confirms availability")
    if (unknown or p["status"] in ("roadmap", "unlisted")) and pri in (1, 2):
        pri = 3
    fl = p["floor"]
    if fl:
        active = any(seg.get(s) for s in ("retailDeposits", "mortgage", "homeEquity", "consumerLending", "commercial"))
        if fl[0] == "P2_if_active" and active and (pri == 0 or pri > 2):
            pri = 2; r["caps"].append("Floor: Pricing Data is never below P2 for a deposit- or lending-active institution")
        if fl[0] == "P3" and fl[1] is None and pri == 0:
            pri = 3; r["caps"].append("Floor: Advisory Pricing Strategy is never Do Not Recommend")
        if fl[0] == "P3" and fl[1] == "alco" and seg.get("alco") and pri == 0:
            pri = 3; r["caps"].append("Floor: Advisory T&BS is never Do Not Recommend where ALCO exists")
    if pri == 0:
        r["gates"].append(f"Score {fit} is below the 50 recommendation floor")

    r.update(fit=fit, pri=pri, priority=f"P{pri}" if pri else "DNR", need=round(need), timing=timing,
             maturity=mat, feasibility=feas, painRationale=painR, timingRationale=bestR, matRationale=matR,
             feasRationale="; ".join(fr) + f" → {feas}",
             readiness=round(readiness, 3),
             formula=f"(0.70×{need:.0f} + 0.30×{timing}) × readiness {readiness:.3f} "
                     f"[0.60 + 0.40×mean({mat},{feas})/100] = {fit}")
    if p["name"] in (inp.get("ownedProducts") or []):
        r["notes"].append("Already owned — present as Expand / Renew, not a new sale")
    return r


def validate(inp):
    """Fail loudly on inputs every product depends on. Silently defaulting a missing
    tier to 2 or assets to 0 would score every product against the wrong institution."""
    bad = []
    for k in ("assetsB", "tier"):
        v = inp.get(k)
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            bad.append(f"{k}={v!r}")
    if bad:
        sys.exit("ERROR: scoringInputs must carry numeric assetsB and tier (got "
                 + ", ".join(bad) + ") — see Catalogue V4 Section K2.")


def score_all(inp):
    validate(inp)
    D = derive(inp)
    return [score_product(p, inp, D) for p in REGISTRY], D


# --------------------------------------------------------------------------------------
NARR = ("what", "why", "need", "roi", "talk", "use", "objections")


def write_back(intel, results):
    existing = {}
    for p in intel.get("products", []) or []:
        existing[canonical(p.get("name")) or p.get("name")] = p
    old_dnr = {}
    for x in intel.get("dnrProducts", []) or []:
        old_dnr[canonical(x.get("name")) or x.get("name")] = x.get("reason", "")
    products, dnr, needs_narr = [], [], []
    for r in results:
        if r["pri"] == 0:
            reason = " · ".join(r["gates"])
            if old_dnr.get(r["name"]):
                reason += " — " + old_dnr[r["name"]]
            dnr.append({"name": r["name"], "reason": reason})
            continue
        p = dict(existing.get(r["name"], {}))
        p["name"], p["cat"], p["fit"], p["pri"], p["priority"] = r["name"], r["cat"], r["fit"], r["pri"], r["priority"]
        p.setdefault("url", r["url"])
        p["scoring"] = {
            "modelVersion": MODEL_VERSION, "need": r["need"], "timing": r["timing"], "maturity": r["maturity"],
            "feasibility": r["feasibility"], "readiness": r["readiness"], "painRationale": r["painRationale"],
            "timingRationale": r["timingRationale"], "matRationale": r["matRationale"],
            "feasRationale": r["feasRationale"], "gateRationale": "All hard gates passed" +
            ("; " + "; ".join(r["notes"]) if r["notes"] else ""), "caps": "; ".join(r["caps"]),
            "formula": r["formula"]}
        p.pop("fitBreakdown", None)
        if r["status"] == "roadmap":
            p["roadmap"] = True
        if r["status"] == "unlisted":
            p["availabilityUnconfirmed"] = True
        if not all(p.get(k) for k in NARR):
            needs_narr.append(r["name"])
        products.append(p)
    products.sort(key=lambda p: (p["pri"], -p["fit"]))
    intel["products"], intel["dnrProducts"] = products, dnr
    intel["productScoringNote"] = (
        "Scored mechanically by score_v4.py (Catalogue V4, Section K). Hard gates first — any failure is Do Not "
        "Recommend. Fit = (0.70 × Need + 0.30 × Timing) × Readiness, where Readiness (0.60–1.00) comes from Maturity and "
        "Feasibility and can only remove points. P1 needs Fit ≥75, "
        "Need ≥70 and Timing ≥60; P2 ≥60; P3 ≥50; below 50 is Do Not Recommend. Roadmap, unlisted and unconfirmed-input products are capped at P3. "
        + ("Vs-peer metrics are measured against the median of a full bank group (" + BENCH_FILE + ")." if BENCH_FILE and intel.get("scoringInputs", {}).get("type") != "credit_union"
           else "Vs-peer metrics are measured against the median of the sourced peers."))
    return needs_narr


def table(results):
    rows = ["| Product | Pri | Fit | Need | Timing | Maturity | Feas | Gate / cap |",
            "|---|---|---|---|---|---|---|---|"]
    for r in sorted(results, key=lambda r: (r["pri"] or 9, -(r["fit"] or 0))):
        if r["fit"] is None:
            rows.append(f"| {r['name']} | DNR | – | – | – | – | – | {' · '.join(r['gates'])} |")
        else:
            why = " · ".join(r["caps"] + (r["gates"] if r["pri"] == 0 else []))
            rows.append(f"| {r['name']} | {r['priority']} | {r['fit']} | {r['need']} | {r['timing']} | "
                        f"{r['maturity']} | {r['feasibility']} | {why} |")
    return "\n".join(rows)


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    path = sys.argv[1]
    intel = json.load(open(path))
    inp = intel.get("scoringInputs")
    if not inp:
        sys.exit("ERROR: intel JSON has no scoringInputs block — see Catalogue V4 Section K2.")
    bpath = sys.argv[sys.argv.index("--benchmark") + 1] if "--benchmark" in sys.argv else None
    used = None if "--no-benchmark" in sys.argv else load_benchmark(bpath)
    print(f"Benchmark: {used or 'none — using sourced peer medians'}")
    results, D = score_all(inp)
    print(table(results))
    counts = {k: sum(1 for r in results if r["priority"] == k) for k in ("P1", "P2", "P3", "DNR")}
    print(f"\nSpread: {counts}")
    if "--report" in sys.argv:
        out = sys.argv[sys.argv.index("--report") + 1]
        with open(out, "w") as f:
            f.write(f"# V4 scoring — {intel.get('meta', {}).get('institution', path)}\n\n")
            f.write("## Derived metrics\n\n" + "\n".join(
                f"- {label(k)}: {fmt(k, v)}" for k, v in D.items() if v is not None) + "\n\n")
            f.write("## Scores\n\n" + table(results) + "\n")
        print(f"Report written: {out}")
    if "--write" in sys.argv:
        missing = write_back(intel, results)
        json.dump(intel, open(path, "w"), indent=1, ensure_ascii=False)
        print(f"Written: {path}")
        for n in RETIRED:
            print(f"  retired, not scored: {n}")
        if missing:
            print("NEEDS NARRATIVE (scored P1–P3 but what/why/need/roi/talk/use/objections incomplete):")
            for n in missing:
                print(f"  - {n}")
            sys.exit(2)


if __name__ == "__main__":
    main()
