#!/usr/bin/env python3
"""Database helper for the scheduled jobs.

Talks to the Supabase REST API with the secret key in the SUPABASE_SECRET_KEY
environment variable (set in the Claude cloud environment's settings). That key
bypasses row-level security, so it lives only there and in Vercel.

    python3 pipeline/db.py check                    # can we reach the database?
    python3 pipeline/db.py queue                     # institutions due a refresh, best first
    python3 pipeline/db.py institution <slug>
    python3 pipeline/db.py start <refresh|weekly|daily> [slug] "<note>"     # prints the run id
    python3 pipeline/db.py finish <run id> <published|skipped|failed|done> "<note>"
    python3 pipeline/db.py events-due                # passed dates not yet marked reported
    python3 pipeline/db.py events-upcoming [days]    # unconfirmed earnings dates coming up (default 21)
    python3 pipeline/db.py events-latest             # each institution's latest period
    python3 pipeline/db.py set-event <slug> "<period>" [--date D] [--status S] [--kind K] [--source URL] [--note TEXT]
    python3 pipeline/db.py news-targets [n]          # most-followed institutions (default 15)
    python3 pipeline/db.py add-news <slug> <YYYY-MM-DD> "<headline>" "<summary>" "<source name>" <url> --tag <earnings|strategy|digital|partnership|risk> --angle "<sales angle>" [--important]
    python3 pipeline/db.py daily-news-targets        # followed institutions, with their latest news date
    python3 pipeline/db.py brief-context <slug>      # everything needed to write the seller summary (pipeline/BRIEF.md)
    python3 pipeline/db.py set-brief <slug> <brief.json> <refresh|news|backfill>  # save the seller summary
    python3 pipeline/db.py briefs-due [n]            # institutions whose summary is missing or older than their dashboard

    python3 pipeline/db.py new-queue                 # requested new institutions, oldest first
    python3 pipeline/db.py new-start <request id>    # claim one for this run
    python3 pipeline/db.py new-live <request id> <slug>        # after publishing: link it, add to books, alert
    python3 pipeline/db.py new-failed <request id> "<reason>"  # couldn't build: record why, alert
    python3 pipeline/db.py set-regulatory-id <slug> <fdic|ncua> <id>   # FDIC cert (holding company's lead bank) or NCUA charter
    python3 pipeline/db.py set-peer-group <slug> <proxy|10-k|investor deck> <url> <year> "<Peer A> | <Peer B> | ..."  # the bank's own disclosed peer group
Every command prints JSON.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = "https://zwevbnccqixavejvlwhb.supabase.co"


def key():
    k = os.environ.get("SUPABASE_SECRET_KEY")
    if not k:
        sys.exit("SUPABASE_SECRET_KEY is not set in this environment. Add it in the Claude cloud environment's "
                 "settings (Environment variables), then start a new session.")
    return k


def request(method, path, body=None, params=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, safe="(),.*:")
    headers = {"apikey": key(), "Authorization": f"Bearer {key()}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data, headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"Database error {e.code} on {method} {path}: {e.read().decode()[:400]}")


def rpc(fn, body=None):
    return request("POST", f"rpc/{fn}", body or {})


def out(value):
    print(json.dumps(value, indent=1, default=str))


def now():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def today():
    import datetime
    return datetime.date.today().isoformat()


def plus_days(days):
    import datetime
    return (datetime.date.today() + datetime.timedelta(days=days)).isoformat()


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    sub.add_parser("queue")
    p = sub.add_parser("institution"); p.add_argument("slug")
    p = sub.add_parser("start"); p.add_argument("job", choices=["refresh", "weekly", "daily"]); p.add_argument("rest", nargs="+")
    p = sub.add_parser("finish"); p.add_argument("id", type=int)
    p.add_argument("status", choices=["published", "skipped", "failed", "done"]); p.add_argument("note")
    sub.add_parser("events-due")
    p = sub.add_parser("events-upcoming"); p.add_argument("days", nargs="?", type=int, default=21)
    sub.add_parser("events-latest")
    p = sub.add_parser("set-event"); p.add_argument("slug"); p.add_argument("period")
    for flag in ("--date", "--status", "--kind", "--source", "--note"):
        p.add_argument(flag)
    p = sub.add_parser("news-targets"); p.add_argument("n", nargs="?", type=int, default=15)
    p = sub.add_parser("add-news")
    for name in ("slug", "date", "headline", "summary", "source_name", "url"):
        p.add_argument(name)
    p.add_argument("--tag", choices=["earnings", "strategy", "digital", "partnership", "risk"], default="strategy")
    p.add_argument("--angle", help="one sentence on how a seller could use it")
    p.add_argument("--important", action="store_true", help="results, M&A, leadership, regulatory/credit risk, ratings or a major strategy move")
    sub.add_parser("daily-news-targets")
    p = sub.add_parser("brief-context"); p.add_argument("slug")
    p = sub.add_parser("set-brief"); p.add_argument("slug"); p.add_argument("file"); p.add_argument("trigger", choices=["refresh", "news", "backfill"])
    p = sub.add_parser("briefs-due"); p.add_argument("n", nargs="?", type=int, default=10)
    sub.add_parser("new-queue")
    p = sub.add_parser("new-start"); p.add_argument("id", type=int)
    p = sub.add_parser("new-live"); p.add_argument("id", type=int); p.add_argument("slug")
    p = sub.add_parser("new-failed"); p.add_argument("id", type=int); p.add_argument("reason")
    p = sub.add_parser("set-regulatory-id"); p.add_argument("slug"); p.add_argument("source", choices=["fdic", "ncua"]); p.add_argument("id")
    p = sub.add_parser("set-peer-group"); p.add_argument("slug"); p.add_argument("source", choices=["proxy", "10-k", "investor deck"])
    p.add_argument("url"); p.add_argument("year", type=int); p.add_argument("names")
    a = ap.parse_args()

    if a.cmd == "check":
        rows = request("GET", "institutions", params={"select": "slug", "limit": "1"})
        out({"ok": True, "institutions_reachable": bool(rows)})
    elif a.cmd == "queue":
        out(rpc("pipeline_refresh_queue"))
    elif a.cmd == "institution":
        out(request("GET", "institutions", params={
            "slug": f"eq.{a.slug}",
            "select": "slug,name,category,type_label,ticker,hq,assets_b,latest_quarter,opportunity"}))
    elif a.cmd == "start":
        slug, note = (a.rest[0], " ".join(a.rest[1:])) if len(a.rest) > 1 else (None, a.rest[0])
        row = request("POST", "refresh_runs", {"job": a.job, "slug": slug, "note": note}, prefer="return=representation")
        out({"run_id": row[0]["id"]})
    elif a.cmd == "finish":
        request("PATCH", "refresh_runs", {"status": a.status, "note": a.note, "finished_at": now()},
                params={"id": f"eq.{a.id}"})
        out({"run_id": a.id, "status": a.status})
    elif a.cmd == "events-due":
        out(request("GET", "earnings_events", params={
            "select": "slug,period,event_date,kind,status,source_url,institutions(name,ticker)",
            "status": "neq.reported", "event_date": f"lte.{today()}", "order": "event_date"}))
    elif a.cmd == "events-upcoming":
        out(request("GET", "earnings_events", params={
            "select": "slug,period,event_date,kind,status,institutions(name,ticker)",
            "status": "eq.estimated", "kind": "eq.earnings",
            "and": f"(event_date.gte.{today()},event_date.lte.{plus_days(a.days)})", "order": "event_date"}))
    elif a.cmd == "events-latest":
        rows = request("GET", "earnings_events", params={
            "select": "slug,period,event_date,kind,status", "order": "event_date.desc"})
        latest = {}
        for r in rows:
            latest.setdefault(r["slug"], r)
        out(list(latest.values()))
    elif a.cmd == "set-event":
        fields = {k: v for k, v in {"event_date": a.date, "status": a.status, "kind": a.kind,
                                     "source_url": a.source, "note": a.note}.items() if v is not None}
        if a.note == "":
            fields["note"] = None  # an empty --note clears it
        fields["updated_at"] = now()
        match = {"slug": f"eq.{a.slug}", "period": f"eq.{a.period}"}
        existing = request("GET", "earnings_events", params={**match, "select": "id"})
        if existing:
            row = request("PATCH", "earnings_events", fields, params=match, prefer="return=representation")
        else:
            missing = [f for f in ("event_date", "status") if f not in fields]
            if missing:
                sys.exit(f"New event {a.slug} {a.period} needs --date and --status")
            row = request("POST", "earnings_events", {"slug": a.slug, "period": a.period, **fields},
                          prefer="return=representation")
        out(row)
    elif a.cmd == "news-targets":
        institutions = request("GET", "institutions", params={"select": "slug,name,assets_b"})
        follows = request("GET", "favourites", params={"select": "slug"})
        counts = {}
        for f in follows:
            counts[f["slug"]] = counts.get(f["slug"], 0) + 1
        institutions.sort(key=lambda i: (-counts.get(i["slug"], 0), -(i["assets_b"] or 0)))
        out([{**i, "followers": counts.get(i["slug"], 0)} for i in institutions[:a.n]])
    elif a.cmd == "add-news":
        row = request("POST", "news_items", {
            "slug": a.slug, "published_on": a.date, "headline": a.headline, "summary": a.summary,
            "source_name": a.source_name, "url": a.url, "tag": a.tag, "sales_angle": (a.angle or "").strip() or None,
            "importance": "high" if a.important else "normal",
        }, params={"on_conflict": "slug,headline"}, prefer="resolution=ignore-duplicates,return=representation")
        out({"added": bool(row)})
    elif a.cmd == "daily-news-targets":
        follows = request("GET", "favourites", params={"select": "slug"}) or []
        counts = {}
        for f in follows:
            counts[f["slug"]] = counts.get(f["slug"], 0) + 1
        if not counts:
            out([])
            return
        insts = request("GET", "institutions", params={"select": "slug,name,ticker,hq", "slug": f"in.({','.join(counts)})"})
        news = request("GET", "news_items", params={"select": "slug,published_on", "slug": f"in.({','.join(counts)})", "order": "published_on.desc"}) or []
        last = {}
        for n in news:
            last.setdefault(n["slug"], n["published_on"])
        insts.sort(key=lambda i: (-counts[i["slug"]], i["name"]))
        out([{**i, "followers": counts[i["slug"]], "latest_news": last.get(i["slug"])} for i in insts])
    elif a.cmd == "brief-context":
        out(brief_context(a.slug))
    elif a.cmd == "set-brief":
        out(set_brief(a.slug, a.file, a.trigger))
    elif a.cmd == "briefs-due":
        insts = request("GET", "institutions", params={"select": "slug,name,current_snapshot_id", "current_snapshot_id": "not.is.null"})
        briefs = {b["slug"]: b for b in request("GET", "bank_briefs", params={"select": "slug,snapshot_id,written_at"}) or []}
        follows = request("GET", "favourites", params={"select": "slug"}) or []
        counts = {}
        for f in follows:
            counts[f["slug"]] = counts.get(f["slug"], 0) + 1
        due = [i for i in insts if i["slug"] not in briefs or briefs[i["slug"]]["snapshot_id"] != i["current_snapshot_id"]]
        due.sort(key=lambda i: (i["slug"] in briefs, -counts.get(i["slug"], 0), i["name"]))
        out([{"slug": i["slug"], "name": i["name"], "has_brief": i["slug"] in briefs, "followers": counts.get(i["slug"], 0)} for i in due[:a.n]])
    elif a.cmd == "new-queue":
        out(rpc("pipeline_new_institution_queue"))
    elif a.cmd == "new-start":
        rpc("pipeline_new_institution_start", {"p_id": a.id})
        out({"claimed": a.id})
    elif a.cmd == "new-live":
        out({"live": a.slug, "people_told": rpc("pipeline_new_institution_live", {"p_id": a.id, "p_slug": a.slug})})
    elif a.cmd == "new-failed":
        rpc("pipeline_new_institution_failed", {"p_id": a.id, "p_reason": a.reason})
        out({"failed": a.id})
    elif a.cmd == "set-regulatory-id":
        request("POST", "regulatory_ids", {"slug": a.slug, "source": a.source, "id": a.id},
                params={"on_conflict": "slug"}, prefer="resolution=merge-duplicates")
        out({"slug": a.slug, a.source: a.id})
    elif a.cmd == "set-peer-group":
        names = [n.strip() for n in a.names.split("|") if n.strip()]
        if len(names) < 3:
            sys.exit("A peer group needs at least 3 names, separated by |")
        covered = request("GET", "institutions", params={"select": "slug,name"}) or []
        peers = [{"name": n, "slug": next((c["slug"] for c in covered if c["slug"] != a.slug and peer_name(c["name"]) == peer_name(n)), None)} for n in names]
        request("POST", "peer_groups", {"slug": a.slug, "source": a.source, "source_url": a.url, "year": a.year, "peers": peers, "collected_at": now()},
                params={"on_conflict": "slug"}, prefer="resolution=merge-duplicates")
        out({"slug": a.slug, "peers": len(peers), "covered": [p["slug"] for p in peers if p["slug"]]})


# The full report's tabs and the section ids a summary action may link to
# (lib/dashboard-tabs.ts keeps the same list for the app).
DASHBOARD_SECTIONS = {
    "Financial Overview": ["fo-theme", "fo-metrics", "fo-charts", "fo-nii", "fo-fees"],
    "Organisation & People": ["op-overview", "op-leadership", "op-structure", "op-market", "op-silo", "op-targets"],
    "Balance Sheet & Funding": ["bs-funding", "bs-deposit-mix", "bs-loans", "bs-maturity", "bs-sales", "bs-suite"],
    "Strategy & Health": ["sh-themes", "sh-pillars", "sh-swot", "sh-timing"],
    "Analytics & Technology": ["at-angle", "at-dii", "at-gaps", "at-maturity", "at-platforms"],
    "Peer Comparison": ["pc-snapshot", "pc-table", "pc-nim", "pc-deposit", "pc-efficiency", "pc-leads", "pc-watchlist"],
    "Product Fit & Playbook": ["pp-plan", "pp-valueprops", "pp-discovery", "pp-proofpoints", "pp-landmines", "pp-emails", "pp-agenda", "pp-calc"],
    "Recent News": ["n-news", "n-press", "n-qa", "n-themes-analyst", "n-ratings", "n-timing"],
}


def brief_context(slug):
    inst = request("GET", "institutions", params={"slug": f"eq.{slug}", "select": "slug,name,category,assets_b,latest_quarter,current_snapshot_id"})
    if not inst or not inst[0]["current_snapshot_id"]:
        sys.exit(f"No published dashboard for {slug}")
    inst = inst[0]
    snap = request("GET", "snapshots", params={"id": f"eq.{inst['current_snapshot_id']}", "select": (
        "loaded_at,theme:data->finOverview->salesTheme,timing:data->salesTiming,angle:data->curinosAngle,"
        "health:data->healthRating,swot:data->swot,metrics:data->metrics,products:data->products,execs:data->contacts->execs")})[0]
    products = [{"name": p.get("name"), "priority": p.get("pri"), "fit": p.get("fit"), "why": p.get("why"), "talk": p.get("talk")}
                for p in (snap.get("products") or [])]
    execs = [{k: e.get(k) for k in ("name", "title", "insight", "relevance")} for e in (snap.get("execs") or [])]
    news = request("GET", "news_items", params={"slug": f"eq.{slug}", "select": "published_on,headline,summary,sales_angle,importance",
                                                "order": "published_on.desc", "limit": "10"})
    official = request("GET", "regulatory_metrics", params={"slug": f"eq.{slug}", "select": "period,nim,deposit_cost,ldr,deposit_growth,efficiency,roa",
                                                            "order": "period.desc", "limit": "2"})
    ws = request("GET", "whitespace", params={"slug": f"eq.{slug}", "select": "product_slug,status,target_quarter,acv_usd,note"})
    events = request("GET", "earnings_events", params={"slug": f"eq.{slug}", "select": "period,event_date,status,kind", "order": "event_date.desc", "limit": "3"})
    current = request("GET", "bank_briefs", params={"slug": f"eq.{slug}", "select": "situation,actions,written_at"})
    return {
        "institution": {k: inst[k] for k in ("slug", "name", "category", "assets_b", "latest_quarter")},
        "researched_at": snap["loaded_at"], "sales_theme": snap.get("theme"), "health": snap.get("health"),
        "timing": snap.get("timing"), "curinos_angle": snap.get("angle"), "swot": snap.get("swot"), "metric_cards": snap.get("metrics"),
        "products": products, "executives": execs, "news": news, "official_metrics": official, "whitespace": ws,
        "calendar": events, "current_brief": current[0] if current else None, "report_sections": DASHBOARD_SECTIONS,
    }


def set_brief(slug, path, trigger):
    with open(path) as f:
        b = json.load(f)
    situation = (b.get("situation") or "").strip()
    actions = b.get("actions") or []
    problems = []
    if not 200 <= len(situation) <= 1200:
        problems.append(f"situation must be 200-1200 characters (is {len(situation)})")
    if len(actions) != 3:
        problems.append(f"exactly 3 actions needed (got {len(actions)})")
    for i, act in enumerate(actions, 1):
        if not (act.get("title") or "").strip() or not (act.get("why") or "").strip():
            problems.append(f"action {i} needs a title and a why")
        tab, at = act.get("tab"), act.get("at")
        if tab is not None and tab not in DASHBOARD_SECTIONS:
            problems.append(f"action {i}: unknown tab {tab!r}")
        elif at is not None and (tab is None or at not in DASHBOARD_SECTIONS[tab]):
            problems.append(f"action {i}: section {at!r} is not on tab {tab!r}")
    if problems:
        sys.exit("Brief not saved: " + "; ".join(problems))
    inst = request("GET", "institutions", params={"slug": f"eq.{slug}", "select": "current_snapshot_id"})
    if not inst:
        sys.exit(f"Unknown institution {slug}")
    row = {"slug": slug, "situation": situation, "trigger": trigger, "snapshot_id": inst[0]["current_snapshot_id"],
           "actions": [{"title": x["title"].strip(), "why": x["why"].strip(), "tab": x.get("tab"), "at": x.get("at")} for x in actions],
           "news_through": today(), "written_at": now()}
    request("POST", "bank_briefs", row, params={"on_conflict": "slug"}, prefer="resolution=merge-duplicates")
    return {"saved": slug, "trigger": trigger}


# Same matching as lib/requests.ts: corporate suffixes stripped, whole-word containment.
SUFFIX = r"\b(the|corporation|corp|incorporated|inc|company|co|bancorp(oration)?|bancshares|bankshares|banc|financial|holdings?|group|federal credit union|credit union|fcu|bank|n\.?a\.?)\b\.?"


def normal_name(name):
    import re
    s = re.sub(SUFFIX, " ", name.lower().replace(".", "").replace("&", " and "))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()


# Stricter than same_institution, for peer groups: only legal forms are dropped, so
# "First Financial Bancorp" and "First Financial Bankshares" stay apart.
LEGAL = r"\b(the|corporation|corp|incorporated|inc|company|co|na|n a|ltd)\b"


def peer_name(name):
    import re
    s = name.lower().replace(".", "").replace("&", " and ").replace("/", " ")
    s = re.sub(r"\(.*?\)", " ", s).replace("bancorporation", "bancorp").replace("bankcorp", "bancorp")
    s = re.sub(LEGAL, " ", re.sub(r"[^a-z0-9 ]+", " ", s))
    return re.sub(r"\s+", " ", s).strip()


def same_institution(a, b):
    import re
    x, y = normal_name(a), normal_name(b)
    if not x or not y:
        return False
    if x == y:
        return True
    short, long = (x, y) if len(x) < len(y) else (y, x)
    return len(short) >= 4 and re.search(rf"\b{re.escape(short)}\b", long) is not None


if __name__ == "__main__":
    main()
