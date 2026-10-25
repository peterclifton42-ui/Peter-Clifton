#!/usr/bin/env python3
"""Turn the product catalogue into lib/catalogue.json for the Products pages.

    python3 pipeline/catalogue.py

Reads reference/CURINOS_PRODUCT_CATALOGUE_V4.md: the K3 registry (status, size
gate, types) and each product's own section (what it is, when it fits). Re-run
it whenever the catalogue changes, and commit the JSON.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "reference", "CURINOS_PRODUCT_CATALOGUE_V4.md")
OUT = os.path.join(ROOT, "lib", "catalogue.json")

# Catalogue section headings that differ from the registry name.
HEADING_TO_NAME = {
    "LendersBenchmark Analyzer — Mortgage & Consumer": "LendersBenchmark Analyzer",
    "LendersBenchmark Analyzer — Small Business Lending": "LendersBenchmark Analyzer for Small Business Lending",
    "eBenchmarkers – Banking": "eBenchmarkers - Banking",
}
ROADMAP_SECTION = "Curinos One Commit · Conserve · Calibrate"
PILLARS = {"D": "Intelligent Data", "E": "Comparative Analytics", "F": "Optimization Platforms", "H": "Advisory", "CO": "Curinos One"}


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("&", "and")).strip("-")


def main():
    lines = open(SRC, encoding="utf-8").read().splitlines()

    # K3 registry table.
    registry = []
    start = next(i for i, l in enumerate(lines) if l.startswith("### K3"))
    for l in lines[start:]:
        if l.startswith("### K4"):
            break
        cells = [c.strip() for c in l.strip().strip("|").split("|")]
        if len(cells) == 10 and cells[0] not in ("Product", "---") and not set(cells[0]) <= {"-"}:
            name, status, countries, types, size, required, branches, tiers, need, timing = cells
            registry.append({"name": name, "status": status, "countries": countries, "types": types,
                             "sizeGate": size, "branches": branches, "tiers": tiers, "timingThemes": timing})

    # Product sections (### headings) inside the pillar sections.
    sections, pillar, current = {}, None, None
    for l in lines:
        m = re.match(r"^## SECTION (CO2?|[A-Z]):", l)
        if m:
            pillar = PILLARS.get(m.group(1))
            current = None
            continue
        if l.startswith("## "):
            pillar, current = None, None
            continue
        h = re.match(r"^### (.+)$", l)
        if h and pillar:
            heading = re.split(r" — (NEW IN V4|RETIRED|UK / EMEA ONLY)", h.group(1))[0].strip()
            heading = re.sub(r" \(roadmap\)$", "", heading)
            current = HEADING_TO_NAME.get(heading, heading)
            sections[current] = {"pillar": pillar, "body": []}
            continue
        if current and l.strip() != "---":
            sections[current]["body"].append(l)

    products = []
    for r in registry:
        sec = sections.get(r["name"])
        if sec is None and r["name"].startswith("Curinos One C") and r["status"] == "roadmap":
            sec = sections.get(ROADMAP_SECTION)
        if sec is None:
            raise SystemExit(f"No catalogue section for {r['name']}")
        body = "\n".join(sec["body"]).strip()
        products.append({**r, "slug": slugify(r["name"]), "pillar": sec["pillar"], "body": body})

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"source": "CURINOS_PRODUCT_CATALOGUE_V4.md (26 Sep 2026)", "products": products}, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"{len(products)} products -> {os.path.relpath(OUT, ROOT)}")
    for p in products:
        print(f"  {p['pillar']:22} {p['status']:15} {p['name']}  ({len(p['body'])} chars)")


if __name__ == "__main__":
    main()
