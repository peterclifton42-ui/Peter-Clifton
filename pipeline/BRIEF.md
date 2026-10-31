# Writing the seller summary for one institution

The Summary page is the first thing a seller sees on a bank: **the situation now** and **three things to do now**, each linking into the part of the full report that backs it up. It is written by the research jobs, never by hand in the app:

- after a dashboard is published (refresh job, trigger `refresh`);
- when important news lands for a followed bank (daily news job, trigger `news`);
- to catch up on institutions without one (refresh job when its queue is empty, trigger `backfill`).

No web calls: everything comes from

```bash
python3 pipeline/db.py brief-context <slug>
```

which prints the dashboard's sales theme, timing, Curinos angle, SWOT, metric cards, products (priority, fit, why, talk track), executives, the latest news (with importance), the official call report figures for the last two quarters, the team's whitespace, the calendar, the current summary (if any) and `report_sections`, the tabs and section ids an action may link to.

## What to write

Write `/tmp/brief-<slug>.json`:

```json
{
  "situation": "Two or three short paragraphs, separated by a blank line …",
  "actions": [
    {"title": "…", "why": "…", "tab": "Balance Sheet & Funding", "at": "bs-funding"},
    {"title": "…", "why": "…", "tab": "Organisation & People", "at": "op-leadership"},
    {"title": "…", "why": "…", "tab": "Product Fit & Playbook", "at": "pp-plan"}
  ]
}
```

**situation** (200–1,200 characters): how the institution is doing and what is on management's mind, as of the latest quarter and the latest news. Lead with the one thing that matters most to a Curinos seller (for example deposits shrinking while loans grow, margin pressure, a pending acquisition, a new CEO). Use specific figures with their quarter. Plain English, no jargon a seller would have to look up, no headings or bullets.

**actions** (exactly three): what a seller should do in the next few weeks, most useful first.
- `title`: an instruction that starts with a verb and names the product or person where there is one, for example "Take Pricing Data to the CFO before Q4 deposit pricing is set" or "Ask Jane Doe how the FineMark conversion changes wealth pricing". Under 110 characters.
- `why`: one or two sentences with the evidence (a figure, a quote, a date or a news item) and why now.
- `tab` and `at`: where in the full report the evidence or playbook sits, from `report_sections`. `at` is optional; `tab` may be null only if nothing in the report backs it.

Rules:
- Only facts from `brief-context`. Never invent names, figures or dates.
- Never recommend a product the team marked recently lost, not a fit or already a client (`whitespace`), or one the research rules out. Mention an active pursuit (validated or in play) where it helps.
- Curinos One Commit, Conserve and Calibrate are roadmap; never present them as available.
- Credit unions have members, not customers; avoid "margin extraction" and "cross-sell" for them.
- When rewriting after news, keep what still holds from `current_brief` and change what the news changes.

## Save it

```bash
python3 pipeline/db.py set-brief <slug> /tmp/brief-<slug>.json <refresh|news|backfill>
```

It checks the lengths, that there are exactly three actions and that every tab and section exists. If it refuses, fix what it says and save again.
