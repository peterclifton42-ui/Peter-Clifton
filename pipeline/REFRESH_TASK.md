# Refresh task — research one institution and publish its new dashboard

Runs unattended every two hours (scheduled task "Bank Intelligence — refresh one dashboard"), so earnings-season backlogs clear in a day or two; when nothing is due it exits in a minute. Fresh session: decide everything yourself and never ask questions. This replaces the old Run A / Run B pair. The research half is Run A's routine, unchanged. The publish half is now a single command, and there is no email to Curinos: the app is the delivery.

Repository: `/home/user/Peter-Clifton` (if it is missing, `git clone https://github.com/peterclifton42-ui/Peter-Clifton` there). Database: the Supabase project `bank-intelligence`, reached only through `python3 pipeline/db.py …` (and `pipeline/publish.py`). Both use the `SUPABASE_SECRET_KEY` environment variable. Run `python3 pipeline/db.py check` first: if it says the key is not set, stop and report exactly that.

**Success is one institution published, or a clean skip.** A failed run must leave the live dashboard untouched. Publishing happens only in step 7, after every check has passed. Your final message is emailed to the owner, so end with a short, plain summary.

---

## Step 0 — Set up and guard

1. `cd /home/user/Peter-Clifton && git pull -q origin main && python3 pipeline/db.py check`.
2. Run `date -u`. You fire every two hours at 7 minutes past (00:07, 02:07, … 22:07 UTC). If it is more than 90 minutes past the latest of those slots, you are a stalled session that resumed late: do nothing and stop.
3. Make a working folder, `mkdir -p /tmp/refresh && cd /tmp/refresh`, and copy into it:
   - `reference/score_v4.py`
   - `reference/claude/bank-benchmark-2026Q2.json`. Use a newer `bank-benchmark-*.json` instead if `reference/claude/` has one. Keep the file name; the scorer finds it by that name.
   - `reference/claude/check_completeness.py`
   - `reference/claude/check_contamination.py`

## Step 1 — Pick the institution

**New institutions come first.** Sellers can request a dashboard for a bank or credit union the app doesn't cover yet (Banks → "Request a new bank or credit union"). Build at most one per run, before any routine refresh:

```bash
python3 pipeline/db.py new-queue
```

If it returns a request, follow **"Building a new institution"** at the end of this file instead of the rest of Step 1, then carry on from Step 2 as usual. If it is empty, continue here with the routine queue:

```bash
python3 pipeline/db.py queue
```

The queue lists institutions whose latest published results are newer than their dashboard, plus any institution a seller asked to refresh (the "Request full refresh" button, which works on any bank). Requested ones come first, then most-followed, then oldest results first. A requested bank may already have its latest results in the dashboard: research it fully anyway, using the latest reported quarter (`period` may be empty if no results are recorded; then use the latest quarter you can source). It leaves out anything another run claimed in the last 6 hours. Take the **first** entry.

- **Empty list:** don't record a run. Instead catch up on seller summaries: run `python3 pipeline/db.py briefs-due 3` and, for each institution it lists, write its summary by following `pipeline/BRIEF.md` with trigger `backfill` (no web calls; everything comes from `brief-context`). Then stop, with a one-line summary such as "Queue empty; wrote 3 summaries". If `briefs-due` is empty too, just stop: that is a correct outcome.
- **Otherwise, claim it:** `python3 pipeline/db.py start refresh <slug> "Researching <period> results"`. Keep the printed `run_id` as the RUN ID.

To see what the institution is: `python3 pipeline/db.py institution <slug>`. Keep the same slug; the app tracks it by that.

## Step 2 — Read the method

Read these sections, not whole files you don't need:

- `reference/curinos-intel-SKILL.md`: the JSON schema and every v2.4–v2.8 field contract. These are what keep panels from going blank.
- `reference/CURINOS_PRODUCT_CATALOGUE_V4.md`: Sections A, B, C, CO and K in full, plus Sections D–H for product narrative.
- `reference/CURINOS_DATA_INTEGRITY_PROTOCOL.md`.

Rules that carry over from Run A:

- Curinos One is sold **alongside** the pillar products. Commit, Conserve and Calibrate are COMING SOON (capped at P3, never "available").
- Amplero and Treasury Strategies are retired. eBenchmarkers – Banking is UK-only.
- The Catalogue's §K2 and §K6 examples are fictional schema illustrations: never copy a value from them.
- **Archive isolation:** do not read other institutions' dashboards from the database. Source every peer figure fresh. A previously covered bank may be a legitimate peer, but it belongs in the `peers` block and nowhere else.

## Step 3 — Research (40 web calls in total)

A web call is one WebSearch or one WebFetch. Count them as you go.

| Phase | Calls | Rule |
|---|---|---|
| Registry lookup | 1–2, mandatory | FDIC BankFind for the operating bank (or the NCUA charter for a credit union). Start with WebSearch: `site:fdic.gov bankfind "[legal name]"`, then fetch the details page. Fills `basic.fdic`, `structure.bank.fdic`, `structure.bank.rssd`, `basic.rssd`/`structure.parent.rssd`, `basic.employees` and `basic.est` |
| Subject research | 24–28 | The source checklist below, in order. Move to peers by call 32 at the latest (call 28 for a credit union) |
| Peers | 4 for a bank, 8 for a credit union, reserved | **Banks: 2 peers** × (same-quarter release + one follow-up). The app compares every bank with its official peer group on call report figures (Compare and the Summary page), so the hand-sourced peers now only supply what the call reports don't: loan yield, deposits per branch and service charges, which the scorer needs. **Credit unions: 4 peers** as before, since there is no official peer data for them. **Choose peers from the bank's own disclosed peer group first** (item 6), the closest in size and business model, and say which you used in `peers.salesAngle` |
| Completeness pass | up to 5 | Only on what `check_completeness.py` reports as FAIL |

**Source checklist (subject):**
1. The **new** quarterly earnings release (SEC 8-K Ex.99.1), the one in the queue row. It fills the metric cards and 5 quarters of balance sheet, NII, fees, deposit mix and loan mix.
2. The prior-quarter or year-ago release or supplement, for quarters 6–8 of the charts.
3. The earnings call transcript: guidance, named analyst Q&A, quotes, deposit beta.
4. The latest 10-Q: the NII rate-sensitivity table, liquidity (uninsured deposits, AOCI, borrowing capacity), the CD maturity schedule and segments.
5. The latest 10-K: FTEs, branch count and states, segments, competition.
6. The proxy or leadership page: at least 4 executives, with start years and backgrounds. **While in the proxy statement (DEF 14A), find its compensation peer group** (the list of banks the board benchmarks pay against; if there is none, the 10-K's performance-graph peer index). Record it straight away, names exactly as listed:
   `python3 pipeline/db.py set-peer-group <slug> proxy <DEF 14A URL> <proxy year> "<Peer A> | <Peer B> | ..."` (use `10-k` and the 10-K URL for a performance-graph index). Banks that file with the FDIC instead of the SEC (Bank OZK, TowneBank) publish the proxy at `https://securitiesfilings.fdicconnect.fdic.gov/api/instflng/cert/<FDIC cert>` (a JSON list of filings; the PDF is `/api/instflng/<instFlngId>/attachment/<instFlngAtchId>`). Skip for credit unions and private banks, which don't publish one; if the group was collected in the last 12 months (`peer_groups`), don't spend a call on it.
7. The investor presentation: strategy pillars, targets, digital metrics.
8. Analyst ratings: at least 3 firms, each with a rating and a price target.
9. Technology and vendors: at least 3 `techPlatforms[]` entries, each with a URL.
10. News from the last 90 days: at least 6 `news.items` and 5 `news.articles`.
11. The bank's own product pages, as evidence for `scoringInputs.segments`.

**Credit unions:** `scoringInputs.type` is `credit_union`. Benchmark against NCUA system averages (the FDIC benchmark never applies), and remember the loan-to-share signal is inverted. Say members, never customers. Never say "margin extraction" or "cross-sell"; Curinos One is "member relevance".

**No metric may be estimated.** Write "not disclosed" and list the gap in `dataGaps`. Chart values are stored in $M, and a one-point trend is worse than no chart. Every metric card needs a real URL in `t.src`. Peer rows hold numbers, never strings. Emit `meta.opportunityRationale` in camelCase. Set `meta.latestQuarter` to the new quarter (for example "Q3 2026").

Write the intel JSON to `/tmp/refresh/intel.json`, with `meta.slug` set to the slug from step 1.

## Step 4 — Score with score_v4.py (never by hand)

Assign the maturity tier first. Then write `scoringInputs` per Catalogue §K2. `assetsB` and `tier` are numbers, never null. A segment is `true` only on evidence and `false` only on evidence of absence; otherwise it is `null`.

```bash
cd /tmp/refresh && python3 score_v4.py intel.json --write
```

- For a bank, the first line must name the benchmark file.
- Exit code 2 means NEEDS NARRATIVE. Write `what`, `why`, `need`, `roi`, `time`, `talk`, `use[]`, `objections[]` and `contacts` for each product it lists, honouring the card rules (unknown ≠ absent, benchmark cap, roadmap, availability unconfirmed).
- Re-run until it exits with code 0.
- If a score looks wrong, the evidence is wrong. Fix `scoringInputs`; never edit `fit`, `pri` or `scoring` by hand.

### Step 4b — Close the "unknown" caps before publishing

A product capped with **"Unknown ≠ absent: unconfirmed …"** has a fact the research didn't settle, not a fact that's false. For every such product with **fit 60 or more**, settle the fact before publishing, then re-run the scorer:

- **Branch count:** take it from the regulator, no web call needed. Banks: `https://api.fdic.gov/banks/institutions?filters=CERT:<cert>&fields=NAME,OFFICES,REPDTE` (the FDIC cert is in `pipeline/regulatory-ids.csv`); set `scoringInputs.branches` to `OFFICES`. Credit unions: the institution's own branch finder or latest annual report; if only a lower bound is sourced, set `branchesMin`.
- **smallBusiness / sbLending / treasuryManagement / cashSweep / commercial:** one search each on the institution's own site (business banking, SBA lending, treasury management or sweep pages) or its 10-K. Set the segment to `true` with the page as the source, or `false` if the institution clearly doesn't offer it.
- **alco:** presumed at $10B and above (the scorer does this); below $10B, look for an asset-liability committee in the 10-K or proxy.
- Budget: at most 4 calls for this step. A fact you still can't settle stays `null`, and the cap stays, with the gap stated.

## Step 5 — Completeness and contamination gates

```bash
cd /tmp/refresh
python3 check_completeness.py intel.json
python3 check_contamination.py intel.json /home/user/Peter-Clifton/pipeline/covered-institutions.md <slug>
```

- Completeness: aim for 15/15; you may publish at 12/15 or better. Spend your completeness calls on the FAILs. A failing check is never a licence to estimate.
- Contamination must exit 0. Fix every hit by rewriting comparisons against the figure, not against a named bank.
- If you changed `scoringInputs`, re-run the scorer.

## Step 6 — Dry run

```bash
cd /home/user/Peter-Clifton && python3 pipeline/publish.py /tmp/refresh/intel.json --dry-run
```

It builds the dashboard, runs the validator and renders all 8 tabs. Fix anything it reports in `intel.json` and repeat until it prints `DRY RUN OK`.

## Step 7 — Publish

```bash
cd /home/user/Peter-Clifton && python3 pipeline/publish.py /tmp/refresh/intel.json --source "refresh <period>"
```

It repeats every check, then uploads. It must print `PUBLISHED — <slug> is live as snapshot <id>`.

### Step 7b — Write the seller summary

Follow `pipeline/BRIEF.md` with trigger `refresh`. It takes a few minutes and no web calls: the summary is written from the dashboard you just published, the official figures, the news and the team's whitespace. If `set-brief` refuses it, fix what it says and save again; a failed summary never undoes the publish (note it in the finish line instead).

## Step 8 — Close the run

```bash
python3 pipeline/db.py finish <RUN ID> published "<period>: completeness n/15, <calls> calls, <peers> peers, benchmark <file>"
```

Then stop, with a short summary as your final message.

## If anything fails

Leave the live dashboard as it is: never publish a partial build. Run:

```bash
python3 pipeline/db.py finish <RUN ID> failed "<step>: <exact error>"
```

End with a final message that names the institution, the step and the exact error; the owner is emailed your final message. The next run will pick the same institution again, because it is still at the top of the queue.

## Building a new institution

Take the **first** request from `new-queue` (fields: `id`, `name`, `website`, `kind`, `note`). Keep its `id` as the REQUEST ID.

1. **Claim it:** `python3 pipeline/db.py new-start <REQUEST ID>`, then `python3 pipeline/db.py start refresh "New institution: <name>"` (no slug yet: it doesn't exist in the app). Keep the printed `run_id` as the RUN ID.
2. **Identify it (1–3 web calls, counted in the 40).** Use the name, website and kind to find the exact legal entity: for a bank, the holding company and its lead bank on FDIC BankFind (certificate number); for a credit union, its NCUA charter number. It must be a US bank, thrift or credit union that is still operating.
   - Not found, ambiguous, not a US deposit-taker, or already covered under another name (check `python3 pipeline/db.py institution <likely-slug>` and the names in `pipeline/covered-institutions.md`): run `python3 pipeline/db.py new-failed <REQUEST ID> "<plain reason a seller can act on, e.g. 'Couldn't find a US bank called X: add its website and request again'>"`, then `python3 pipeline/db.py finish <RUN ID> skipped "New institution: <reason>"`, and stop.
3. **Choose its slug:** the institution's name in lower case, words joined by hyphens, punctuation and "Inc." dropped (for example `cullen-frost-bankers`, `becu`). It must not already exist. Set `meta.slug` to it.
4. **Research and check it exactly as Steps 2–6 describe**, with the latest reported quarter as the period. There is no earlier dashboard; everything is sourced fresh. The registry lookup in Step 3 is the one you just did.
5. **Publish** (Step 7). `publish.py` creates the institution in the app.
6. **Wire it in:**
   ```bash
   python3 pipeline/db.py set-regulatory-id <slug> <fdic|ncua> <certificate or charter number>
   python3 pipeline/regulatory.py --only <slug>
   python3 pipeline/db.py set-event <slug> "<latest period>" --date <its results date> --status reported --kind earnings --source <release URL>
   python3 pipeline/db.py set-event <slug> "<next period>" --date <expected date> --status estimated --kind earnings --note "Estimated from last year's timing"
   python3 pipeline/db.py new-live <REQUEST ID> <slug>
   ```
   Credit unions without public results releases: use `--kind call_report_ncua` and the NCUA filing date for the reported row, and skip the estimated row if there is no pattern. `new-live` adds the dashboard to the requesters' books and alerts them.
7. **Close the run:** `python3 pipeline/db.py finish <RUN ID> published "New institution <slug>: completeness n/15, <calls> calls, <peers> peers"`.

**If the build fails after the claim** (a gate fails, publish errors): never publish a partial build. Run `python3 pipeline/db.py new-failed <REQUEST ID> "<step>: <short reason>"` and `python3 pipeline/db.py finish <RUN ID> failed "<step>: <exact error>"`. A seller can retry it from the app; after 3 attempts it stops being picked up.

