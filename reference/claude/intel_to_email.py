#!/usr/bin/env python3
"""Render a Curinos intel JSON into an Outlook-safe HTML email body.

Why this exists: the finished dashboard HTML (~260KB) cannot be emailed as an
attachment, because attachment bytes must pass through the model's own output
and that exceeds what can be read back or emitted. Artifact links are blocked by
some corporate networks. The email *body* has neither problem — it is written
directly and always arrives.

Constraints this file respects (do not "modernise" them):
  * tables for layout, never flex or grid  -> Outlook uses the Word engine
  * every style inline on the element      -> <style> blocks are stripped
  * no <script>, no external images/fonts  -> stripped or blocked
  * light background, dark text            -> forwards and prints cleanly

Usage: python3 intel_to_email.py <intel.json> <out.html>
"""
import json, sys, html

INK, BODY, MUTED = "#0f172a", "#334155", "#64748b"
BLUE, GREEN, AMBER, RED = "#1d4ed8", "#047857", "#b45309", "#b91c1c"
RULE, PANEL = "#e2e8f0", "#f8fafc"
SANS = "Arial,Helvetica,sans-serif"

def e(x):
    return html.escape(str(x if x is not None else ""))

def section(title, sub=""):
    s = (f'<div style="font:400 13px/1.5 {SANS};color:{MUTED};margin:2px 0 0">{e(sub)}</div>' if sub else "")
    return (f'<tr><td style="padding:26px 0 10px">'
            f'<div style="font:700 11px/1.2 {SANS};color:{BLUE};letter-spacing:.10em;'
            f'text-transform:uppercase">{e(title)}</div>{s}'
            f'<div style="height:2px;background:{BLUE};width:38px;margin-top:8px"></div>'
            f'</td></tr>')

def cite_line(t):
    """Compact per-metric citation.

    Clickable <a> when the intel carries source URLs (t.src[{n,u}]), otherwise
    the plain-text t.cite. Outlook-safe: inline styles only, no script, no
    external asset -- see the module docstring; those rules are not stylistic.
    """
    if not isinstance(t, dict):
        return ""
    srcs = [x for x in (t.get("src") or []) if isinstance(x, dict)]
    links = [f'<a href="{e(x.get("u") or x.get("url"))}" '
             f'style="color:{BLUE};text-decoration:underline">'
             f'{e(x.get("n") or x.get("label") or "Source")}</a>'
             for x in srcs if (x.get("u") or x.get("url"))]
    body = " &nbsp;&middot;&nbsp; ".join(links) if links else e(t.get("cite", ""))
    if not body:
        return ""
    return (f'<div style="font:400 9px/1.45 {SANS};color:{MUTED};margin-top:7px;'
            f'padding-top:6px;border-top:1px solid {RULE}">{body}</div>')

def para(txt, colour=BODY, size=14):
    return (f'<tr><td style="font:400 {size}px/1.65 {SANS};color:{colour};padding:0 0 12px">'
            f'{e(txt)}</td></tr>')

def build(d):
    m, b, demo = d.get("meta", {}), d.get("basic", {}), d.get("demo", {})
    fo = d.get("finOverview", {})
    name = b.get("name", "Institution")
    opp = (m.get("opportunity") or "").upper()
    oppc = {"HIGH": RED, "MEDIUM": AMBER, "LOW": MUTED}.get(opp, MUTED)
    P = []
    A = P.append

    A('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
      f'style="background:#ffffff;margin:0;padding:0"><tr><td align="center" style="padding:0 12px">'
      f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" '
      f'style="width:640px;max-width:100%">')

    # ---- masthead -------------------------------------------------------
    A(f'<tr><td style="padding:22px 0 6px;border-bottom:3px solid {INK}">'
      f'<div style="font:700 11px/1.2 {SANS};color:{MUTED};letter-spacing:.16em;'
      f'text-transform:uppercase">Curinos Sales Intelligence</div>'
      f'<div style="font:700 27px/1.25 {SANS};color:{INK};padding-top:6px">{e(name)}</div>'
      f'<div style="font:400 13px/1.5 {SANS};color:{MUTED};padding:5px 0 14px">'
      f'{e(b.get("ticker",""))} &nbsp;&middot;&nbsp; {e(m.get("type",""))} &nbsp;&middot;&nbsp; '
      f'{e(m.get("sizeBand",""))} &nbsp;&middot;&nbsp; {e(b.get("hq",""))}</div></td></tr>')

    # ---- opportunity ----------------------------------------------------
    A(f'<tr><td style="padding:16px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" '
      f'border="0" width="100%" style="background:{PANEL};border-left:4px solid {oppc}">'
      f'<tr><td style="padding:14px 16px">'
      f'<div style="font:700 12px/1.2 {SANS};color:{oppc};letter-spacing:.08em">'
      f'{e(opp)} OPPORTUNITY</div>'
      f'<div style="font:400 14px/1.65 {SANS};color:{BODY};padding-top:7px">'
      f'{e(m.get("opportunityRationale",""))}</div>'
      f'</td></tr></table></td></tr>')

    # ---- metrics --------------------------------------------------------
    mets = d.get("metrics", [])[:8]
    if mets:
        A(section("Key metrics", m.get("latestQuarter", "")))
        rows = ""
        for i in range(0, len(mets), 2):
            cells = ""
            for mt in mets[i:i + 2]:
                up = mt.get("tu", True)
                tr = e(mt.get("tr", ""))
                arrow = ("&#9650; " if up else "&#9660; ") if tr else ""
                cells += (
                    f'<td width="50%" valign="top" style="padding:0 8px 12px 0">'
                    f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
                    f'style="background:{PANEL};border:1px solid {RULE}"><tr><td style="padding:11px 13px">'
                    f'<div style="font:700 10px/1.2 {SANS};color:{MUTED};letter-spacing:.07em;'
                    f'text-transform:uppercase">{e(mt.get("l",""))}</div>'
                    f'<div style="font:700 21px/1.2 {SANS};color:{INK};padding-top:5px">{e(mt.get("v",""))}</div>'
                    + (f'<div style="font:700 11px/1.4 {SANS};color:{GREEN if up else RED};padding-top:4px">'
                       f'{arrow}{tr}</div>' if tr else "")
                    + f'<div style="font:400 10px/1.4 {SANS};color:{MUTED};padding-top:3px">'
                      f'{e(mt.get("s",""))}</div>'
                    + cite_line(mt.get("t") or {})
                    + f'</td></tr></table></td>')
            rows += f'<tr>{cells}</tr>'
        A(f'<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" '
          f'width="100%">{rows}</table></td></tr>')

    # ---- primary theme --------------------------------------------------
    if fo.get("salesTheme"):
        A(section("The opening"))
        A(f'<tr><td style="font:700 15px/1.5 {SANS};color:{INK};padding:0 0 8px">'
          f'{e(fo["salesTheme"].replace("PRIMARY SALES THEME:", "").strip())}</td></tr>')
        A(para(fo.get("salesThemeBody", "")))

    # ---- P1 products ----------------------------------------------------
    p1 = [p for p in d.get("products", []) if p.get("pri") == 1]
    if p1:
        A(section("Priority 1 products", f'{len(p1)} of {len(d.get("products", []))} scored'))
        for p in p1:
            A(f'<tr><td style="padding:0 0 16px">'
              f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
              f'style="border:1px solid {RULE};border-left:4px solid {GREEN}">'
              f'<tr><td style="padding:13px 15px">'
              f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
              f'<td style="font:700 15px/1.35 {SANS};color:{INK}">{e(p.get("name",""))}</td>'
              f'<td align="right" style="font:700 15px/1.35 {SANS};color:{GREEN};white-space:nowrap">'
              f'{e(p.get("fit",""))}%</td></tr></table>'
              f'<div style="font:400 13px/1.6 {SANS};color:{BODY};padding-top:8px">{e(p.get("need",""))}</div>'
              + (f'<div style="font:400 12px/1.55 {SANS};color:{MUTED};padding-top:9px">'
                 f'<b style="color:{BODY}">ROI</b> {e(p.get("roi",""))}<br>'
                 f'<b style="color:{BODY}">Timeline</b> {e(p.get("time",""))}</div>' if p.get("roi") else "")
              + (f'<div style="background:{PANEL};padding:10px 12px;margin-top:10px;'
                 f'font:italic 400 12px/1.6 {SANS};color:{BODY}">&ldquo;{e(p.get("talk",""))}&rdquo;</div>'
                 if p.get("talk") else "")
              + f'</td></tr></table></td></tr>')

    # ---- peer table -----------------------------------------------------
    peers = d.get("peers", {})
    key = next((k for k in peers if isinstance(peers[k], list)), None)
    if key:
        rows = peers[key]
        A(section("Peer comparison", "Target institution first"))
        cols = [("a", "Assets $B"), ("nim", "NIM"), ("roaa", "ROAA"), ("eff", "Eff %"),
                ("cet1", "CET1"), ("dep_cost", "Dep cost")]
        cols = [c for c in cols if rows and rows[0].get(c[0]) is not None]
        head = "".join(f'<th align="right" style="font:700 10px/1.3 {SANS};color:{MUTED};'
                       f'padding:0 0 6px 10px;text-transform:uppercase;letter-spacing:.05em">{e(l)}</th>'
                       for _, l in cols)
        body = ""
        for i, r in enumerate(rows):
            tgt = i == 0
            bg = PANEL if tgt else "#ffffff"
            cells = "".join(
                f'<td align="right" style="font:{"700" if tgt else "400"} 12px/1.5 {SANS};'
                f'color:{INK if tgt else BODY};padding:7px 0 7px 10px;border-top:1px solid {RULE};'
                f'background:{bg}">{e(r.get(k, "--"))}</td>' for k, _ in cols)
            body += (f'<tr><td style="font:{"700" if tgt else "400"} 12px/1.5 {SANS};'
                     f'color:{BLUE if tgt else BODY};padding:7px 0;border-top:1px solid {RULE};'
                     f'background:{bg}">{e(r.get("n",""))}</td>{cells}</tr>')
        A(f'<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
          f'<tr><th align="left" style="font:700 10px/1.3 {SANS};color:{MUTED};padding:0 0 6px;'
          f'text-transform:uppercase;letter-spacing:.05em">Institution</th>{head}</tr>'
          f'{body}</table></td></tr>')
        if peers.get("commentary", {}).get("table"):
            A(f'<tr><td style="font:400 12px/1.65 {SANS};color:{MUTED};padding:10px 0 0">'
              f'{e(peers["commentary"]["table"])}</td></tr>')

    # ---- strategy pillars ----------------------------------------------
    pil = d.get("strategyPillars", [])[:4]
    if pil:
        A(section("What is driving them"))
        for i, p in enumerate(pil, 1):
            A(f'<tr><td style="padding:0 0 13px">'
              f'<div style="font:700 13px/1.4 {SANS};color:{INK}">{i}. {e(p.get("title",""))}</div>'
              f'<div style="font:400 13px/1.6 {SANS};color:{BODY};padding-top:4px">{e(p.get("body",""))}</div>'
              + (f'<div style="font:700 11px/1.5 {SANS};color:{BLUE};padding-top:4px">'
                 f'&rarr; {e(p.get("curinosLink",""))}</div>' if p.get("curinosLink") else "")
              + '</td></tr>')

    # ---- who to call ----------------------------------------------------
    execs = d.get("contacts", {}).get("execs", [])[:4]
    if execs:
        A(section("Who to call"))
        for x in execs:
            A(f'<tr><td style="padding:0 0 13px;border-bottom:1px solid {RULE}">'
              f'<div style="font:700 13px/1.4 {SANS};color:{INK}">{e(x.get("name",""))}'
              f'<span style="font-weight:400;color:{MUTED}"> &mdash; {e(x.get("title",""))}</span></div>'
              f'<div style="font:400 12px/1.6 {SANS};color:{BODY};padding-top:5px">{e(x.get("insight",""))}</div>'
              + (f'<div style="font:400 11px/1.5 {SANS};color:{BLUE};padding-top:4px">'
                 f'{e(x.get("products",""))}</div>' if x.get("products") else "")
              + '</td></tr>')

    # ---- 90-day plan ----------------------------------------------------
    plan = d.get("salesPlaybook", {}).get("actionPlan", [])
    if plan:
        A(section("First 90 days"))
        for s in plan:
            A(f'<tr><td style="padding:0 0 11px">'
              f'<div style="font:700 11px/1.3 {SANS};color:{BLUE};text-transform:uppercase;'
              f'letter-spacing:.05em">{e(s.get("period",""))}</div>'
              f'<div style="font:400 13px/1.6 {SANS};color:{BODY};padding-top:3px">'
              f'{e(s.get("body",""))}</div></td></tr>')

    # ---- objections -----------------------------------------------------
    lm = d.get("salesPlaybook", {}).get("landmines", [])[:3]
    if lm:
        A(section("What they will say"))
        for l in lm:
            A(f'<tr><td style="padding:0 0 12px">'
              f'<div style="font:italic 400 13px/1.6 {SANS};color:{INK}">'
              f'&ldquo;{e(l.get("objection",""))}&rdquo;</div>'
              f'<div style="font:400 12px/1.6 {SANS};color:{BODY};padding-top:4px">'
              f'<b style="color:{GREEN}">Answer:</b> {e(l.get("rebuttal",""))}</div></td></tr>')

    # ---- sources --------------------------------------------------------
    src = [s for s in d.get("sources", []) if isinstance(s, dict)]
    if src:
        A(section("Sources"))
        items = []
        for s in src:
            label = e(s.get("label") or s.get("n") or s.get("url") or s.get("u") or "")
            url = s.get("url") or s.get("u") or ""
            items.append(f'<a href="{e(url)}" style="color:{BLUE};'
                         f'text-decoration:underline">{label}</a>' if url else label)
        A(f'<tr><td style="font:400 11px/1.75 {SANS};color:{MUTED};padding:0 0 6px">'
          + "<br>".join(items) + "</td></tr>")

    A(f'<tr><td style="padding:18px 0 26px;border-top:1px solid {RULE}">'
      f'<div style="font:400 11px/1.6 {SANS};color:{MUTED}">'
      f'Generated automatically from public filings and disclosures. Figures as at '
      f'{e(m.get("latestQuarter",""))}. Verify before client meetings.</div></td></tr>')

    A("</table></td></tr></table>")
    return "".join(P)

if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    with open(src) as f:
        data = json.load(f)
    h = build(data)
    with open(out, "w") as f:
        f.write(h)
    print(f"{out}: {len(h):,} chars")
