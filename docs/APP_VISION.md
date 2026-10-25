# Bank Intelligence Web App — Vision & Game Plan

Status: draft v1 (23 Oct 2026) · Owner: Peter Clifton

---

## 1. The vision in one paragraph

A private website that Curinos sellers log into with a normal username and password (or their Curinos work login). No Claude licence needed. A seller lands on a **home page** that shows what changed this week across the banks they follow, which banks report earnings soon, and the common themes across every bank. From there they can **search any bank** and open its dashboard, **compare peers** side by side, read **product pages** that show which banks are signalling a need for each Curinos product, and **ask a chat assistant** questions about one bank, one product or the whole market. Dashboards **refresh automatically** when a bank publishes earnings, news refreshes **weekly**, and sellers get **notifications** about the banks they follow. An **admin area** controls who has access.

---

## 2. What you already have (your head start)

| Asset | What it is | Why it matters for the app |
|---|---|---|
| ~60 "Sales Intelligence" dashboards | One self-contained HTML page per institution, 8 tabs (Financial Overview, Organisation & People, Balance Sheet & Funding, Strategy & Health, Analytics & Technology, Peer Comparison, Product Fit & Playbook, Recent News) | The content and design of the bank page already exist |
| The `D` data object inside each dashboard | ~40 structured sections: `meta`, `basic`, `metrics`, `peers`, `nimTrend`, `funding`, `swot`, `curinosAngle`, `products`, `salesPlaybook`, `news`, `sources`… | **This is the most important thing.** Because the data is already separated from the layout, we can load it into a database and power search, comparison, aggregation and chat from it |
| Run A / Run B pipeline | Scheduled tasks that research a bank, write an intel JSON, build the dashboard with `build_v2.py`, validate it, email it and publish it | The research engine already exists. It needs a new destination (the app's database) instead of email and an artifact |
| Tier 3 Universe | 45 banks and 9 credit unions in the $20B–$75B band, plus exclusions | This is the coverage list (the app's "bank directory") |
| Curinos Product Catalogue **V4** (`reference/`) | ~37 products and Advisory engagements in 5 pillars, hard gates, a machine-readable product registry (K3), a fixed metric dictionary with severity bands (K4.1), strategy tags and timing themes (K4.2–K4.3), an FDIC peer benchmark (K10) | Already supplies most of the product pages, the peer-comparison metrics and the theme taxonomy (see section 5C) |
| `build_v2.py`, `validate_updated_v2.py`, `score_v4.py`, `SHELL_TOP.html` / `SHELL_BOTTOM.html`, FDIC benchmark (`reference/`) | Turns an intel JSON into the `D` object and wraps it in `SHELL_TOP.html` / `SHELL_BOTTOM.html` | Confirms the app only needs to store intel JSON; the page template is the two shell files |

> **Key idea for a beginner:** today each dashboard is a *finished document* (a 500 KB file with the numbers baked in). An app needs *data plus a template*: the numbers live in a database, and one shared template draws any bank's page from them. That one change is what makes search, favourites, peer comparison, "what changed", cross-bank insights and the chatbot possible.

---

## 3. The app map (what pages exist)

```
                         ┌───────────────┐
                         │    Log in     │
                         └───────┬───────┘
                                 ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │ Top bar:  [ Search any bank or product… ]   Home  Banks  Compare     │
 │           Insights  Products  Calendar  Ask        🔔  (profile)     │
 └──────────────────────────────────────────────────────────────────────┘
   │
   ├─ HOME ("My Briefing")
   │    • What changed this week at banks I follow
   │    • Upcoming earnings (next 14 days) + just reported
   │    • Market pulse: top 3–5 cross-bank themes this quarter
   │    • Shortcuts to my favourites
   │
   ├─ BANKS
   │    • Directory: filter by size, type (bank / credit union), state, opportunity rating
   │    • BANK PAGE: the existing 8 tabs + header with ☆ Follow, "Last updated",
   │      "Next earnings", and a new "What changed" tab (vs last quarter / last week)
   │
   ├─ COMPARE (peer analysis)
   │    • Pick 2–6 banks (or "suggested peers") → metric table, charts, rankings
   │
   ├─ INSIGHTS (cross-bank)
   │    • Common strategies, threats, opportunities, and the talk tracks that work
   │    • Every theme links to the banks behind it ("12 of 54 banks cite deposit cost pressure")
   │
   ├─ PRODUCTS
   │    • One page per Curinos product: which banks show the need, evidence quotes,
   │      fit scores, objections, best-fit target list
   │
   ├─ CALENDAR
   │    • Earnings calendar for the whole coverage list; follow / get alerts
   │
   ├─ ASK (chat assistant)
   │    • Also available as a side panel on every Bank / Product page, scoped to it
   │
   ├─ SETTINGS  • my favourites, notification preferences (instant / weekly digest)
   │
   └─ ADMIN (admins only)
        • Invite / remove users, set roles, see usage
        • Coverage list: add a bank, trigger a refresh, see pipeline status and errors
        • Review queue: approve a refreshed dashboard before sellers see it (optional)
```

### Navigation principles (to keep it intuitive)
1. **One search box everywhere.** Type "Valley" or "deposit pricing" and get banks, products and insights.
2. **Every page answers "what's new?" first.** Show the change, then the detail.
3. **Every number and claim shows its source and "as of" date.** Your dashboards already carry sources and verified/inferred labels; keep them.
4. **The chat assistant knows where you are.** Opening Ask on Valley National's page means questions are about Valley unless you say otherwise.
5. **Follow (☆) is the one personalisation action.** It drives the home page, notifications and digest emails.

---

## 4. How the data flows

```
  Earnings calendar ──► "Bank X reported" ──► Research job (Run A logic)
  (weekly news job) ─────────────────────────►        │
                                                      ▼
                                       Intel JSON (same shape as D object)
                                                      │  validate (validate_updated_v2 rules)
                                                      ▼
                                   DATABASE: banks · snapshots (one per refresh) ·
                                   metrics · news · themes · product signals
                                       │            │             │
                              Bank page / Compare   Insights &    Notifications
                              "What changed" diff   Product pages  (email / in-app)
                                       └──────► Chat assistant reads all of it
```

Three kinds of refresh, and it is worth being explicit about them:

| Refresh | Trigger | What changes |
|---|---|---|
| **Full rebuild** | Bank publishes quarterly earnings (or call report / NCUA 5300 data for private banks and credit unions) | Financials, metrics, peers, strategy, SWOT, product fit, playbook |
| **Weekly news** | Every week (e.g. Sunday night) | Recent News tab, "what changed" notes, possibly opportunity rating |
| **Aggregation** | After any refresh | Cross-bank themes, product pages, peer rankings |

We keep **every snapshot**, not just the latest. That gives you "what changed since last quarter", trend charts and an audit trail.

---

## 5. What's missing: things you need to define

These are the gaps that will decide whether the app makes sense to a seller. Each one has a recommended default, so we can start without settling all of them on day one.

### A. Permission, security & access (decide first; can block everything)
1. **Curinos approval.** A website holding sales intelligence about Curinos's prospects, used by Curinos staff, will need sign-off from Curinos IT/security (and possibly legal). *Action: find out who owns this and what they require (hosting location, SSO, data classification).*
2. **Can sellers reach it from the Curinos network?** Your pipeline emails dashboards because the Curinos network blocks claude.ai. The new site will have its own address, but test early that it isn't blocked too.
3. **Login method.** Option 1: email + password with admin invites (simplest). Option 2: "Sign in with Microsoft" using Curinos's corporate login (SSO; best for IT approval, needs Curinos IT to register the app). *Recommendation: build Option 1 first and design for Option 2.*
4. **Roles.** Recommended: **Admin** (you), **Seller** (read, follow, chat), maybe **Manager** (sees team usage and the review queue).
5. **Sensitive content.** The dashboards contain named executives and contacts, and Curinos product and pricing logic. Decide who may see what, and that the site is never public.

### B. Data sources and what "earnings" means
6. **Earnings dates.** Public banks: investor-relations pages, SEC 8-K filings (free) or a paid calendar API. *Credit unions and private banks (Arvest, First National of Nebraska, Mechanics, EverBank) do not hold earnings calls.* Their "earnings" are quarterly NCUA 5300 or FDIC call-report releases, on a regulatory schedule. Decide the trigger for each type.
7. **News sources.** Web search through Claude (what you use now) vs a news API. Decide which sources are acceptable to cite.
8. **Content licensing.** If you use paid data (e.g. S&P, BankRegData, BlastPoint), check whether it may be shown in an internal tool.

### C. Definitions that make comparison and aggregation honest
*Update after reviewing Catalogue V4: most of this already exists.*

9. **Metric dictionary — largely solved.** Catalogue K2/K4.1 already fixes ~20 metrics with exact definitions (deposit cost, NIM, NIB share, LDR, time-deposit share, wholesale share, AOCI/TCE, efficiency, deposits per branch…), each with peer arrays from the same quarter and severity bands. K10 adds an FDIC benchmark (p10–p90 across 133 US banks over $20B). **Still to define:** the credit-union equivalent of K10 (NCUA 5300 data), and which 6–8 of these metrics show by default on the Compare page.
10. **Theme taxonomy — largely solved.** Every bank's `scoringInputs` already carries `statedPriorities` (≈45 tags in 11 families, K4.2) and dated `catalysts` on 12 timing themes (K4.3). Counting those across banks gives "18 of 54 banks are pricing a CD maturity wall in the next 6 months" mechanically. **Still to define:** a short list of *threat* themes (CRE exposure, M&A target risk, regulatory action…), which the catalogue doesn't cover because it's product-focused.
11. **Product signals — solved.** Per-product gates, need metrics and timing themes are in the K3 registry, and every bank's product fit comes out of `score_v4.py`. Product pages = "all banks where this product is P1/P2, ranked by Fit, with the evidence".
12. **Opportunity rating.** HIGH / MEDIUM / LOW exists today but isn't defined in the catalogue. Write down what each means (e.g. derived from the number and strength of P1 products) so sellers trust it.
12a. **Product-page guardrails from the catalogue:** roadmap modules (Commit, Conserve, Calibrate) are always labelled "roadmap"; unlisted products (Profitability Optimizer, Lenders Optimizer, Commercial Digital Analyzer) say "availability to be confirmed"; only the verified proof points in Section CO may be quoted; credit unions get "member value" language. The app must enforce these, not just the research job.
12b. **Catalogue upkeep.** V4 is dated 26 Sep 2026 and curinos.com changes (V3→V4 found 7 products gone and 5 new). Decide who re-checks it and how often (suggest monthly), and keep `score_v4.py` in step with it.

### D. Trust and quality
13. **Human review.** Should a refreshed dashboard go live automatically, or wait for an admin to approve it? *Recommendation: auto-publish news; send full quarterly rebuilds to a quick review queue at first.*
14. **Citations in chat.** The assistant should answer only from the app's data plus cited sources, and say "I don't know" otherwise.
15. **Feedback.** A 👍/👎 and "this is wrong" button on insights and chat answers, so errors get fixed.

### E. Things sellers will ask for (worth planning, not building yet)
16. **"What changed" summaries.** Probably the most valuable single feature for busy sellers.
17. **Meeting prep export.** One-click PDF or email briefing for a bank before a call.
18. **Territories / account ownership.** Auto-follow the banks a seller owns. Possibly link to the CRM (Salesforce?) later.
19. **Coverage requests.** "Add this bank": a request that lands in the admin queue.
20. **Usage analytics.** Which banks and pages are used, so you can prove value to leadership.

### F. Running costs & ownership
21. **Who pays.** Users don't need Claude licences, but the app calls the **Claude API** (research, aggregation, chat), which is billed per use to an Anthropic API account owned by you or Curinos. Hosting starts on free/low tiers. *Action: decide whose account and budget this sits on.*
22. **Who maintains it.** When a job fails at 3am, who gets the alert? (Today: your Gmail. Keep that, and add an admin status page.)

---

## 6. Recommended technology (beginner-friendly, low maintenance)

| Need | Choice | Why |
|---|---|---|
| Website | **Next.js** (React) | Most common modern web framework; huge amount of help available |
| Hosting | **Vercel** | Connects to this GitHub repo; every push deploys automatically; free tier to start |
| Database + login + file storage + scheduled jobs | **Supabase** | Already connected to your account. Gives Postgres, user login/invites, row-level security (who can see what) and scheduled functions in one place |
| AI (research, aggregation, chat) | **Claude API** | Same intelligence that builds your dashboards today, called by the app |
| Email notifications | **Resend** (or Postmark) | Simple transactional email from the app |
| Charts | **Chart.js** | Already used by your dashboards |
| Code & history | **GitHub** (this repo) | Already set up |

*If Curinos IT requires Microsoft Azure hosting or Microsoft SSO, the plan still works: Supabase supports Microsoft (Azure AD / Entra) login, and the app can move hosts later.*

---

## 7. The game plan (build in phases; each one is usable on its own)

| Phase | Goal | What a seller can do at the end | Depends on |
|---|---|---|---|
| **0. Groundwork** | Decisions & accounts | — | Answers to section 5A, 5F |
| **1. The Library (MVP)** | Login, admin invites, bank directory + search, bank pages from the database | Log in, find any of the ~60 banks, read its dashboard | Phase 0 |
| **2. Personal home** | Follow ☆, "My Briefing" home page, earnings calendar | See their banks and upcoming earnings on one page | 1 |
| **3. Living data** | Pipeline writes to the database; earnings-triggered rebuilds; weekly news; snapshot history; "What changed" tab | Trust that pages are current; see what changed | 1, decision 6 |
| **4. Notifications** | In-app 🔔 + email (instant or weekly digest) for followed banks | Get told when a followed bank reports | 2, 3 |
| **5. Compare** | Metric dictionary, peer comparison page | Compare 2–6 banks on consistent metrics | 1, decision 9 |
| **6. Insights & Products** | Theme tagging, cross-bank insights page, product pages | See market-wide angles and product target lists | 3, decisions 10–11 |
| **7. Ask** | Chat assistant (global, per bank, per product) with citations | Ask "Which banks are most likely to need deposit pricing help this quarter and why?" | 1, better with 5–6 |
| **8. Polish** | SSO, meeting-prep export, usage analytics, CRM link | — | — |

### Phase 1 in detail (the first thing we build)
1. Create the Next.js app in this repository and deploy it to Vercel (you'll get a private web address).
2. Create the Supabase database tables: `institutions`, `snapshots` (stores each bank's `D` object as JSON plus its date), `profiles` (users and roles), `favourites`.
3. **Migrate the existing dashboards:** write a script that reads each published dashboard, extracts its `D` object and loads it into `snapshots`. (The intel JSONs are deleted after each run, so the published dashboards are now the master copy.)
4. Turn the dashboard HTML into a reusable bank-page template that reads from the database. The layout and tabs stay as they are.
5. Add login, an admin "invite user" screen, the bank directory and search.
6. You test it, then invite 2–3 friendly sellers as pilot users.

---

## 8. Your to-do list right now

1. **Read this document** and mark anything that's wrong or missing.
2. **Answer the starter questions** below. Short answers are fine.
3. **Talk to Curinos IT/security** (section 5A): find out whether an externally hosted internal tool is allowed and what they need.
4. **Create two free accounts** (I'll walk you through each screen when we get there): **Vercel** (sign up with your GitHub account), and confirm which **Supabase** organisation to use (you already have Supabase connected).
5. **Anthropic API account**: decide whether it's yours or Curinos's. Not needed until Phase 3.

### Decisions (24 Oct 2026)
| Question | Decision |
|---|---|
| Pilot size | About 20 sellers |
| Pilot type | Personal pilot first (your own accounts and budget) |
| Login | Email and password, accounts created by an admin; no self sign-up |
| Credit unions | Alongside banks everywhere, with a filter |
| Default peer metrics | NIM, deposit cost, loan-to-deposit (loan-to-share for CUs), deposit growth, efficiency ratio. **Later:** let each seller pick their own metrics |
| Notifications | Both in-app and email, with a weekly email digest |
| Run A / Run B | Stay paused until the pipeline writes to the app (Phase 3) |

### Phase 1 status
Built: login, admin screen (create logins with a temporary password, change roles, reset passwords, remove users), bank directory with search and filters, and bank pages showing the existing dashboards. All 58 published dashboards are loaded into Supabase (`bank-intelligence` project), and every one renders with the current page template.
Note for later: with ~20 sellers, Supabase's built-in email can't send password resets (it only emails the project owner). Admins reset passwords from the admin screen until an email service (Resend) is added in Phase 4.

### Phase 2 status (24 Oct 2026)
Built:
- **Follow ☆** on every bank (directory rows, bank pages, home cards), with a "Following only" filter.
- **Home page ("Your briefing")**: a card per followed bank showing type, size, opportunity, the dashboard's sales theme, the top three recommended products and its results status. There's also a list of who reports in the next two weeks, and of every bank whose results came out after its dashboard was researched. Anyone following nothing sees six high-opportunity suggestions.
- **Earnings calendar** (`/calendar`): 30 days back to five months ahead, grouped by week, All or Following. Shows each event's status (Reported / Confirmed / Estimated), an "out of date" flag and a source link.
- **Bank page** now shows the follow button and either the next results date or a "results out, not yet in this dashboard" warning.

Data: `earnings_events` holds Q3 2026 and Q4 2026 dates for all 58 institutions. The Q3 dates were checked against each company's own announcement or SEC filing on 24 Oct 2026. Four are estimates: Bank of Hawaii, TowneBank and Banc of California hadn't confirmed a date, and Q4 dates are projected 13 weeks on from Q3. Credit unions use NCUA's quarterly data release and the two private banks use FFIEC call reports, both estimated. Phase 3 should take over keeping these dates current.

Finding: on 24 Oct, 34 of the 58 dashboards are already behind the latest published results (Q3 2026 out, dashboard still Q2). That is the case for Phase 3's automatic refresh.

### Phase 4 status (24 Oct 2026)
Built:
- **Alerts in the app** (`/alerts`, with an unread count in the menu): written by the database the moment a followed bank's dashboard is republished, its results are marked reported, or news is added. Opening one marks it read and goes to the "What changed" page, the bank, or the article.
- **Instant email alerts**: every 30 minutes, new dashboard and results alerts are gathered into one email per person.
- **Weekly digest** (Monday 11:23 UTC, after the weekly news job): dashboards updated, results out, who reports in the next two weeks, news, and followed banks still waiting for a refresh. Anyone following nothing gets a market-wide version.
- **Email settings** on each person's account page (instant alerts and digest, each on or off), and an **Email** panel in Admin with test and digest-preview buttons and a log of every send.

Needs: a Resend API key in Vercel (`RESEND_API_KEY`). Until a sending domain is verified in Resend, email only reaches the Resend account owner, which is enough for a personal pilot. Sending to sellers at their work addresses needs a verified domain (`EMAIL_FROM`). The same domain can later send Supabase password-reset emails.

### Phase 5 status (25 Oct 2026)
Built:
- **Compare** (`/compare`, in the menu, and "Compare with peers" on every bank page): up to six banks and credit unions side by side. It shows a latest-quarter table with the group median and the best value marked, and a trend chart per metric over eight quarters, with hover.
- **Metrics:** the default five (NIM, cost of deposits, loan-to-deposit or loan-to-share, one-year deposit growth, efficiency). Return on assets, total assets and total deposits can be switched on. This is a first step towards each seller choosing their own metrics, though the choice isn't saved yet.
- **Suggested peers:** the four institutions of the same type closest in size, as a starting point.
- **Metric dictionary** on the page: what each figure means and exactly how it's calculated for banks and for credit unions, plus which FDIC certificates or NCUA charter each institution's figures come from.

Data: official call reports rather than the dashboards' own cards, whose labels and definitions vary. Banks come from the FDIC API, summing every bank charter the holding company owns: Wintrust's 16 charters count as one $74.8B group, not its $9.6B lead bank. Credit unions come from NCUA quarterly files. Figures are to Q2 2026; Q3 arrives around 30 October (FDIC) and late November (NCUA), and the weekly job reloads them. Checking the IDs found two wrong FDIC numbers in the dashboards themselves: First Merchants (2871 belongs to a closed Idaho bank; the right one is 4365) and BOK Financial (26354 closed in 1992; the right one is 4214).

Known limits: deposit growth includes acquisitions (flagged † when 40% or more). Credit union margin is measured against assets, as NCUA does, so it reads slightly lower than a bank's. Holding companies are measured on their bank charters only.

