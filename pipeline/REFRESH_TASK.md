# Refresh task — research one institution and publish its new dashboard

Runs unattended twice a day (scheduled task "Bank Intelligence — refresh one dashboard"). Fresh session: decide everything yourself and never ask questions. This replaces the old Run A / Run B pair. The research half is Run A's routine, unchanged. The publish half is now a single command, and there is no email to Curinos: the app is the delivery.

Repository: `/home/user/Peter-Clifton` (if it is missing, `git clone https://github.com/peterclifton42-ui/Peter-Clifton` there). Database: the Supabase project `bank-intelligence`, reached only through `python3 pipeline/db.py …` (and `pipeline/publish.py`). Both use the `SUPABASE_SECRET_KEY` environment variable. Run `python3 pipeline/db.py check` first: if it says the key is not set, stop and report exactly that.

**Success is one institution published, or a clean skip.** A failed run must leave the live dashboard untouched. Publishing happens only in step 7, after every check has passed. Your final message is emailed to the owner, so end with a short, plain summary.

---

## Step 0 — Set up and guard

1. `cd /home/user/Peter-Clifton && git pull -q origin main && python3 pipeline/db.py check`.
2. Run `date -u`. You fire at 00:07 and 12:07 UTC. If it is more than 6 hours past your slot, you are a stalled session that resumed late: do nothing and stop.
3. Make a working folder, `mkdir -p /tmp/refresh && cd /tmp/refresh`, and copy into it:
   - `reference/score_v4.py`
   - `reference/claude/bank-benchmark-2026Q2.json`. Use a newer `bank-benchmark-*.json` instead if `reference/claude/` has one. Keep the file name; the scorer finds it by that name.
   - `reference/claude/check_completeness.py`
   - `reference/claude/check_contamination.py`

## Step 1 — Pick the institution

```bash
python3 pipeline/db.py queue
```

The queue lists institutions whose latest published results are newer than their dashboard, requested by a seller first (the "Request refresh" button), then most-followed, then oldest results first. It leaves out anything another run claimed in the last 6 hours. Take the **first** entry.

- **Empty list:** run `python3 pipeline/db.py start refresh "Queue empty"`, then `python3 pipeline/db.py finish <run id> skipped "Queue empty: every dashboard is current"`, and stop. That is a correct outcome.
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
| Subject research | 20–24 | The source checklist below, in order. Move to peers by call 28 at the latest |
| Peers | at least 8, reserved | 4 peers × (same-quarter release + one follow-up for a missing metric). Three fully sourced peers beat four half-empty ones |
| Completeness pass | up to 5 | Only on what `check_completeness.py` reports as FAIL |

**Source checklist (subject):**
1. The **new** quarterly earnings release (SEC 8-K Ex.99.1), the one in the queue row. It fills the metric cards and 5 quarters of balance sheet, NII, fees, deposit mix and loan mix.
2. The prior-quarter or year-ago release or supplement, for quarters 6–8 of the charts.
3. The earnings call transcript: guidance, named analyst Q&A, quotes, deposit beta.
4. The latest 10-Q: the NII rate-sensitivity table, liquidity (uninsured deposits, AOCI, borrowing capacity), the CD maturity schedule and segments.
5. The latest 10-K: FTEs, branch count and states, segments, competition.
6. The proxy or leadership page: at least 4 executives, with start years and backgrounds.
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
