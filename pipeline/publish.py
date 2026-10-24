#!/usr/bin/env python3
"""Publish a researched intel JSON to the Bank Intelligence app.

    python3 pipeline/publish.py intel.json               # needs SUPABASE_SECRET_KEY
    python3 pipeline/publish.py intel.json --dry-run     # every check, no upload

Steps, each of which stops the run on failure:
  1. build_v2.py turns the intel JSON into a dashboard (its /mnt paths are
     pointed at a temporary folder; the script itself is unchanged).
  2. validate_updated_v2.py checks the dashboard. Its two known false
     positives (chart scale, the "[object Object]" match inside Chart.js) are
     ignored, exactly as Run B did; any other error stops the run.
  3. The D object is lifted back out of the dashboard and rendered in headless
     Chromium with the current page template: all 8 tabs, no script errors.
  4. The D object is uploaded through pipeline_publish(), which only the
     Supabase secret key (SUPABASE_SECRET_KEY) may call.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REF = os.path.join(ROOT, "reference")

KNOWN_FALSE_POSITIVES = ("CHART SCALE ERROR", "STRATEGY: D.strategy serialised as object")


def fail(msg):
    print(f"PUBLISH FAILED: {msg}")
    sys.exit(1)


def run_build(intel_path, work):
    project, outputs = os.path.join(work, "project"), os.path.join(work, "outputs")
    os.makedirs(project)
    os.makedirs(outputs)
    for name in ("SHELL_TOP.html", "SHELL_BOTTOM.html"):
        shutil.copy(os.path.join(REF, name), project)
    # The validator's contamination check reads the covered list from here.
    shutil.copy(os.path.join(HERE, "covered-institutions.md"), os.path.join(project, "daily-dashboard-log.md"))
    with open(intel_path) as f:
        slug = json.load(f)["meta"]["slug"]
    shutil.copy(intel_path, os.path.join(outputs, f"{slug}-intel.json"))

    def localise(src):
        return (src.replace("/mnt/project/", project + "/")
                   .replace("/mnt/user-data/outputs/", outputs + "/")
                   .replace("/mnt/skills/user/curinos-output/assets/", project + "/"))

    code = localise(open(os.path.join(REF, "build_v2.py")).read()) + "\n" + \
        localise(open(os.path.join(REF, "validate_updated_v2.py")).read())
    script = os.path.join(work, "build_and_validate.py")
    with open(script, "w") as f:
        f.write(code)
    proc = subprocess.run([sys.executable, script], cwd=work, capture_output=True, text=True)
    out = proc.stdout + proc.stderr
    print("\n".join(out.strip().splitlines()[-25:]))
    if proc.returncode != 0:
        fail("build_v2.py / validator exited with an error (see above)")
    errors = [l.strip() for l in out.splitlines() if l.strip().startswith("✗")]
    real = [e for e in errors if not any(fp in e for fp in KNOWN_FALSE_POSITIVES)]
    if real:
        fail("validator errors:\n  " + "\n  ".join(real))
    html = os.path.join(outputs, f"{slug}-curinos-dashboard.html")
    if not os.path.exists(html):
        fail(f"build did not write {html}")
    return slug, html


def node(script, *args):
    proc = subprocess.run(["node", os.path.join(HERE, script), *args], capture_output=True, text=True)
    if proc.returncode != 0:
        fail(f"{script}: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout


def ensure_playwright():
    if os.path.isdir(os.path.join(HERE, "node_modules", "playwright")):
        return
    subprocess.run(["npm", "install", "--no-save", "--silent", "playwright@1"], cwd=HERE, check=True)


def directory_row(d):
    """The institution's directory fields, derived the same way as the original load."""
    meta, basic, demo = d.get("meta", {}), d.get("basic", {}), d.get("demo", {}) or {}
    type_label = meta.get("type") or ""
    assets = None
    m = re.search(r"\$\s*([\d,.]+)\s*([BbMmTt])", str(demo.get("assets", "")))
    if m:
        v, unit = float(m.group(1).replace(",", "")), m.group(2).upper()
        assets = round(v / 1000 if unit == "M" else v * 1000 if unit == "T" else v, 2)
    t = re.match(r"\s*(?:NYSE|NASDAQ|Nasdaq)?[:\s]*([A-Z]{1,5}(?:\.[A-Z])?)\b", str(basic.get("ticker", "")))
    ticker = t.group(1) if t and t.group(1) not in ("N", "NA") else None
    return {
        "slug": meta["slug"], "name": basic.get("name"),
        "category": "credit_union" if "credit union" in type_label.lower() else "bank",
        "type_label": type_label, "ticker": ticker, "hq": basic.get("hq"), "assets_b": assets,
        "quarter": meta.get("latestQuarter"), "opportunity": meta.get("opportunity"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("intel")
    ap.add_argument("--source", default="refresh")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not args.dry_run and not os.environ.get("SUPABASE_SECRET_KEY"):
        fail("SUPABASE_SECRET_KEY is not set (see pipeline/db.py)")

    with tempfile.TemporaryDirectory() as work:
        slug, html = run_build(os.path.abspath(args.intel), work)
        d_path = os.path.join(work, "d.json")
        node("extract_d.js", html, d_path)
        with open(d_path) as f:
            data = json.load(f)
        ensure_playwright()
        print(node("render_check.js", REF, d_path).strip())

    row = directory_row(data)
    row["source"] = args.source
    print(f"Directory row: {json.dumps(row)}")
    if args.dry_run:
        print(f"DRY RUN OK — {slug} would be published ({len(json.dumps(data)):,} bytes of dashboard data)")
        return
    sys.path.insert(0, HERE)
    import db
    snapshot_id = db.rpc("pipeline_publish", {"p_row": row, "p_data": data})
    print(f"PUBLISHED — {slug} is live as snapshot {snapshot_id}")


if __name__ == "__main__":
    main()
