#!/usr/bin/env python3
"""Render a Curinos intel JSON into ONE self-contained, complete HTML briefing.

Why this exists
---------------
The full interactive dashboard is ~242KB of HTML and cannot be delivered to a
client. Every delivery channel available to us (Gmail attachment, Google Drive
upload) takes file CONTENT as a string parameter, so the payload has to pass
through a model's own output verbatim. 242KB is far beyond what can be emitted;
a zipped copy is still ~82,000 base64 characters and risks silent corruption.

`intel_to_email.py` solves that for the email body, but only by deliberately
dropping most of the dashboard. This renderer keeps EVERYTHING in the intel JSON
- every product at every priority with its scoring breakdown, the whole sales
playbook, the silo assessment, the maturity model, balance-sheet detail, the
full peer set with all five commentaries, and the charts - and still lands small
enough to be emitted verbatim, because it spends its bytes on content instead of
markup:

  * ONE <style> block with short class names. No inline style attributes are
    repeated per element (the single biggest size lever); the only inline style
    in the whole document is the width of a progress bar, which cannot be
    expressed in a stylesheet.
  * Semantic elements carry their styling from context (`.pc h3`, `.pc p`,
    `.c b`, `dl/dt/dd` for score bars), so most elements need no class at all.
  * Table column alignment comes from three table-level classes rather than a
    class on every single cell.
  * Every cited URL is emitted once, in a numbered reference list; citations
    point at it with a short in-page anchor instead of repeating the URL.
  * Literal UTF-8 punctuation, and html.escape(quote=False) for text nodes, so
    apostrophes cost 1 byte rather than 6.
  * No pretty-printing, no per-row boilerplate, no base64 payloads.

On the reference UMB intel (116KB JSON, 83KB of distinct prose) this produces a
~120KB page: ~28KB of markup and ~6KB of CSS around the content. Content is the
floor - the way to make the output smaller is a smaller intel JSON, never a
less complete page.

Two HARD constraints (do not relax them):
  1. NO <script> anywhere. The file must be completely inert. Charts are
     rendered as labelled HTML value tables plus cheap inline SVG trendlines -
     never JavaScript.
  2. NO external assets. No CDN stylesheets, no web fonts, no remote images, no
     network requests of any kind. The file must render identically offline.

Unlike intel_to_email.py, this output is opened in a real browser rather than
Outlook, so the Outlook-only rules (table layout, a style attribute on every
element) are deliberately NOT carried over - dropping them is exactly what buys
the size headroom that makes a complete briefing deliverable.

Usage: python3 intel_to_full.py <intel.json> <out.html>
"""
import json
import sys
import html

# --------------------------------------------------------------------------
# escaping / small helpers
# --------------------------------------------------------------------------


def e(x):
    """Escape for HTML *text*. quote=False deliberately: apostrophes are common
    in this prose and &#x27; costs 6 bytes each for no benefit in text nodes."""
    return html.escape(str(x if x is not None else ""), quote=False)


def a(x):
    """Escape for a quoted attribute value (href only)."""
    return html.escape(str(x if x is not None else ""), quote=True)


def txt(s):
    """Escaped text with newlines preserved as breaks."""
    return e(s).replace("\n", "<br>")


# The JSON carries raw hex colours. Map the recurring ones onto palette classes
# so a style attribute is never emitted for colour.
HEX = {
    "#ef4444": "r", "#f87171": "r", "#dc2626": "r", "#b91c1c": "r", "#e11d48": "r",
    "#f59e0b": "a", "#fbbf24": "a", "#d97706": "a", "#b45309": "a", "#eab308": "a",
    "#22c55e": "g", "#34d399": "g", "#10b981": "g", "#047857": "g", "#16a34a": "g",
    "#3b82f6": "b", "#60a5fa": "b", "#2563eb": "b", "#1d4ed8": "b", "#0ea5e9": "b",
    "#1e3a5f": "b",
    "#a78bfa": "v", "#8b5cf6": "v", "#c084fc": "v", "#7c3aed": "v",
}
WORD = {
    "high": "r", "critical": "r", "urgent": "r", "now": "r", "none": "r", "red": "r",
    "medium": "a", "partial": "a", "moderate": "a", "watch": "a", "amber": "a",
    "low": "g", "good": "g", "strong": "g", "integrated": "g", "yes": "g", "green": "g",
}


def cc(v, fb="b"):
    """Palette class from a hex value or a status word."""
    if not v:
        return fb
    s = str(v).strip().lower()
    return HEX.get(s) or WORD.get(s) or fb


class Doc:
    """Accumulates markup with zero pretty-printing."""

    def __init__(self):
        self.p, self.toc = [], []

    def __call__(self, s):
        if s:
            self.p.append(s)

    def sec(self, sid, title, sub=""):
        self.toc.append((sid, title))
        self(f'<section id={sid}><h2>{title}</h2>')
        if sub:
            self(f'<p class=ss>{txt(sub)}</p>')

    def end(self):
        self("</section>")

    def out(self):
        return "".join(self.p)


# --------------------------------------------------------------------------
# component emitters - all styling comes from context, not from attributes
# --------------------------------------------------------------------------
def cards(items, cls="g3"):
    """items: (label, value, note, colourclass). Renders <b>/<strong>/<em>."""
    o = [f'<div class={cls}>']
    for lab, val, note, col in items:
        if not (lab or val):
            continue
        o.append('<div class=c>' + (f'<b>{e(lab)}</b>' if lab else "")
                 + (f'<strong class={col}>{txt(val)}</strong>' if col
                    else f'<strong>{txt(val)}</strong>')
                 + (f'<em>{txt(note)}</em>' if note else "") + '</div>')
    o.append("</div>")
    return "".join(o)


def ul(items):
    if not items:
        return ""
    return "<ul>" + "".join(f"<li>{txt(i)}</li>" for i in items) + "</ul>"


def dl(pairs):
    rows = "".join(f'<tr><th>{e(k)}</th><td>{txt(v)}</td></tr>'
                   for k, v in pairs if v not in (None, "", []))
    return f'<table class="t d">{rows}</table>' if rows else ""


def table(headers, rows, align=""):
    """align: "" all-left, "n" cols 2+ numeric/right, "n2" col 2, "n23" cols 2-3.
    (Deliberately NOT called "r" - that is the red palette class.)
    Cell alignment is table-level, so no cell carries a class unless it is
    carrying a COLOUR (passed as a (text, class) tuple)."""
    cls = f'"t {align}"' if align else "t"
    head = "".join(f"<th>{e(h)}</th>" for h in headers)
    body = []
    for r in rows:
        tds = []
        for cell in r:
            if isinstance(cell, tuple):
                cell, k = cell
                tds.append(f'<td class={k}>{txt(cell)}</td>' if k else f'<td>{txt(cell)}</td>')
            else:
                tds.append(f"<td>{txt(cell)}</td>")
        body.append("<tr>" + "".join(tds) + "</tr>")
    t = f'<table class={cls}><tr>{head}</tr>{"".join(body)}</table>'
    return f"<div class=to>{t}</div>" if len(headers) > 3 else t


def bars(rows):
    """rows: (label, pct, valuetext, colourclass). The bar width is the only
    inline style in the document - it cannot come from the stylesheet."""
    o = ["<dl>"]
    for lab, pct, val, col in rows:
        try:
            p = max(0.0, min(100.0, float(pct)))
        except (TypeError, ValueError):
            p = 0.0
        o.append(f'<dt>{e(lab)}</dt><dd><i class={col} style=--w:{p:.0f}%></i>'
                 f'<s>{e(val)}</s></dd>')
    o.append("</dl>")
    return "".join(o)


def tags(items, cls="sg"):
    if not items:
        return ""
    c = f'"{cls}"' if " " in cls else cls
    return f'<div class={c}>' + "".join(f"<i>{e(t)}</i>" for t in items) + "</div>"


def note(label, body, col=""):
    """Callout box."""
    return (f'<div class="hi {col}">' if col else "<div class=hi>") + \
        f'<b>{e(label)}</b><p>{txt(body)}</p></div>'


class Refs:
    """Every cited URL is emitted ONCE, in a numbered reference list at the end;
    citations point at it with a short in-page anchor. On the UMB intel that is
    30 citations over 13 unique URLs - repeating them inline costs ~2KB for no
    benefit. It also surfaces every cited source, not just the ones the JSON
    happens to list under `sources`."""

    def __init__(self):
        self.order, self.idx = [], {}

    def ref(self, url, label=""):
        u = str(url).strip()
        if u not in self.idx:
            self.idx[u] = len(self.order) + 1
            self.order.append([u, label])
        n = self.idx[u]
        if label and not self.order[n - 1][1]:
            self.order[n - 1][1] = label
        return n

    def cite(self, url, label):
        """Inline citation: visible label + a short anchor to the reference."""
        if not url:
            return e(label)
        return f'<a href=#r{self.ref(url, label)}>{e(label)}</a>'

    def render(self):
        return "<ol class=rf>" + "".join(
            f'<li id=r{i}><a href="{a(u)}">{e(lab or u)}</a></li>'
            for i, (u, lab) in enumerate(self.order, 1)) + "</ol>"


R = Refs()


def links(srcs, lead="Sources"):
    if not srcs:
        return ""
    parts = [R.cite(s.get("u") or s.get("url"), s.get("n", "") or s.get("label", ""))
             for s in srcs]
    return f'<p class=mu>{lead}: ' + " · ".join(parts) + "</p>"


def fmt(v):
    """Thousands separator for numbers; pass anything else straight through."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return str(v)
    return f"{v:,.0f}" if float(v) == int(v) else f"{v:,}"


def spark(series, labels, w=560, h=88):
    """Multi-series inline SVG trendline. No script, no external asset."""
    vals = [v for _, s in series for v in s if isinstance(v, (int, float))]
    if len(vals) < 2:
        return ""
    lo, hi = min(vals), max(vals)
    rng = (hi - lo) or 1
    lo -= rng * .12
    hi += rng * .12
    rng = hi - lo
    n = max(len(s) for _, s in series)
    step = (w - 8) / max(n - 1, 1)
    body, key = [], []
    for i, (nm, s) in enumerate(series):
        k = "s%d" % (i + 1)
        pts = " ".join("%.0f,%.1f" % (4 + j * step, h - 4 - (v - lo) / rng * (h - 8))
                       for j, v in enumerate(s) if isinstance(v, (int, float)))
        last = [v for v in s if isinstance(v, (int, float))][-1]
        body.append(f'<polyline class={k} points="{pts}"/>'
                    + '<circle class=%s cx="%.0f" cy="%.1f" r="2.6"/>'
                    % (k, 4 + (len(s) - 1) * step, h - 4 - (last - lo) / rng * (h - 8)))
        key.append(f'<i class={k}>{e(nm)}</i>')
    return (f'<div class=ch><svg viewBox="0 0 {w} {h}" preserveAspectRatio=none role=img '
            f'aria-label="trend">{"".join(body)}</svg><div class=lg>{"".join(key)}'
            f'<s>{e(labels[0])} → {e(labels[-1])}</s></div></div>')


# --------------------------------------------------------------------------
# stylesheet - one block; everything above leans on it
# --------------------------------------------------------------------------
CSS = """*{box-sizing:border-box}
body{margin:0;background:#f1f5f9;color:#334155;font:400 13.5px/1.62 system-ui,Segoe UI,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact}
.w{max-width:1060px;margin:0 auto;background:#fff;padding:0 34px 40px;box-shadow:0 1px 3px rgba(15,23,42,.15)}
h1,h2,h3,h4{margin:0;color:#0f172a;font-weight:700;letter-spacing:-.01em}
p{margin:0 0 10px}
a{color:#1d4ed8;text-decoration:none}
a:hover{text-decoration:underline}
header{padding:26px 0 15px;border-bottom:3px solid #0f172a}
h1{font-size:30px;line-height:1.15;padding:7px 0 5px}
header p{color:#64748b;font-size:12.5px;margin:0}
header b{color:#334155}
section{padding:22px 0 2px;border-top:1px solid #e2e8f0;margin-top:18px}
h2{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#1d4ed8;padding-bottom:8px;border-bottom:2px solid #1d4ed8;display:inline-block;margin-bottom:13px}
h3{font-size:14.5px;margin:16px 0 8px}
h4{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#64748b;margin:15px 0 7px}
.ss{color:#64748b;font-size:12.5px;margin:-7px 0 13px}
.mu{color:#64748b;font-size:11.5px;line-height:1.55}
.b{color:#1d4ed8}.g{color:#047857}.a{color:#b45309}.r{color:#b91c1c}.v{color:#7c3aed}
.hi{background:#f8fafc;border-left:4px solid #1d4ed8;padding:12px 15px;margin:0 0 13px;color:#334155}
.hi.r{border-color:#b91c1c}.hi.a{border-color:#b45309}.hi.g{border-color:#047857}.hi.v{border-color:#7c3aed}
.hi>b{display:block;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#64748b;margin-bottom:5px}
.hi.r>b{color:#b91c1c}.hi.a>b{color:#b45309}.hi.g>b{color:#047857}
.hi p:last-child{margin:0}
.g2,.g3,.g4{display:grid;gap:9px;margin:0 0 13px}
.g2{grid-template-columns:repeat(2,1fr)}
.g3{grid-template-columns:repeat(3,1fr)}
.g4{grid-template-columns:repeat(4,1fr)}
.c{background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px 12px}
.c>b{display:block;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#64748b}
.c>strong{display:block;font-size:18px;line-height:1.25;color:#0f172a;padding-top:3px}
.c>em{display:block;font-style:normal;font-size:11px;line-height:1.48;color:#64748b;padding-top:4px}
.c ul{margin:6px 0 0;padding-left:16px;font-size:12px}
.to{overflow-x:auto}
table.t{width:100%;border-collapse:collapse;font-size:12.2px;margin:0 0 12px}
table.t th{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;padding:0 10px 6px 0;text-align:left;vertical-align:bottom}
table.t td{padding:6px 10px 6px 0;border-top:1px solid #e2e8f0;vertical-align:top}
table.t tr:first-child th{border:0}
table.t td:last-child,table.t th:last-child{padding-right:0}
.t.d th{width:25%;font-size:11.5px;text-transform:none;letter-spacing:0;color:#334155;padding:6px 14px 6px 0;border-top:1px solid #e2e8f0;vertical-align:top}
.t.n td:not(:first-child),.t.n th:not(:first-child),.t.n2 td:nth-child(2),.t.n2 th:nth-child(2),.t.n23 td:nth-child(2),.t.n23 th:nth-child(2),.t.n23 td:nth-child(3),.t.n23 th:nth-child(3){text-align:right}
tr.tg td{background:#eff6ff;font-weight:700;color:#0f172a}
tr.tg td:first-child{color:#1d4ed8}
ul{margin:0 0 11px;padding-left:17px}
li{padding-bottom:4px}
.pc{border:1px solid #e2e8f0;border-left:4px solid #94a3b8;border-radius:4px;padding:12px 15px;margin:0 0 11px}
.pc.p1{border-left-color:#047857}.pc.p2{border-left-color:#1d4ed8}
.pc.p3{border-left-color:#b45309}.pc.p0{border-left-color:#cbd5e1;background:#f8fafc}
.pc h3{font-size:14.5px;margin:0;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.pc h3 b{font-size:15px;white-space:nowrap}
.pc>em{display:block;font-style:normal;font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#64748b;padding:2px 0 7px}
.pc p{margin:0 0 6px;font-size:12.5px}
.pc p b{color:#0f172a}
.pc ul{margin:0 0 8px;font-size:12.5px}
.pc q{display:block;background:#f8fafc;border:1px solid #e2e8f0;padding:9px 12px;margin:8px 0 0;font-style:italic;font-size:12.5px}
.ob{border-top:1px dashed #e2e8f0;padding-top:6px;margin-top:6px;font-size:12.5px}
ol.rf{margin:0 0 11px;padding-left:22px;font-size:12.2px;word-break:break-word}
ol.rf li{padding-bottom:5px}
dl{display:grid;grid-template-columns:138px 1fr;align-items:center;gap:3px 9px;margin:7px 0 9px}
dt{font-size:10.5px;color:#64748b}
dd{margin:0;display:flex;align-items:center;gap:9px}
dd>i{flex:1;height:6px;border-radius:3px;background:linear-gradient(90deg,currentColor var(--w),#e2e8f0 var(--w))}
dd>s{flex:0 0 74px;text-align:right;text-decoration:none;font-size:11.5px;font-weight:700;color:#334155}
.sg{margin:0 0 8px}
.sg i{display:inline-block;font-style:normal;background:#ecfdf5;color:#047857;border-radius:3px;padding:2px 7px;margin:0 4px 4px 0;font-size:10.5px;font-weight:600}
.tg2 i{background:#eff6ff;color:#1d4ed8}
.pc.p0 .sg i{background:#f1f5f9;color:#64748b}
.ch{margin:0 0 11px}
svg{width:100%;height:90px;display:block}
polyline{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}
.s1{stroke:#1d4ed8;color:#1d4ed8}.s2{stroke:#047857;color:#047857}.s3{stroke:#b45309;color:#b45309}
circle{stroke:none;fill:currentColor}
.lg{font-size:10.5px;color:#64748b;padding-top:4px;overflow:hidden}
.lg i{font-style:normal;font-weight:700;margin-right:13px}
.lg i:before{content:"\\25AC "}
.lg s{float:right;text-decoration:none}
.ex{border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:10px}
.ex:last-of-type{border-bottom:0}
.ex>h3{margin:0;font-size:13.5px}
.ex>h3 em{font-style:normal;font-weight:400;color:#64748b}
.ex>h3 s{text-decoration:none;font-size:9.5px;letter-spacing:.07em;background:#0f172a;color:#fff;border-radius:3px;padding:2px 6px;margin-left:7px;vertical-align:1px}
.ex p{margin:0 0 5px;font-size:12.5px}
.ex p b{color:#0f172a}
nav{background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:11px 15px;margin-top:16px;font-size:11.5px;columns:3;column-gap:20px}
nav a{display:block;padding:2px 0;color:#334155;break-inside:avoid}
nav a:hover{color:#1d4ed8}
.ft{border-top:1px solid #e2e8f0;margin-top:24px;padding-top:14px;color:#64748b;font-size:11px;line-height:1.6}
pre{background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1d4ed8;padding:12px 14px;margin:0 0 11px;white-space:pre-wrap;word-wrap:break-word;font:400 12.2px/1.62 ui-monospace,Menlo,Consolas,monospace;color:#334155}
@media(max-width:820px){.w{padding:0 16px 30px}.g3,.g4{grid-template-columns:repeat(2,1fr)}nav{columns:2}}
@media(max-width:520px){.g2,.g3,.g4{grid-template-columns:1fr}nav{columns:1}dl{grid-template-columns:88px 1fr}}
@media print{body{background:#fff}.w{box-shadow:none;max-width:none}}"""

SCORE = {"sizetypefit": "Size / type", "sizetype": "Size / type", "segmentfit": "Segment",
         "segment": "Segment", "maturityfit": "Maturity", "maturity": "Maturity",
         "needfit": "Need", "need": "Need", "feasibilityfit": "Feasibility",
         "feasibility": "Feasibility", "timing": "Timing", "readiness": "Readiness (×)"}
RATIONALE = {"sizerationale": "Size / type", "segrationale": "Segment",
             "matrationale": "Maturity", "painrationale": "Need",
             "feasrationale": "Feasibility", "formula": "Formula",
             "stratTags": "Strategic tags", "strattags": "Strategic tags",
             "timingrationale": "Timing", "gaterationale": "Gates", "caps": "Caps & floors",
             "modelversion": "Model"}


def label_for(k):
    return SCORE.get(str(k).lower()) or RATIONALE.get(str(k).lower()) or str(k)


def split_scoring(sc):
    """-> ([(label, number)], [(label, prose)]). Older intel files interleave
    numeric dimensions with their written rationale in the same dict."""
    nums, prose = [], []
    for k, v in sc.items():
        if isinstance(v, bool):
            continue
        if str(k).lower() == "readiness":          # V4 multiplier (0.60-1.00), not a 0-100 score
            prose.append((label_for(k), f"× {v}"))
            continue
        if isinstance(v, (int, float)):
            nums.append((label_for(k), float(v)))
        else:
            t = str(v).strip()
            if t.replace(".", "", 1).isdigit():
                nums.append((label_for(k), float(t)))
            elif t:
                prose.append((label_for(k), t))
    return nums, prose


def product_card(p, pri):
    nm = e(p.get("name", ""))
    col = "g" if pri == 1 else "b" if pri == 2 else "a" if pri == 3 else "mu"
    o = [f'<div class="pc p{pri}"><h3>{nm}<b class={col}>{e(p.get("fit",""))}</b></h3>'
         f'<em>{e(p.get("priority",""))} · {e(p.get("cat",""))}</em>']
    if p.get("dnr"):
        o.append(f'<p><b class=r>Why not</b> {txt(p["dnr"])}</p>')
    for k, lab in (("what", "What it is"), ("why", "Why here"), ("need", "The need"),
                   ("roi", "ROI"), ("time", "Timeline")):
        if p.get(k):
            o.append(f'<p><b>{lab}</b> {txt(p[k])}</p>')
    sc = p.get("scoring") or {}
    if sc:
        nums, prose = split_scoring(sc)
        if nums:
            o.append(bars([(lab, v, f"{v:g}",
                            "g" if v >= 85 else "b" if v >= 70 else "a") for lab, v in nums]))
        for lab, v in prose:
            o.append(f'<p class=mu><b>{e(lab)}</b> {txt(v)}</p>')
    if p.get("scoringNote"):
        o.append(f'<p class=mu>Scoring note: {txt(p["scoringNote"])}</p>')
    if p.get("use"):
        o.append("<p><b>Use cases</b></p>" + ul(p["use"]))
    if p.get("signals"):
        o.append("<p><b>Signals present</b></p>" + tags(p["signals"]))
    for ob in (p.get("objections") or []):
        o.append(f'<p class=ob><b>“{e(ob.get("q",""))}”</b><br>'
                 f'<b class=g>Answer</b> {txt(ob.get("a",""))}</p>')
    if p.get("contacts"):
        o.append(f'<p><b>Who to take it to</b> {txt(p["contacts"])}</p>')
    if p.get("talk"):
        o.append(f'<q>{e(p["talk"])}</q>')
    o.append("</div>")
    return "".join(o)


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------
def build(d):
    global R
    R = Refs()
    D = Doc()
    m, b = d.get("meta", {}), d.get("basic", {})
    demo, fo, sp = d.get("demo", {}), d.get("finOverview", {}), d.get("salesPlaybook", {})
    name = b.get("name") or m.get("institution") or "Institution"
    q = m.get("latestQuarter", "")

    # ---- masthead ---------------------------------------------------------
    D(f'<header><p><b>Curinos Sales Intelligence</b></p><h1>{e(name)}</h1>'
      f'<p><b>{e(b.get("ticker",""))}</b> · {e(m.get("type",""))} · '
      f'{e(m.get("sizeBand",""))} band · {e(b.get("hq",""))} · figures as at '
      f'<b>{e(q)}</b> · generated {e(m.get("generated",""))}</p></header>')

    opp = (m.get("opportunity") or m.get("opportunity_rating") or "").upper()
    oc = cc(opp, "a")
    D(f'<div class="hi {oc}" id=top><b>{e(opp)} opportunity</b><p>'
      f'{txt(m.get("opportunityRationale") or m.get("opportunity_rationale",""))}</p>'
      + (f'<p><b class={cc(d.get("healthColour"),"g")}>Health: {e(d.get("healthRating",""))}</b> '
         f'— {txt(d.get("healthNote",""))}</p>' if d.get("healthRating") else "") + "</div>")

    for src in (d.get("sources") or []):        # canonical labels claim refs 1..n
        if src.get("url"):
            R.ref(src["url"], src.get("label", ""))

    slot = len(D.p)
    D.p.append("")  # contents nav placeholder; appended directly (D() drops "")

    # ---- key metrics ------------------------------------------------------
    mets = d.get("metrics", [])
    if mets:
        D.sec("m", "Key metrics", q)
        def trend(x):
            t = str(x.get("tr") or "").strip()
            if not t:
                return e(x.get("s", ""))
            # the JSON sometimes already carries its own arrow glyph
            arrow = "" if t[:1] in "▲▼" else ("▲ " if x.get("tu", True) else "▼ ")
            return arrow + e(t) + (" · " + e(x["s"]) if x.get("s") else "")

        D(cards([(x.get("l", ""), x.get("v", ""), trend(x), "") for x in mets], "g4"))
        out = []
        for x in mets:
            t = x.get("t") or {}
            if not t:
                continue
            det = [f'<p>{txt(t.get("m",""))}</p>']
            if t.get("tr"):
                det.append(f'<p><b>Trend</b> {txt(t["tr"])}</p>')
            if t.get("sa"):
                det.append(f'<p><b>Sales angle</b> {txt(t["sa"])}</p>')
            tg = ([f'{str(t["o"]).upper()} opportunity'] if t.get("o") else []) + list(t.get("p") or [])
            if tg:
                det.append(tags(tg, "sg tg2"))
            if t.get("cite") or t.get("src"):
                det.append(links(t.get("src") or [], "Source: " + e(t.get("cite", "")) or "Source"))
            out.append(f'<div class=pc><h3>{e(x.get("l",""))}<b class=b>{e(x.get("v",""))}</b>'
                       f'</h3>' + "".join(det) + "</div>")
        if out:
            D("<h4>Metric detail and sales read</h4>" + "".join(out))
        D.end()

    # ---- institution profile ---------------------------------------------
    D.sec("p", "Institution profile")
    st = d.get("structure", {})
    D(dl([("Legal entity", b.get("legal")), ("Ticker", b.get("ticker")),
          ("Headquarters", b.get("hq")), ("Established", b.get("est")),
          ("CEO", b.get("ceo")), ("CFO", b.get("cfo")),
          ("Employees", " · ".join(dict.fromkeys(
              x for x in (b.get("employees"), demo.get("employees")) if x)) or None),
          ("Parent", b.get("parent")), ("FDIC cert", b.get("fdic")), ("RSSD", b.get("rssd")),
          ("Website", b.get("website")), ("Total assets", demo.get("assets")),
          ("Branches", demo.get("branches")), ("States", demo.get("states")),
          ("ATMs", demo.get("atms")), ("Rank / scale", demo.get("rank")),
          ("Fortune", demo.get("fortune")),
          ("Core markets", " · ".join(e(x) for x in demo.get("markets", [])) or None),
          ("Segments", " · ".join(e(x) for x in demo.get("segments", [])) or None),
          ("Digital", demo.get("digital"))]))
    if st:
        pr, bk = st.get("parent") or {}, st.get("bank") or {}
        D("<h4>Corporate structure</h4>")
        D(dl([("Holding company", f'{pr.get("name","")} ({pr.get("type","")}), regulator '
                                  f'{pr.get("regulator","")}, {pr.get("nasdaq","")}' if pr else None),
              ("Bank", f'{bk.get("name","")} ({bk.get("type","")}), regulator '
                       f'{bk.get("regulator","")}, {bk.get("charter","")}' if bk else None),
              ("Intermediate holdcos", st.get("intermediate")),
              ("Regulators", ", ".join(st.get("regulators", [])) or None)]))
        if st.get("subs"):
            aum = any(s.get("aum") for s in st["subs"])
            D(table(["Subsidiary", "Type", "Purpose"] + (["Assets"] if aum else []),
                    [[s.get("name", ""), s.get("type", ""), s.get("purpose", "")]
                     + ([s.get("aum", "")] if aum else []) for s in st["subs"]]))
    D.end()

    # ---- the opening ------------------------------------------------------
    ca = d.get("curinosAngle") or {}
    if fo.get("salesTheme") or ca:
        D.sec("o", "The opening")
        if fo.get("salesTheme"):
            D(f'<h3>{e(fo["salesTheme"].replace("PRIMARY SALES THEME:", "").strip())}</h3>'
              f'<p>{txt(fo.get("salesThemeBody",""))}</p>')
        if ca:
            D(f'<div class=hi><b>The Curinos angle</b><h3>{e(ca.get("title",""))}</h3>'
              f'<p>{txt(ca.get("body",""))}</p></div>')
        if fo.get("alert"):
            D(note(fo["alert"], fo.get("alertBody", ""), "a"))
        D(dl([("Balance-sheet trend", fo.get("balanceSheetTrend")),
              ("Revenue trend", fo.get("revenueTrend"))]))
        if fo.get("keyDetails"):
            D("<h4>Key details</h4>" + cards(
                [(x.get("label", ""), x.get("value", ""), "",
                  "b" if x.get("highlight") else "") for x in fo["keyDetails"]], "g4"))
        D.end()

    # ---- financial overview ----------------------------------------------
    ni, ac, fi = fo.get("niiSensitivity") or {}, fo.get("analystConsensus") or {}, fo.get("feeIncome") or {}
    if ni or ac or fi:
        D.sec("f", "Financial overview", "Rate sensitivity, guidance and fee income")
    if ni:
        D("<h4>Rate sensitivity and deposit beta</h4>")
        D(cards([(f'NII @ +{ni.get("upBps","")}bps', ni.get("upValue", ""), ni.get("upLabel", ""),
                  "g" if str(ni.get("upPositive")).lower() == "true" else "r"),
                 (f'NII @ -{ni.get("downBps","")}bps', ni.get("downValue", ""), ni.get("downLabel", ""),
                  "g" if str(ni.get("downPositive")).lower() == "true" else "r")]
                + [(x.get("label", ""), x.get("value", ""), x.get("note", ""), cc(x.get("colour")))
                   for x in ni.get("betaMetrics", [])], "g3"))
        if ni.get("salesAngle"):
            D(note("Sales angle", ni["salesAngle"]))
        D(links(ni.get("src")))
    if ac:
        D("<h4>Guidance and street view</h4>")
        sb, cb = ac.get("stockBadge") or {}, ac.get("capitalBadge") or {}
        cl = [("Management guidance", ac.get("mgmtGuidance", ""), ac.get("mgmtLabel", ""), "b"),
              ("Street consensus", ac.get("streetConsensus", ""), ac.get("streetLabel", ""), "b")]
        if sb:
            cl.append((sb.get("label", ""), sb.get("value", ""),
                       f'{sb.get("ticker","")} · vs {sb.get("vsValue","")} '
                       f'{sb.get("vsLabel","")}. {sb.get("sub","")}', "g"))
        if cb:
            cl.append((cb.get("label", ""), cb.get("value", ""),
                       f'{cb.get("sub","")} · {cb.get("signal","")}', "g"))
        D(cards(cl, "g4"))
        if ac.get("confidenceNote"):
            D(note(ac.get("confidenceTitle", "Guidance confidence"), ac["confidenceNote"],
                   cc(ac.get("confidenceLevel"), "a")))
        if ac.get("salesRead"):
            D(f'<p><b>Sales read</b> {txt(ac["salesRead"])}</p>')
        D(links(ac.get("src")))
    if fi:
        D("<h4>Fee income</h4>")
        if fi.get("intro"):
            D(f'<p>{txt(fi["intro"])}</p>')
        if fi.get("items"):
            D(table(["Fee line", "Value", "Trend", "Note", "Curinos product", "Angle"],
                    [[x.get("label", ""), (x.get("value", ""), cc(x.get("colour"))),
                      x.get("trend", ""), x.get("note", ""), x.get("product", ""), x.get("angle", "")]
                     for x in fi["items"]], "n2"))
        if fi.get("salesAngle"):
            D(note("Sales angle", fi["salesAngle"]))
        D(links(fi.get("src")))
    if ni or ac or fi:
        D.end()

    # ---- trend data (no JS) ----------------------------------------------
    ch, nt = d.get("charts") or {}, d.get("nimTrend") or {}
    if ch or nt:
        D.sec("ch", "Trend data",
              "Labelled value tables with inline SVG trendlines. No scripts are used anywhere in this file.")
    bs = ch.get("balanceSheet") or {}
    if bs.get("labels"):
        D("<h4>Balance sheet ($ millions)</h4>")
        ser = [(k.capitalize(), bs[k]) for k in ("assets", "loans", "deposits") if bs.get(k)]
        D(spark(ser, bs["labels"]))
        D(table(["Quarter"] + [s[0] + " $M" for s in ser],
                [[lab] + [fmt(s[1][i]) if i < len(s[1]) else "--" for s in ser]
                 for i, lab in enumerate(bs["labels"])], "n"))
        if fo.get("balanceSheetSource"):
            D(f'<p class=mu>Source: {txt(fo["balanceSheetSource"])}</p>')
    rv = ch.get("revenue") or {}
    if rv.get("labels"):
        nmap = {"nii": "Net interest income", "nonii": "Non-interest income"}
        ser = [(nmap.get(k, k), rv[k]) for k in ("nii", "nonii") if rv.get(k)]
        D("<h4>Revenue ($ millions)</h4>"
          + table(["Quarter"] + [s[0] + " $M" for s in ser],
                  [[lab] + [fmt(s[1][i]) if i < len(s[1]) else "--" for s in ser]
                   for i, lab in enumerate(rv["labels"])], "n"))
        if fo.get("revenueSource"):
            D(f'<p class=mu>Source: {txt(fo["revenueSource"])}</p>')
    if nt.get("labels"):
        def pct(v):
            try:
                return f"{float(v):.2f}%"
            except (TypeError, ValueError):
                return str(v)
        rows = [[lab] + [pct(nt["target"][i]) if i < len(nt.get("target", [])) else "--"]
                for i, lab in enumerate(nt["labels"])]
        hdr = ["Quarter", name + " NIM %"]
        for pn, pv in (nt.get("peers") or {}).items():
            hdr.append(pn + " NIM %")
            for i, r in enumerate(rows):
                r.append(pct(pv[i]) if i < len(pv) else "--")
        D("<h4>Net interest margin</h4>" + table(hdr, rows, "n"))
        if nt.get("note"):
            D(f'<p class=mu>{txt(nt["note"])}</p>')
    if ch or nt:
        D.end()

    # ---- SWOT -------------------------------------------------------------
    sw = d.get("swot") or {}
    if sw:
        D.sec("sw", "SWOT")
        D("<div class=g2>" + "".join(
            f'<div class=c><b class={col}>{lab}</b>{ul(sw.get(k,[]))}</div>'
            for k, lab, col in (("strengths", "Strengths", "g"), ("weaknesses", "Weaknesses", "r"),
                                ("opportunities", "Opportunities", "b"), ("threats", "Threats", "a"))
            if sw.get(k)) + "</div>")
        D.end()

    # ---- maturity ---------------------------------------------------------
    mt = d.get("maturity") or {}
    if mt:
        D.sec("mm", "Analytics maturity",
              f'Overall {mt.get("overall","")} of 5 — {mt.get("tier","")}')
        if mt.get("summary"):
            D(f'<p>{txt(mt["summary"])}</p>')
        dims = mt.get("dimensions", [])
        def sc5(x):
            try:
                return float(x.get("score", 0))
            except (TypeError, ValueError):
                return 0.0
        D(bars([(x.get("title", ""), sc5(x) * 20, f'{x.get("score","")}/5', "b") for x in dims]))
        for x in dims:
            ev = "".join(f'<li><b>{e(v.get("icon","+"))}</b> {txt(v.get("text",""))}'
                         + (f' <span class=mu>({e(v.get("cite",""))})</span>' if v.get("cite") else "")
                         + "</li>" for v in x.get("evidence", []))
            D(f'<div class=pc><h3>{e(x.get("title",""))}<b class=b>{e(x.get("score",""))}/5</b></h3>'
              f'<p>{txt(x.get("summary",""))}</p>' + (f"<ul>{ev}</ul>" if ev else "")
              + (f'<p><b>Implication</b> {txt(x.get("implication",""))}</p>'
                 if x.get("implication") else "") + "</div>")
        D.end()

    # ---- silo assessment --------------------------------------------------
    si = d.get("siloAssessment") or {}
    if si:
        D.sec("si", "Integration and silo assessment",
              f'Integration: {si.get("integration","")} — {si.get("verdict","")}')
        for k in ("intro", "description"):
            if si.get(k):
                D(f'<p>{txt(si[k])}</p>')
        for gp in si.get("groups", []):
            D(f'<div class=pc><h3>{e(gp.get("title",""))}'
              f'<b class={cc(gp.get("status"),"a")}>{e(str(gp.get("status","")).upper())}</b></h3>'
              f'<p>{txt(gp.get("detail",""))}</p>'
              + (f'<p><b>Sales angle</b> {txt(gp.get("salesAngle",""))}</p>'
                 if gp.get("salesAngle") else "") + "</div>")
        for k, lab in (("integrationSignals", "Signals of integration"),
                       ("siloSignals", "Signals of remaining silos")):
            if si.get(k):
                D(f"<h4>{lab}</h4>" + ul(
                    [f'{s.get("signal","")} ({s.get("src","")})' if isinstance(s, dict) else s
                     for s in si[k]]))
        if si.get("salesImplications"):
            D("<h4>Sales implications</h4>" + "".join(
                f'<p><b>{e(x.get("label",""))}</b> {txt(x.get("body",""))}</p>'
                for x in si["salesImplications"]))
        D(links(si.get("siloSrc")))
        D.end()

    # ---- business segments ------------------------------------------------
    if d.get("businessSegments"):
        D.sec("bs", "Business segments")
        D(table(["Segment", "Leadership", "Scale", "Products in play"],
                [[(x.get("name", ""), cc(x.get("colour"))), x.get("head", ""), x.get("stat", ""),
                  x.get("products", "")] for x in d["businessSegments"]]))
        D.end()

    # ---- strategy ---------------------------------------------------------
    pil = d.get("strategyPillars") or []
    if pil or d.get("strategy"):
        D.sec("sg", "Strategy and what is driving them", d.get("strategyIntro", ""))
        if d.get("strategy"):
            D(f'<p>{txt(d["strategy"])}</p>')
        for i, p in enumerate(pil, 1):
            D(f'<div class=pc><h3>{i}. {e(p.get("title",""))}</h3><p>{txt(p.get("body",""))}</p>'
              + (f'<p><b class=b>→ {txt(p.get("curinosLink",""))}</b></p>'
                 if p.get("curinosLink") else "") + "</div>")
        D.end()

    # ---- timing -----------------------------------------------------------
    if d.get("salesTiming"):
        D.sec("tm", "Timing")
        for x in d["salesTiming"]:
            D(f'<div class="hi {cc(x.get("colour"),"a")}"><b>{e(x.get("label",""))}</b>'
              f'<p>{txt(x.get("body",""))}</p>'
              + (f'<p><b>Action</b> {txt(x.get("action",""))}</p>' if x.get("action") else "")
              + "</div>")
        D.end()

    # ---- decision intelligence -------------------------------------------
    if d.get("decisionIntelligence"):
        D.sec("di", "Decision intelligence", "Signal, implication, action")
        for x in d["decisionIntelligence"]:
            s = R.cite(x.get("url"), x.get("source", "") or "source")
            D(f'<div class=pc><h3>{e(x.get("signal",""))}</h3>'
              f'<p><b>Implication</b> {txt(x.get("implication",""))}</p>'
              f'<p><b>Action</b> {txt(x.get("action",""))}</p>'
              + (f'<p class=mu>Source: {s}</p>' if s else "") + "</div>")
        D.end()

    # ---- balance sheet detail --------------------------------------------
    ln, fu = d.get("loans") or {}, d.get("funding") or {}
    mp, lq = d.get("maturityProfile") or {}, d.get("liquidity") or {}
    if ln or fu or mp or lq:
        D.sec("bd", "Balance sheet detail")
    if ln:
        D(f'<h4>Loans — total ${e(ln.get("totalLoansB",""))}B</h4>')
        if ln.get("narrative"):
            D(f'<p>{txt(ln["narrative"])}</p>')
        if ln.get("mix"):
            D(bars([(x.get("label", ""), x.get("pct", 0), f'{x.get("pct","")}% · {x.get("value","")}',
                     cc(x.get("opp"), "b")) for x in ln["mix"]]))
            D(table(["Category", "Share", "Balance", "Opportunity", "Note"],
                    [[x.get("label", ""), f'{x.get("pct","")}%', x.get("value", ""),
                      (str(x.get("opp", "")).upper(), cc(x.get("opp"), "b")), x.get("note", "")]
                     for x in ln["mix"]], "n23"))
        if ln.get("fullSuite"):
            D("<h4>Full loan suite</h4>" + dl(list(ln["fullSuite"].items())))
        if ln.get("source"):
            D(f'<p class=mu>Source: {e(ln["source"])}</p>')
    if fu:
        D(f'<h4>Funding — total deposits ${e(fu.get("totalDepositsB",""))}B</h4>')
        if fu.get("items"):
            D(bars([(x.get("label", ""), x.get("pct", 0), f'{x.get("pct","")}%', cc(x.get("colour")))
                    for x in fu["items"]]))
            D(table(["Funding source", "Balance", "Share", "Note"],
                    [[x.get("label", ""), x.get("value", ""), f'{x.get("pct","")}%', x.get("note", "")]
                     for x in fu["items"]], "n23"))
        if fu.get("salesNote"):
            D(note("Sales note", fu["salesNote"]))
    if mp:
        D("<h4>Funding maturity profile</h4>")
        if mp.get("buckets"):
            D(table(["Bucket", "Value", "Share", "Signal"],
                    [[(x.get("label", ""), cc(x.get("colour"))), x.get("value", ""), x.get("pct", ""),
                      x.get("signal", "")] for x in mp["buckets"]], "n23"))
        if mp.get("salesAngle"):
            D(note("Sales angle", mp["salesAngle"]))
    if lq:
        D("<h4>Liquidity</h4>")
        D(cards([(x.get("label", ""), x.get("value", ""), x.get("note", ""), cc(x.get("colour")))
                 for x in lq.get("kpis", [])], "g3"))
        if lq.get("salesNote"):
            D(note("Sales note", lq["salesNote"]))
    if ln or fu or mp or lq:
        D.end()

    # ---- peers ------------------------------------------------------------
    pe = d.get("peers") or {}
    groups = [(k, v) for k, v in pe.items() if isinstance(v, list) and v
              and isinstance(v[0], dict) and "n" in v[0] and "u" not in v[0]]
    if pe:
        D.sec("pr", "Peer benchmarking",
              " · ".join(k.replace("_", " ") for k, _ in groups))
        if pe.get("basis"):
            D(note("Comparability basis", pe["basis"]))
        for lk, rows in groups:
            if len(groups) > 1:
                D(f'<h4>{e(lk.replace("_", " "))}</h4>')
            cm = [("a", "Assets $B"), ("br", "Branches"), ("st", "States"), ("cet1", "CET1 %"),
                  ("roaa", "ROAA %"), ("nim", "NIM %"), ("eff", "Efficiency %"),
                  ("dep_cost", "Deposit cost %"), ("ldr", "LDR %")]
            cols = [c for c in cm if any(r.get(c[0]) is not None for r in rows)]
            head = "".join(f"<th>{e(l)}</th>" for _, l in cols)
            body = "".join(
                f'<tr{" class=tg" if i == 0 else ""}><td>{e(r.get("n",""))}</td>'
                + "".join(f'<td>{e(r.get(k, "--"))}</td>' for k, _ in cols) + "</tr>"
                for i, r in enumerate(rows))
            D(f'<div class=to><table class="t n"><tr><th>Institution</th>{head}</tr>{body}</table></div>')
        if groups:
            D('<p class=mu>Target institution highlighted. LDR = loan-to-deposit ratio.</p>')
        sm = pe.get("summary") or {}
        if sm:
            D('<div class=g2><div class=c><b class=g>Where they lead</b>' + ul(sm.get("leads", []))
              + '</div><div class=c><b class=a>Where to watch</b>' + ul(sm.get("watch", []))
              + "</div></div>")
        co = pe.get("commentary") or {}
        if co:
            D("<h4>Peer commentary</h4>")
            labs = [("table", "Reading the table"), ("nim", "Net interest margin"),
                    ("radar", "Overall shape"), ("depositCost", "Deposit cost"),
                    ("efficiency", "Efficiency ratio")]
            done = set()
            for k, lab in labs:
                if co.get(k):
                    done.add(k)
                    D(f"<p><b>{lab}.</b> {txt(co[k])}</p>")
            for k, v in co.items():
                if k not in done and v:
                    D(f"<p><b>{e(k)}.</b> {txt(v)}</p>")
        if pe.get("watchlist"):
            D("<h4>Competitive watchlist</h4>")
            for x in pe["watchlist"]:
                D(f'<div class=pc><h3>{e(x.get("competitor",""))}'
                  f'<b class={cc(x.get("colour"),"a")}>{e(x.get("urgency",""))}</b></h3>'
                  f'<p>{txt(x.get("detail",""))}</p></div>')
        if pe.get("salesAngle"):
            D(note("Sales angle", pe["salesAngle"]))
        D(links(pe.get("src"), "Peer sources"))
        D.end()

    # ---- capability gaps --------------------------------------------------
    cg = d.get("capabilityGaps") or {}
    if cg:
        D.sec("cg", "Capability gaps and white space")
        if cg.get("intro"):
            D(f'<p>{txt(cg["intro"])}</p>')
        D("<div class=g3>" + "".join(
            f'<div class=c><b class={col}>{lab}</b>{ul(cg.get(k,[]))}</div>'
            for k, lab, col in (("strengths", "Strengths", "g"), ("gaps", "Gaps", "r"),
                                ("opportunities", "Opportunities", "b")) if cg.get(k)) + "</div>")
        if cg.get("salesNote"):
            D(note("Sales note", cg["salesNote"]))
        D.end()

    # ---- technology -------------------------------------------------------
    if d.get("techPlatforms"):
        D.sec("tp", "Technology platforms")
        for x in d["techPlatforms"]:
            src = x.get("src") or x.get("source") or ""
            D(f'<div class=pc><h3>{e(x.get("name",""))}'
              + (f'<b class={cc(x.get("colour"),"b")}>{e(str(x.get("status","")).upper())}</b>'
                 if x.get("status") else "") + "</h3>"
              + "".join(f'<p>{txt(x[k])}</p>' for k in ("description", "note", "detail") if x.get(k))
              + (f'<p class=mu>Source: {R.cite(x.get("url"), src or "source")}</p>'
                 if src or x.get("url") else "") + "</div>")
        D.end()

    # ---- products ---------------------------------------------------------
    prods = d.get("products") or []
    subt = d.get("productSectionSubtitles") or {}
    if prods:
        D.sec("pf", e(d.get("productFitIntro", "Product fit and sales playbook")),
              d.get("productFitIntroBody", ""))
        # every product carries the same catalogue URL - emitted once, not per card
        purl = next((p["url"] for p in prods if p.get("url")), None)
        if purl:
            D('<p class=mu>Product pages: '
              + R.cite(purl, "Curinos product catalogue") + '</p>')
        if d.get("productScoringNote"):
            D(note("Scoring methodology", d["productScoringNote"]))
        for pri in (1, 2, 3):
            grp = [p for p in prods if p.get("pri") == pri]
            if not grp:
                continue
            D(f'<h3>Priority {pri} · {e(subt.get("p%d" % pri, ""))} '
              f'<span class=mu>({len(grp)} of {len(prods)} scored)</span></h3>')
            for p in grp:
                D(product_card(p, pri))
        # Do-not-recommend: scored, deliberately excluded. Rendered in full (not
        # just as a reason line) so a seller can defend the exclusion in the room.
        dnr = [p for p in prods if p.get("pri") == 0]
        reasons = {x.get("name"): x.get("reason") for x in (d.get("dnrProducts") or [])}
        if dnr or reasons:
            D("<h3>Do not recommend</h3><p class=mu>Scored and deliberately excluded. "
              "Know these so they are never pitched, and so the exclusion can be defended.</p>")
            seen = set()
            for p in dnr:
                seen.add(p.get("name"))
                D(product_card(dict(p, dnr=reasons.get(p.get("name"))), 0))
            left = [[n, r] for n, r in reasons.items() if n not in seen]
            if left:
                D(table(["Product", "Why not"], left))
        D.end()

    # ---- sequencing -------------------------------------------------------
    if d.get("productSequencing"):
        D.sec("ps", "Product sequencing")
        D(table(["Stage", "Products", "Status", "Note"],
                [[x.get("tier", ""), x.get("products", ""),
                  ("ACTIVE NOW", "g") if x.get("active") else ("Later", ""), x.get("note", "")]
                 for x in d["productSequencing"]]))
        D.end()

    # ---- sales playbook ---------------------------------------------------
    if sp:
        D.sec("sp", "Sales playbook", sp.get("intro", ""))
        if sp.get("proofPoints"):
            D("<h4>Proof points</h4>" + cards(
                [("", x.get("stat", ""), x.get("label", ""), cc(x.get("colour")))
                 for x in sp["proofPoints"]], "g4"))
        if sp.get("valueProps"):
            D("<h4>Value proposition by audience</h4>"
              + dl([(x.get("audience", ""), x.get("pitch", "")) for x in sp["valueProps"]]))
        if sp.get("discoveryQ"):
            D("<h4>Discovery questions</h4>")
            for gp in sp["discoveryQ"]:
                qs = "".join(
                    (f'<li><b>{e(x.get("topic",""))}</b> — {txt(x.get("q",""))}</li>'
                     if isinstance(x, dict) else f"<li>{txt(x)}</li>")
                    for x in gp.get("questions", []))
                D(f'<div class=pc><h3>{e(gp.get("audience",""))}</h3><ul>{qs}</ul></div>')
        if sp.get("agenda"):
            D("<h4>Meeting agenda</h4>" + table(
                ["Time", "Segment", "Detail"],
                [[x.get("time", ""), x.get("title", ""), x.get("detail", "")] for x in sp["agenda"]]))
        if sp.get("actionPlan"):
            D("<h4>First 90 days</h4>" + "".join(
                f'<p><b class=b>{e(x.get("period",""))}</b> — {txt(x.get("body",""))}</p>'
                for x in sp["actionPlan"]))
        if sp.get("landmines"):
            D("<h4>Objections and landmines</h4>")
            for x in sp["landmines"]:
                D(f'<div class=pc><h3>“{e(x.get("objection",""))}”'
                  + (f'<b class={cc(x.get("colour"),"a")}>{e(x.get("competitor",""))}</b>'
                     if x.get("competitor") else "")
                  + f'</h3><p><b class=g>Answer</b> {txt(x.get("rebuttal",""))}</p></div>')
        if sp.get("emailTemplates"):
            D("<h4>Email templates</h4>")
            for x in sp["emailTemplates"]:
                D(f'<p><b>{e(x.get("label",""))}</b></p><pre>{e(x.get("body",""))}</pre>')
        D.end()

    # ---- who to call ------------------------------------------------------
    co = d.get("contacts") or {}
    if co:
        D.sec("wc", "Who to call")
        if co.get("strategy"):
            D(note("Entry strategy", co["strategy"]))
        for x in co.get("execs", []):
            D(f'<div class=ex><h3>{e(x.get("name",""))}<em> — {e(x.get("title",""))}</em>'
              + (f'<s>{e(x.get("badge",""))}</s>' if x.get("badge") else "") + "</h3>"
              + (f'<p class=mu>{e(x.get("since",""))}</p>' if x.get("since") else "")
              + (f'<p><b>Relevance</b> {txt(x.get("relevance",""))}</p>' if x.get("relevance") else "")
              + (f'<p><b>How to open</b> {txt(x.get("insight",""))}</p>' if x.get("insight") else "")
              + (f'<p><b class=b>Products</b> {txt(x.get("products",""))}</p>' if x.get("products") else "")
              + "</div>")
        if co.get("targetTeams"):
            D("<h4>Target teams</h4>")
            for x in co["targetTeams"]:
                D(f'<div class=pc><h3>{e(x.get("team",""))}'
                  f'<b class=mu>{e(x.get("size",""))}</b></h3><p>{txt(x.get("approach",""))}</p>'
                  + (f'<p>{txt(x["note"])}</p>' if x.get("note") else "")
                  + (f'<p><b class=b>{txt(x.get("products",""))}</b></p>' if x.get("products") else "")
                  + "</div>")
        D.end()

    # ---- news (present in some intel vintages) ----------------------------
    nw = d.get("news") or {}
    if nw:
        D.sec("nw", nw.get("headline", "Latest news"), nw.get("intro", ""))
        D(cards([("Current price", nw.get("currentPrice", ""), "", "b")]
                if nw.get("currentPrice") else [], "g4"))
        for it in (nw.get("items") or []):
            k = cc(it.get("colour"), "")
            D((f'<div class="pc {k}">' if k else "<div class=pc>")
              + f'<h3>{e(it.get("title",""))}'
              + (f'<b class=mu>{e(it.get("date",""))}</b>' if it.get("date") else "") + "</h3>"
              + (f'<p>{txt(it.get("body",""))}</p>' if it.get("body") else "")
              + (f'<q>{e(it["quote"])}</q>' if it.get("quote") else "")
              + (f'<p class=mu>{e(it.get("quoteAttrib",""))}</p>' if it.get("quoteAttrib") else "")
              + (f'<p><b>Sales angle</b> {txt(it.get("salesAngle",""))}</p>'
                 if it.get("salesAngle") else "")
              + (f'<p class=mu>{R.cite(it.get("url"), it.get("source","") or "source")}</p>'
                 if it.get("source") or it.get("url") else "") + "</div>")
        for th in (nw.get("keyThemes") or []):
            D(f'<div class=pc><h3>{e(th.get("theme",""))}'
              + (f'<b class={cc(th.get("colour") or th.get("urgency"),"a")}>'
                 f'{e(th.get("urgency",""))}</b>' if th.get("urgency") else "") + "</h3>"
              + (f'<p>{txt(th.get("detail",""))}</p>' if th.get("detail") else "")
              + (f'<p><b>Sales angle</b> {txt(th["salesAngle"])}</p>' if th.get("salesAngle") else "")
              + (f'<p class=mu>Source: {R.cite(th.get("url"), th.get("source","") or "source")}</p>'
                 if th.get("source") or th.get("url") else "") + "</div>")
        if nw.get("articles"):
            D("<h4>Coverage</h4>" + table(
                ["Date", "Type", "Headline", "Summary", "Source"],
                [[x.get("date", ""), x.get("tagLabel", ""),
                  R.cite(x.get("url"), x.get("hl", "")) if x.get("url") else x.get("hl", ""),
                  x.get("sum", ""), x.get("src", "")] for x in nw["articles"]]))
        if nw.get("earningsQA"):
            D("<h4>Earnings call Q&amp;A</h4>")
            for qa in nw["earningsQA"]:
                D(f'<div class=pc><h3>{e(qa.get("question",""))}</h3>'
                  + (f'<p class=mu>Asked by {e(qa.get("analyst",""))}</p>' if qa.get("analyst") else "")
                  + (f'<p><b>Answer</b> {txt(qa.get("answer",""))}</p>' if qa.get("answer") else "")
                  + (f'<p><b>Sales angle</b> {txt(qa["salesAngle"])}</p>' if qa.get("salesAngle") else "")
                  + (f'<p class=mu>Source: {R.cite(qa.get("url"), qa.get("source","") or "source")}</p>'
                     if qa.get("source") or qa.get("url") else "") + "</div>")
        if nw.get("analystRatings"):
            D("<h4>Analyst ratings</h4>" + table(
                ["Firm", "Analyst", "Rating", "Target", "Move", "Date", "Note"],
                [[R.cite(x.get("url"), x.get("firm", "")) if x.get("url") else x.get("firm", ""),
                  x.get("analyst", ""), x.get("rating", ""), x.get("target", ""),
                  (str(x.get("direction", "")).upper(),
                   "g" if str(x.get("direction", "")).lower() == "up" else "r"),
                  x.get("date", ""), x.get("note", "")] for x in nw["analystRatings"]], "n2"))
        stw = nw.get("salesTiming") or {}
        if stw:
            D("<h4>Timing windows</h4>")
            if stw.get("intro"):
                D(f'<p>{txt(stw["intro"])}</p>')
            for wdw in (stw.get("windows") or []):
                D(f'<div class="hi {cc(wdw.get("colour"),"a")}"><b>{e(wdw.get("label",""))}</b>'
                  f'<p>{txt(wdw.get("body",""))}</p>'
                  + (f'<p><b>Action</b> {txt(wdw["action"])}</p>' if wdw.get("action") else "")
                  + "</div>")
        for k, lab in (("consensusNote", "Consensus note"), ("salesAngle", "Sales angle"),
                       ("note", "Note")):
            if nw.get(k):
                D(note(lab, nw[k]))
        D(links(nw.get("src")))
        D.end()

    D.sec("sr", "Sources", "Every source cited anywhere in this briefing. "
          "In-text citations link to the numbered entry below.")
    D(R.render())
    D.end()

    D(f'<p class=ft>Generated automatically from public filings and disclosures on '
      f'{e(m.get("generated",""))}. Figures as at {e(q)} unless stated otherwise. This file is '
      f'self-contained: no scripts, no external assets, no network calls. Verify all figures '
      f'before client meetings.</p>')

    D.p[slot] = "<nav>" + "".join(f'<a href="#{i}">{t}</a>' for i, t in D.toc) + "</nav>"

    return (f'<!doctype html><html lang=en><head><meta charset=utf-8>'
            f'<meta name=viewport content="width=device-width,initial-scale=1">'
            f'<title>{e(name)} — Curinos Sales Intelligence</title>'
            f'<style>{CSS_MIN}</style></head><body><div class=w>{D.out()}</div></body></html>')


CSS_MIN = CSS.replace("\n", "")

if __name__ == "__main__":
    with open(sys.argv[1]) as f:
        data = json.load(f)
    out = build(data)
    with open(sys.argv[2], "w") as f:
        f.write(out)
    print(f"{sys.argv[2]}: {len(out.encode('utf-8')):,} bytes")
