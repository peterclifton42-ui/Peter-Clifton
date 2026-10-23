#!/usr/bin/env python3
"""Scan an intel JSON for data belonging to a PREVIOUSLY COVERED institution.

Why this exists: every finished dashboard and intel JSON is archived into the
project. That archive is useful (resume after a dead run, rebuild without
re-researching) but it puts other banks' executives, products, strategy and
URLs one careless read away from the next bank's output. This script is the
backstop. It does not trust the model to have been careful; it checks.

The banned list is DERIVED FROM THE LOG, not hand-written, so every institution
covered on any previous day is automatically checked for. Nothing to maintain.

The `peers` subtree is exempt: naming other banks there is the entire point of
the Peer Comparison tab. Everywhere else, another institution's name is a
finding.

Usage: python3 check_contamination.py <intel.json> <daily-dashboard-log.md> <current-slug>
Exit 0 = clean, exit 1 = contamination found.
"""
import json, re, sys

# Dropped before matching: too generic to identify an institution on their own.
SUFFIXES = r"(?:,?\s+(?:Inc\.?|Corporation|Corp\.?|Company|Co\.?|N\.A\.?|"        \
           r"Bancorp|Bancorporation|Bancshares|Financial(?:\s+Group)?|"          \
           r"Group|Holdings?|Bankers|Incorporated))+$"
GENERIC = {"bank", "banks", "banking", "national", "first", "united", "state",
           "states", "trust", "federal", "community", "commerce", "capital",
           "financial", "american", "america", "south", "north", "east", "west"}


def variants(name, ticker):
    """Every string that would betray this institution in someone else's file."""
    out = set()
    # "Cullen/Frost Bankers, Inc. (Frost Bank)" -> base + parenthetical alias
    alias = re.findall(r"\(([^)]+)\)", name)
    base = re.sub(r"\([^)]*\)", "", name).strip()
    for n in [base] + alias:
        n = n.strip().rstrip(",")
        if not n:
            continue
        out.add(n)
        stripped = re.sub(SUFFIXES, "", n).strip().rstrip(",")
        if stripped:
            out.add(stripped)
            # "Cullen/Frost" -> also "Cullen", "Frost"; "SouthState" stays whole
            for part in re.split(r"[/&]", stripped):
                part = part.strip()
                if part and part.lower() not in GENERIC and len(part) > 3:
                    out.add(part)
    if ticker:
        sym = ticker.split(":")[-1].strip()
        if sym:
            out.add(sym)
    return {v for v in out if len(v) > 3 and v.lower() not in GENERIC}


def parse_log(md):
    """Read the covered-institutions table: | date | name | ticker | assets | `slug` |"""
    rows = []
    for line in md.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5:
            continue
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):   # header separator
            continue
        name, cell = cells[1], cells[4].strip("` ")
        # SKIPPED rows carry their text in the name column and nothing else.
        if not cell or name.upper().startswith("SKIPPED"):
            continue
        if re.fullmatch(r"[a-z0-9-]+", cell):
            slug = cell                                   # bare slug
        elif re.match(r"(?:DELIVERED|EMAIL SENT|RESEARCHED)\b", cell, re.I):
            # Status markers replaced the bare slug once rows started carrying
            # artifact URLs. Recover the slug where the marker embeds one, else
            # derive it from the name -- the name is what the gate screens on,
            # so an approximate slug is harmless but a DROPPED ROW is not.
            m = (re.search(r"intel-([a-z0-9-]+)\.json", cell)
                 or re.search(r"EMAIL SENT\s*[-\u2014]+\s*([a-z0-9-]+)", cell, re.I))
            slug = m.group(1) if m else re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        else:
            continue                                      # header row, etc.
        rows.append({"name": name, "ticker": cells[2], "slug": slug})
    return rows


def walk(node, path=""):
    """Yield (json-path, string) for every string in the tree, skipping peers."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "peers":          # peer names belong here and only here
                continue
            yield from walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")
    elif isinstance(node, str):
        yield path, node


def own_peers(d):
    """Names inside this JSON's own peers block.

    These are not cross-day contamination, but the data-integrity protocol says
    peer names belong in the Peer Comparison tab and nowhere else. Checking the
    log alone misses them entirely — a peer that has never had a dashboard of
    its own is invisible to the covered-institutions table. That gap let 7 leaks
    through on the first pass.
    """
    NAME_KEYS = {"n", "name", "competitor", "bank", "institution"}
    found, this_bank = set(), (d.get("basic", {}) or {}).get("name", "")

    def scan(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in NAME_KEYS and isinstance(v, str):
                    found.add(v)
                else:
                    scan(v)
        elif isinstance(node, list):
            for v in node:
                scan(v)

    scan(d.get("peers", {}))
    # A name field can still carry a parenthetical gloss — "Frost (funding benchmark)".
    names = {re.sub(r"\s*\(.*", "", n).strip() for n in found}
    return {n for n in names
            if 3 < len(n) < 60 and n[0].isupper() and n.count(" ") < 5
            and not (this_bank and (this_bank in n or n in this_bank))}


def main(intel_path, log_path, current_slug):
    d = json.load(open(intel_path))
    rows = parse_log(open(log_path).read())

    banned, n_prior = {}, 0
    for r in rows:
        if r["slug"] == current_slug:
            continue
        n_prior += 1
        for v in variants(r["name"], r["ticker"]):
            banned.setdefault(v, r["slug"])

    # Second banned set: this bank's own peers, derived from the JSON itself.
    for n in own_peers(d):
        for v in variants(n, ""):
            banned.setdefault(v, "own peer")

    if not banned:
        print("Nothing to check against — no prior institutions and no peers named.")
        return 0

    print(f"Checking against {n_prior} prior institution(s) plus this "
          f"bank's own peers — {len(banned)} banned strings:")
    print("  " + ", ".join(sorted(banned)))
    print()

    pattern = re.compile(
        r"\b(" + "|".join(re.escape(b) for b in sorted(banned, key=len, reverse=True)) + r")\b")

    hits = []
    for path, text in walk(d):
        for m in pattern.finditer(text):
            term = m.group(1)
            ctx = text[max(0, m.start() - 60):m.end() + 60].replace("\n", " ")
            hits.append((path, term, banned[term], ctx))

    if not hits:
        print("CLEAN — no prior institution's data appears outside the peers block.")
        return 0

    print(f"CONTAMINATION — {len(hits)} occurrence(s):")
    for path, term, slug, ctx in hits:
        print(f"\n  {term!r} (from {slug}) at {path}")
        print(f"    ...{ctx}...")
    print("\nRemove these before building. If the mention is legitimate (a genuine")
    print("competitor reference), move it into the peers block or drop it.")
    return 1


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
