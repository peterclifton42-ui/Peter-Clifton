#!/usr/bin/env python3
"""Load comparable quarterly figures from regulatory filings into the app.

    python3 pipeline/regulatory.py            # needs SUPABASE_SECRET_KEY
    python3 pipeline/regulatory.py --dry-run  # print, don't write

Banks: the FDIC BankFind API (call reports). A holding company's figures are the
sum of every active bank charter it owns, so Wintrust's 16 charters count as one.
Ratios are weighted the way the FDIC computes them (NIM by earning assets,
efficiency by revenue, ROA by assets), so a one-charter bank matches BankFind.

Credit unions: NCUA's quarterly 5300 call report files. NIM is net interest
income over total assets, as NCUA reports it; deposit cost is dividends plus
interest on deposits over shares and deposits.

Income figures are year to date in both filings and are annualised. Which
institution is which filing lives in pipeline/regulatory-ids.csv.
"""
import argparse
import csv
import datetime
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
QUARTERS = 9  # eight to chart, plus a year earlier for deposit growth on the latest five
FDIC = "https://api.fdic.gov/banks"
NCUA_ZIP = "https://ncua.gov/files/publications/analysis/call-report-data-{y}-{m:02d}.zip"
UA = {"User-Agent": "Bank Intelligence regulatory loader"}


def get_json(url, params):
    with urllib.request.urlopen(urllib.request.Request(url + "?" + urllib.parse.urlencode(params), headers=UA), timeout=120) as r:
        return json.load(r)


def fdic_rows(endpoint, filters, fields, sort=None):
    params = {"filters": filters, "fields": fields, "limit": 10000}
    if sort:
        params.update(sort_by=sort, sort_order="DESC")
    return [x["data"] for x in get_json(f"{FDIC}/{endpoint}", params)["data"]]


def quarter_ends(n, latest=None):
    d = latest or datetime.date.today()
    y, q = d.year, (d.month - 1) // 3  # last completed quarter
    if q == 0:
        y, q = y - 1, 4
    out = []
    for _ in range(n):
        out.append((y, q * 3))
        y, q = (y - 1, 4) if q == 1 else (y, q - 1)
    return out


def period(y, m):
    return datetime.date(y, m, 31 if m in (3, 12) else 30).isoformat()


def pct(num, den):
    return round(100 * num / den, 4) if den else None


def growth(rows):
    by = {r["period"]: r for r in rows}
    for r in rows:
        d = datetime.date.fromisoformat(r["period"])
        prev = by.get(period(d.year - 1, d.month))
        r["deposit_growth"] = round(100 * (r["deposits_b"] / prev["deposits_b"] - 1), 4) if prev and prev["deposits_b"] else None
    return rows


# ---- Banks

def load_banks(ids, start):
    """ids: {slug: cert}. Returns (metric rows, entity rows)."""
    lead = {str(x["CERT"]): x for x in fdic_rows("institutions", f"CERT:({' OR '.join(ids.values())})", "CERT,NAME,RSSDHCR,NAMEHCR,ACTIVE")}
    groups = {}
    for slug, cert in ids.items():
        inst = lead.get(cert)
        if not inst:
            print(f"  ! {slug}: FDIC certificate {cert} not found", file=sys.stderr)
            continue
        if inst.get("RSSDHCR"):
            members = fdic_rows("institutions", f"RSSDHCR:{inst['RSSDHCR']} AND ACTIVE:1", "CERT,NAME")
        else:
            members = [inst]
        groups[slug] = {"members": members, "hc": inst.get("NAMEHCR") or None}

    certs = sorted({str(m["CERT"]) for g in groups.values() for m in g["members"]})
    fin = []
    for i in range(0, len(certs), 60):
        fin += fdic_rows("financials", f"CERT:({' OR '.join(certs[i:i + 60])}) AND REPDTE:[{start.replace('-', '')} TO 99999999]",
                         "CERT,REPDTE,ASSET,DEP,LNLSNET,NIMY,ERNAST,EEFFR,NIM,NONII,ROA,EDEP")
    by_cert = {}
    for f in fin:
        by_cert.setdefault(str(f["CERT"]), {})[f["REPDTE"]] = f

    metrics, entities = [], []
    for slug, g in groups.items():
        member_certs = [str(m["CERT"]) for m in g["members"]]
        entities.append({"slug": slug, "source": "fdic", "ids": member_certs,
                         "names": [m["NAME"] for m in g["members"]], "holding_company": g["hc"]})
        dates = sorted({d for c in member_certs for d in by_cert.get(c, {})})
        rows = []
        for d in dates:
            fs = [by_cert[c][d] for c in member_certs if d in by_cert.get(c, {})]
            s = lambda k: sum((f.get(k) or 0) for f in fs)
            w = lambda k, wk: (sum((f.get(k) or 0) * (f.get(wk) or 0) for f in fs) / s(wk)) if s(wk) else None
            rev = sum((f.get("NIM") or 0) + (f.get("NONII") or 0) for f in fs)
            eff = sum((f.get("EEFFR") or 0) * ((f.get("NIM") or 0) + (f.get("NONII") or 0)) for f in fs) / rev if rev else None
            annual = 12 / int(d[4:6])
            rows.append({
                "slug": slug, "period": f"{d[:4]}-{d[4:6]}-{d[6:]}", "source": "fdic",
                "assets_b": round(s("ASSET") / 1e6, 3), "deposits_b": round(s("DEP") / 1e6, 3), "loans_b": round(s("LNLSNET") / 1e6, 3),
                "nim": round(w("NIMY", "ERNAST"), 4) if w("NIMY", "ERNAST") is not None else None,
                "deposit_cost": pct(s("EDEP") * annual, s("DEP")),
                "ldr": pct(s("LNLSNET"), s("DEP")),
                "efficiency": round(eff, 4) if eff is not None else None,
                "roa": round(w("ROA", "ASSET"), 4) if w("ROA", "ASSET") is not None else None,
            })
        metrics += growth(rows)
    return metrics, entities


# ---- Credit unions

NCUA_ACCOUNTS = ["ACCT_010", "ACCT_018", "ACCT_025B", "ACCT_115", "ACCT_117", "ACCT_350", "ACCT_380", "ACCT_381", "ACCT_661A", "ACCT_671"]


def ncua_quarter(y, m, wanted):
    try:
        with urllib.request.urlopen(urllib.request.Request(NCUA_ZIP.format(y=y, m=m), headers=UA), timeout=300) as r:
            z = zipfile.ZipFile(io.BytesIO(r.read()))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    values, names = {cu: {} for cu in wanted}, {}
    for name in z.namelist():
        base = os.path.basename(name).upper()
        if not (base.startswith("FS220") or base == "FOICU.TXT"):
            continue
        reader = csv.DictReader(io.TextIOWrapper(z.open(name), encoding="latin-1"))
        for row in reader:
            row = {k.strip().upper(): v for k, v in row.items() if k}
            cu = row.get("CU_NUMBER", "").strip()
            if cu not in values:
                continue
            if base == "FOICU.TXT":
                names[cu] = row.get("CU_NAME", "").strip()
            for acct in NCUA_ACCOUNTS:
                if row.get(acct, "").strip() not in ("", None):
                    values[cu][acct] = float(row[acct])
    return values, names


def load_credit_unions(ids, quarters):
    wanted = set(ids.values())
    raw, names = {}, {}
    for y, m in quarters:
        got = ncua_quarter(y, m, wanted)
        if got is None:
            print(f"  NCUA {y}-{m:02d} not published yet", file=sys.stderr)
            continue
        raw[(y, m)], qnames = got
        names.update({k: v for k, v in qnames.items() if k not in names})
    metrics, entities = [], []
    for slug, cu in ids.items():
        entities.append({"slug": slug, "source": "ncua", "ids": [cu], "names": [names.get(cu, slug)], "holding_company": None})
        rows = []
        for (y, m), data in sorted(raw.items()):
            a = data.get(cu) or {}
            if not a.get("ACCT_010"):
                continue
            g = lambda k: a.get(k, 0.0)
            annual = 12 / m
            nii = g("ACCT_115") - g("ACCT_350")
            rows.append({
                "slug": slug, "period": period(y, m), "source": "ncua",
                "assets_b": round(g("ACCT_010") / 1e9, 3), "deposits_b": round(g("ACCT_018") / 1e9, 3), "loans_b": round(g("ACCT_025B") / 1e9, 3),
                "nim": pct(nii * annual, g("ACCT_010")),
                "deposit_cost": pct((g("ACCT_380") + g("ACCT_381")) * annual, g("ACCT_018")),
                "ldr": pct(g("ACCT_025B"), g("ACCT_018")),
                "efficiency": pct(g("ACCT_671"), nii + g("ACCT_117")),
                "roa": pct(g("ACCT_661A") * annual, g("ACCT_010")),
            })
        metrics += growth(rows)
    return metrics, entities


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    ids = {"fdic": {}, "ncua": {}}
    for r in csv.DictReader(open(os.path.join(HERE, "regulatory-ids.csv"))):
        ids[r["source"]][r["slug"]] = r["id"]

    quarters = quarter_ends(QUARTERS)
    start = period(*quarters[-1])
    bank_m, bank_e = load_banks(ids["fdic"], start)
    cu_m, cu_e = load_credit_unions(ids["ncua"], quarters)
    metrics, entities = bank_m + cu_m, bank_e + cu_e
    latest = {}
    for r in metrics:
        if r["period"] > latest.get(r["slug"], {}).get("period", ""):
            latest[r["slug"]] = r
    for slug in sorted(latest):
        r = latest[slug]
        print(f"{slug[:36]:36} {r['period']} assets {r['assets_b']:>7} NIM {r['nim']} cost {r['deposit_cost']} LDR {r['ldr']} "
              f"growth {r['deposit_growth']} eff {r['efficiency']} ROA {r['roa']}")
    print(f"{len(metrics)} quarter rows for {len(latest)} institutions")
    if args.dry_run:
        return
    sys.path.insert(0, HERE)
    import db
    db.request("POST", "regulatory_entities", entities, params={"on_conflict": "slug"}, prefer="resolution=merge-duplicates")
    for i in range(0, len(metrics), 200):
        db.request("POST", "regulatory_metrics", metrics[i:i + 200], params={"on_conflict": "slug,period"}, prefer="resolution=merge-duplicates")
    print(f"LOADED — {len(metrics)} rows")


if __name__ == "__main__":
    main()
