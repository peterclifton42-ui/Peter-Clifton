#!/usr/bin/env python3
"""Build the Artifact copy of a dashboard, with the source intel JSON embedded.

Two jobs:
  1. Make the page render under the Artifact CSP — strip the doctype/html/head/
     body skeleton (the publisher supplies its own) and inline Chart.js, since
     external hosts are blocked.
  2. Embed the raw intel JSON so the artifact is a LOSSLESS archive.

Why (2) matters: Run B deletes the handoff JSON after publishing, on the theory
that the dashboard carries its own data. It nearly does — build_v2.py emits the
intel as a JS object literal — but that form is lossy (it drops fields the shell
does not render) and is not machine-readable as JSON. Embedding the original
means the artifact can reconstruct the research exactly, with json.loads and no
parsing of JS.

The block is inert: type="application/json" is not executed, not displayed, and
adds ~30% to the page against a 16MB ceiling.

Usage: python3 make_artifact.py <slug> <title>
"""
import io, json, re, sys

def main(slug, title):
    dash = f"/mnt/user-data/outputs/{slug}-curinos-dashboard.html"
    intel = f"/mnt/user-data/outputs/{slug}-intel.json"
    out = f"/home/claude/{slug}-artifact.html"

    src = io.open(dash, encoding="utf-8").read()
    chart = io.open("/tmp/chart.umd.min.js", encoding="utf-8").read()

    styles = re.findall(r"<style[^>]*>.*?</style>", src, re.S)
    body = re.search(r"<body[^>]*>(.*?)</body>", src, re.S).group(1)

    n = len(re.findall(r'<script[^>]*src="[^"]*chart[^"]*"[^>]*>\s*</script>', src, re.I))
    body = re.sub(r'<script[^>]*src="[^"]*chart[^"]*"[^>]*>\s*</script>',
                  lambda m: "<script>" + chart + "</script>", body, flags=re.I)
    if "chart.umd" not in body and n:
        body = "<script>" + chart + "</script>\n" + body

    # Embed the source intel. Escaping "<" defends against a "</script>" ever
    # appearing inside a string value and terminating the block early.
    raw = json.load(open(intel))
    payload = json.dumps(raw, ensure_ascii=False).replace("<", "\\u003c")
    embed = (f'\n<script type="application/json" id="curinos-intel" '
             f'data-slug="{slug}" data-generated="{raw.get("meta", {}).get("generated", "")}">'
             f'{payload}</script>\n')

    # The artifact page supplies its own <title>. A <title> lifted out of the
    # dashboard body would be a second one -- and historically it was a stale
    # hard-coded competitor name from SHELL_TOP, i.e. cross-institution
    # contamination in published source. Refuse rather than ship it.
    if re.search(r"<title[^>]*>", body, re.I):
        stray = re.findall(r"<title[^>]*>.*?</title>", body, re.S | re.I)[:3]
        raise SystemExit(f"FATAL: <title> found inside dashboard body: {stray}")

    page = f"<title>{title}</title>\n" + "\n".join(styles) + "\n" + body + embed
    io.open(out, "w", encoding="utf-8").write(page)

    ext = re.findall(r'(?:src|href)="(https?://[^"]+)"', page)
    # prove the embed round-trips
    back = json.loads(re.search(r'id="curinos-intel"[^>]*>(.*?)</script>', page, re.S)
                      .group(1).replace("\\u003c", "<"))
    ok = back == raw

    print(f"{slug}")
    print(f"  artifact      : {len(page):,} chars   (intel embed adds {len(embed):,})")
    print(f"  chartjs tags  : {n} inlined")
    print(f"  external refs : {ext[:2] if ext else 'none'}")
    print(f"  intel keys    : {len(raw)} embedded")
    print(f"  ROUND-TRIP    : {'LOSSLESS — json.loads reproduces the source exactly' if ok else 'MISMATCH'}")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
