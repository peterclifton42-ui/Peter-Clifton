#!/usr/bin/env python3
"""Database helper for the scheduled jobs.

Talks to the Supabase REST API with the secret key in the SUPABASE_SECRET_KEY
environment variable (set in the Claude cloud environment's settings). That key
bypasses row-level security, so it lives only there and in Vercel.

    python3 pipeline/db.py check                    # can we reach the database?
    python3 pipeline/db.py queue                     # institutions due a refresh, best first
    python3 pipeline/db.py institution <slug>
    python3 pipeline/db.py start <refresh|weekly> [slug] "<note>"     # prints the run id
    python3 pipeline/db.py finish <run id> <published|skipped|failed|done> "<note>"
    python3 pipeline/db.py events-due                # passed dates not yet marked reported
    python3 pipeline/db.py events-upcoming [days]    # unconfirmed earnings dates coming up (default 21)
    python3 pipeline/db.py events-latest             # each institution's latest period
    python3 pipeline/db.py set-event <slug> "<period>" [--date D] [--status S] [--kind K] [--source URL] [--note TEXT]
    python3 pipeline/db.py news-targets [n]          # most-followed institutions (default 15)
    python3 pipeline/db.py add-news <slug> <YYYY-MM-DD> "<headline>" "<summary>" "<source name>" <url> --tag <earnings|strategy|digital|partnership|risk> --angle "<sales angle>"

    python3 pipeline/db.py new-queue                 # requested new institutions, oldest first
    python3 pipeline/db.py new-start <request id>    # claim one for this run
    python3 pipeline/db.py new-live <request id> <slug>        # after publishing: link it, add to books, alert
    python3 pipeline/db.py new-failed <request id> "<reason>"  # couldn't build: record why, alert
    python3 pipeline/db.py set-regulatory-id <slug> <fdic|ncua> <id>   # FDIC cert (holding company's lead bank) or NCUA charter
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
    p = sub.add_parser("start"); p.add_argument("job", choices=["refresh", "weekly"]); p.add_argument("rest", nargs="+")
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
    sub.add_parser("new-queue")
    p = sub.add_parser("new-start"); p.add_argument("id", type=int)
    p = sub.add_parser("new-live"); p.add_argument("id", type=int); p.add_argument("slug")
    p = sub.add_parser("new-failed"); p.add_argument("id", type=int); p.add_argument("reason")
    p = sub.add_parser("set-regulatory-id"); p.add_argument("slug"); p.add_argument("source", choices=["fdic", "ncua"]); p.add_argument("id")
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
        }, params={"on_conflict": "slug,headline"}, prefer="resolution=ignore-duplicates,return=representation")
        out({"added": bool(row)})
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


if __name__ == "__main__":
    main()
