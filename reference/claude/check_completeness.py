#!/usr/bin/env python3
"""Completeness gate for a Curinos intel JSON (Run A, before saving).

Usage: python3 check_completeness.py intel.json
Exit 0 = every check passed. Exit 1 = prints each failing check with WHERE TO LOOK.

Why this exists: from mid-September the scheduled dashboards thinned out to
roughly half the content of the August builds (35-46k narrative characters vs
73-87k, 14-40 "not captured" placeholders vs 0-3, no analyst ratings, no
technology platforms). Every Run A row read "15/15 calls": the research budget
was exhausted every time. This gate makes thinness visible before save, and
tells the run exactly which source fills each hole. Thresholds are calibrated
on the August Cullen/Frost and SouthState builds, which pass.

A failing check is NOT a licence to estimate. Fill it from a source, or leave
it and list it in dataGaps. Never invent a value to pass the gate.
"""
import json, re, sys

GAP = re.compile(r"not (captured|confirmed|disclosed|found|evidenced|available)"
                 r"|unavailable|registry lookup incomplete", re.I)
DIGIT = re.compile(r"\d")
SKIP_KEYS = {"products", "dnrProducts", "scoringInputs", "productScoringNote", "dataGaps"}


def walk(o, out):
    if isinstance(o, dict):
        for v in o.values():
            walk(v, out)
    elif isinstance(o, list):
        for v in o:
            walk(v, out)
    elif isinstance(o, str):
        out.append(o)


def has_value(v):
    return isinstance(v, (int, float)) or (isinstance(v, str) and DIGIT.search(v) and not GAP.search(v))


def run(d):
    res = []

    def check(name, ok, detail, where):
        res.append((name, bool(ok), detail, where))

    b, sb = d.get("basic", {}), d.get("structure", {}).get("bank", {}) or {}
    reg = {"basic.fdic": b.get("fdic"), "structure.bank.rssd": sb.get("rssd"),
           "basic.employees": b.get("employees"), "basic.est": b.get("est")}
    miss = [k for k, v in reg.items() if not has_value(v)]
    check("Registry fields", not miss, "missing: " + ", ".join(miss) if miss else "ok",
          "WebSearch `site:fdic.gov bankfind \"<bank legal name>\"` -> details/[CERT] page (cert, est, bank RSSD); "
          "FTE from the 10-K Item 1 'Human Capital' or the FDIC call report; HC RSSD from ffiec.gov NIC")

    ch = d.get("charts", {})
    nq = min(len(ch.get("balanceSheet", {}).get("labels", [])), len(ch.get("revenue", {}).get("labels", [])))
    check("Quarterly history", nq >= 6, f"{nq} quarters (need 6+)",
          "the latest release carries 5 quarters; the year-ago release or the financial supplement adds 3-4 more")

    m = d.get("metrics", [])
    nsrc = sum(1 for x in m if (x.get("t") or {}).get("src"))
    check("Metric cards", len(m) >= 8 and nsrc == len(m), f"{len(m)} cards, {nsrc} with t.src (need 8+, all sourced)",
          "earnings release highlights + the 10-Q")

    nii = (d.get("finOverview") or {}).get("niiSensitivity") or {}
    check("NII rate sensitivity", has_value(nii.get("upValue")) and has_value(nii.get("downValue")),
          f"up={nii.get('upValue')!r} down={nii.get('downValue')!r}",
          "10-Q Item 3 / 10-K Item 7A 'Quantitative and Qualitative Disclosures About Market Risk' - NII sensitivity table (+/-100 or 200bp; restate per 25bp only if the filing does)")

    ex = (d.get("contacts") or {}).get("execs", [])
    dated = sum(1 for e in ex if re.search(r"(19|20)\d\d", str(e.get("since", ""))))
    check("Executives", len(ex) >= 4 and dated >= 3, f"{len(ex)} execs, {dated} with a start year (need 4+, 3+ dated)",
          "the bank's leadership/investor page and the latest DEF 14A proxy: CEO, CFO, Treasurer/CRO, heads of consumer, commercial, technology")

    segs = d.get("businessSegments", [])
    heads = sum(1 for s in segs if s.get("head") and not GAP.search(str(s["head"])))
    check("Business segments", len(segs) >= 3 and heads >= 2, f"{len(segs)} segments, {heads} with a named head",
          "10-K segment note + leadership page")

    ar = (d.get("news") or {}).get("analystRatings", [])
    real = [a for a in ar if has_value(a.get("target")) and a.get("rating") and not GAP.search(str(a.get("rating")))]
    check("Analyst ratings", len(real) >= 3, f"{len(real)} ratings with rating + target (need 3+)",
          "one WebSearch `<ticker> price target analyst rating <month year>` - MarketBeat, TipRanks, or rating-change news")

    tp = d.get("techPlatforms", [])
    check("Technology platforms", len(tp) >= 3, f"{len(tp)} platforms (need 3+)",
          "WebSearch `\"<bank name>\" core banking OR digital banking OR selects OR partners vendor` - vendor press releases (FIS, Fiserv, Jack Henry, Q2, Alkami, nCino, Salesforce), American Banker / Banking Dive, careers pages")

    news = d.get("news") or {}
    ni, na = len(news.get("items", [])), len(news.get("articles", []))
    check("News coverage", ni >= 6 and na >= 5, f"{ni} items, {na} articles (need 6+/5+)",
          "WebSearch `\"<bank name>\" news` for the last 90 days - deals, leadership changes, product launches, branch moves, not only earnings")

    peers = d.get("peers") or {}
    rows = next((v for v in peers.values() if isinstance(v, list) and v and isinstance(v[0], dict) and "n" in v[0]), [])
    full = sum(1 for r in rows[1:] if sum(isinstance(r.get(k), (int, float)) for k in ("a", "cet1", "roaa", "nim", "eff", "dep_cost")) >= 5)
    check("Peer table", full >= 3, f"{full} peers with 5+ numeric metrics (need 3+)",
          "each peer's own same-quarter earnings release (SEC 8-K Ex.99.1)")

    urls = {s.get("url") or s.get("u") for s in d.get("sources", []) if isinstance(s, dict)}
    urls.discard(None)
    check("Distinct sources", len(urls) >= 12, f"{len(urls)} distinct source URLs (need 12+)",
          "cite every document actually used: release, call, 10-Q, 10-K, proxy, investor deck, leadership page, news, ratings, vendor releases")

    liq = d.get("liquidity") or {}
    unins = (d.get("scoringInputs") or {}).get("metrics", {}).get("uninsuredSharePct")
    check("Liquidity", len(liq.get("kpis", [])) >= 4 and unins is not None,
          f"{len(liq.get('kpis', []))} KPIs, uninsuredSharePct={unins!r} (need 4+ KPIs and uninsured share)",
          "10-Q MD&A 'Liquidity' and 'Deposits' sections - uninsured deposits, available liquidity, borrowing capacity, AOCI")

    depth = [len(d.get("strategyPillars", [])) >= 4, len(d.get("decisionIntelligence", [])) >= 4,
             all(len((d.get("swot") or {}).get(k, [])) >= 3 for k in ("strengths", "weaknesses", "opportunities", "threats"))]
    check("Strategy depth", all(depth), f"pillars/decisionIntel/swot ok = {depth}",
          "investor presentation + call transcript prepared remarks")

    strs = []
    walk({k: v for k, v in d.items() if k not in SKIP_KEYS}, strs)
    gaps = sum(1 for s in strs if GAP.search(s))
    chars = sum(len(s) for s in strs)
    check("Placeholder count", gaps <= 8, f"{gaps} 'not captured/disclosed' strings (max 8)",
          "each placeholder is a research step not taken - see the checks above for the source")
    check("Narrative volume", chars >= 55000, f"{chars:,} narrative characters (min 55,000; August builds 73-87k)",
          "thin text usually means thin sources - add the 10-Q, investor deck and news before writing more words")
    return res


def main():
    d = json.load(open(sys.argv[1]))
    res = run(d)
    fails = [r for r in res if not r[1]]
    for name, ok, detail, where in res:
        print(f"{'PASS' if ok else 'FAIL'}  {name:22} {detail}")
        if not ok:
            print(f"      where to look: {where}")
    print(f"\nCOMPLETENESS: {len(res) - len(fails)}/{len(res)} checks passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
