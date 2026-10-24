# Weekly task — keep the earnings calendar right and collect fresh news

Runs unattended every Monday morning (scheduled task "Bank Intelligence — weekly calendar and news"). Fresh session: decide everything yourself and never ask questions. Budget: **30 web calls** in total. Your final message is emailed to the owner, so end with a short, plain summary.

Repository: `/home/user/Peter-Clifton`. Run `git pull -q origin main` there; if the folder is missing, `git clone https://github.com/peterclifton42-ui/Peter-Clifton` into it. All database work goes through `python3 pipeline/db.py …`, which uses the `SUPABASE_SECRET_KEY` environment variable. Run `python3 pipeline/db.py check` first: if the key is missing, stop and report exactly that.

Start a run with `python3 pipeline/db.py start weekly "Calendar and news"`. Keep the printed `run_id` as the RUN ID.

## Part 1 — Earnings calendar (about 15 calls)

1. **Dates that have passed but aren't marked reported:** `python3 pipeline/db.py events-due`.
   - **Earnings releases:** confirm each one from the company's own release or SEC 8-K. Then mark it:
     `python3 pipeline/db.py set-event <slug> "<period>" --status reported --date <actual date> --source <url> --note ""`
     If the company has moved the date, set the new `--date` with `--status scheduled`, or leave it `estimated` if the date is still unannounced.
   - **NCUA and FFIEC call-report rows:** mark these `reported` once the quarter's data is public. For NCUA, the quarterly data page lists the quarter; for FFIEC, the call report is on cdr.ffiec.gov. If it isn't public yet, move `--date` out a week.

2. **Unconfirmed earnings dates in the next 21 days:** `python3 pipeline/db.py events-upcoming`. For each, search for the company's announcement. If one exists, run:
   `python3 pipeline/db.py set-event <slug> "<period>" --date <date> --status scheduled --source <url> --note ""`

3. **Make sure every institution has a next period:** `python3 pipeline/db.py events-latest` shows each institution's latest period. Where that period is `reported`, add the following quarter as estimated:
   - **Earnings:** 13 weeks after the reported date.
   - **NCUA:** the first Thursday of the third month after quarter end.
   - **FFIEC:** about 36 days after quarter end.

   Command: `python3 pipeline/db.py set-event <slug> "<next period>" --date <date> --status estimated --kind <earnings|call_report_ncua|call_report_ffiec> --note "Estimated from the previous quarter's date"`

Never mark something reported without a source.

## Part 2 — News (about 15 calls)

`python3 pipeline/db.py news-targets` lists up to 15 institutions, most-followed first. For each one, make one WebSearch: `"<name>" news <current month> <year>`. Keep at most 3 items from the last 14 days that a seller would care about: results, deals, leadership changes, launches, branch moves, regulatory actions and analyst rating changes. Skip stock-price noise and listicles.

Add each item:

`python3 pipeline/db.py add-news <slug> <YYYY-MM-DD> "<headline as published>" "<one plain sentence on why it matters to a seller>" "<publisher>" <url>`

Never invent a figure, and never add an item without a working source URL.

## Finish

`python3 pipeline/db.py finish <RUN ID> done "Calendar: <n> confirmed, <n> marked reported, <n> next-quarter rows. News: <n> items for <n> institutions. <calls> calls."`

If anything fails, run `python3 pipeline/db.py finish <RUN ID> failed "<step>: <exact error>"` and say so plainly in your final message.
