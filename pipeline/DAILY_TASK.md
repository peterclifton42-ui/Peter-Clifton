# Daily task — results confirmed, news for followed banks, and summaries that news changes

Runs unattended every day (scheduled task "Bank Intelligence — daily news"). Fresh session: decide everything yourself and never ask questions. Your final message is emailed to the owner, so end with a short, plain summary.

Repository: `/home/user/Peter-Clifton` (if it is missing, `git clone https://github.com/peterclifton42-ui/Peter-Clifton` there). Database: only through `python3 pipeline/db.py …`, which uses the `SUPABASE_SECRET_KEY` environment variable.

## Step 0 — Set up

1. `cd /home/user/Peter-Clifton && git pull -q origin main && python3 pipeline/db.py check`. If it says the key is not set, stop and report exactly that.
2. `python3 pipeline/db.py start daily "Daily news"` and keep the printed `run_id` as the RUN ID.

## Step 1 — Confirm results that have come out (at most 10 calls)

The refresh job only re-researches a bank once its results are out, so the calendar has to say so promptly. `python3 pipeline/db.py events-due` lists results dates that have passed but aren't marked reported. For each **earnings** row (skip call report rows; the weekly job handles those), make one WebSearch for the release, for example `"<name>" third quarter 2026 results`. If it is out, mark it with the release URL:

`python3 pipeline/db.py set-event <slug> "<period>" --status reported --date <actual release date> --source <url> --note ""`

If it isn't out yet, move the date to the announced one (or a week later if none is announced): `python3 pipeline/db.py set-event <slug> "<period>" --date <date>`. Never mark a row reported without a source. If more than 10 are due, do the most-followed first (`daily-news-targets` order) and leave the rest for tomorrow.

## Step 2 — News (one or two web calls per institution, at most 45)

`python3 pipeline/db.py daily-news-targets` lists every institution a seller follows, with the date of its latest collected news. **The window** for each is everything published after its `latest_news` date, or the last 21 days if it has none.

**Search with dates in the query**, or the results are mostly stale: `"<name>" news <Month> <year>` (for example `"UMB Financial" news October 2026`), adding the ticker for a listed bank. When a month has only just started, also search the previous month. If the institution's results came out inside the window (Step 1, or `python3 pipeline/db.py events-latest`), the results release and its coverage must be among what you find: if the first search misses them, make a second search for `"<name>" <quarter> results`. Keep items that a seller would care about: results and guidance, deals, leadership changes, launches, branch moves, regulatory actions and analyst rating changes. Skip stock-price noise, listicles, and anything already listed (the command ignores duplicate headlines anyway). Fetch an article only when the search snippet doesn't say enough to write the summary honestly, or to confirm its date.

Add each item:

`python3 pipeline/db.py add-news <slug> <YYYY-MM-DD> "<headline as published>" "<one plain sentence on why it matters to a seller>" "<publisher>" <url> --tag <tag> --angle "<sales angle>" [--important]`

- `--tag`: `earnings` (results, guidance, analyst ratings), `strategy` (M&A, leadership, branches, pricing moves), `digital` (technology, apps, launches), `partnership` (vendors, fintechs, other banks) or `risk` (regulatory, credit or legal issues).
- `--important`: news a seller must know before the next call: results and guidance, M&A, leadership changes (C-suite or business-line heads), regulatory or credit-risk issues, rating changes and major strategy moves. Leave it off routine items (awards, community news, small hires, product promotions). Important items lead the Home news feed.
- `--angle`: one sentence on how a Curinos seller could use it in a conversation. Facts from the article only, no product claims. For a credit union, say members.

Never invent a figure, and never add an item without a working source URL. Most days most banks have nothing new: that is fine.

## Step 3 — Rewrite the summaries the news changes

For every institution where you added an `--important` item today, rewrite its seller summary by following `pipeline/BRIEF.md` with trigger `news`. Keep what still holds; change what the news changes (for example a new CEO becomes someone to call, an acquisition changes the first action).

## Finish

`python3 pipeline/db.py finish <RUN ID> done "Daily: <n> results confirmed. News: <n> items (<n> important) for <n> institutions; <n> summaries rewritten. <calls> calls."`

If anything fails, run `python3 pipeline/db.py finish <RUN ID> failed "<step>: <exact error>"` and say so plainly in your final message.
