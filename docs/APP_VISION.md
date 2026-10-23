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
| Curinos Product Catalogue V3 | Product definitions, size gates, credit-union rules | This is the source for the product pages and product-fit scoring |

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
9. **Metric dictionary.** For peer comparison every bank needs the *same* metrics, with the *same* definition, for the *same* quarter: NIM, cost of funds, loan-to-deposit (loan-to-share for credit unions), deposit mix, efficiency ratio, ROAA, CET1, and so on. Decide the list (~15–25 metrics) and how banks vs credit unions are shown (your catalogue already scores credit unions against NCUA system averages).
10. **Theme taxonomy.** To say "18 banks cite deposit cost pressure", each bank's strategy, threats and opportunities must be tagged against a **fixed list of themes** (e.g. deposit pricing pressure, CRE exposure, M&A integration, digital transformation, fee income, data/analytics maturity, talent). Without a fixed list, aggregation is guesswork. *Draft ~20 themes; we refine them as data arrives.*
11. **Product signals.** For each Curinos product: what evidence in a bank's data counts as a signal (a metric threshold, a quote, a strategic priority)? Your product-fit scoring already does this per bank. Product pages roll it up.
12. **Opportunity rating.** HIGH / MEDIUM / LOW exists today; write down what each means so sellers trust it.

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

### Starter questions
1. Roughly how many sellers will use it at first: 5, 20, 100?
2. Personal pilot first (your accounts and budget) or Curinos-sanctioned from day one?
3. Does Curinos use Microsoft 365 / Outlook sign-in for staff? (That decides SSO.)
4. Should credit unions sit alongside banks everywhere, or in their own section?
5. Which 5 metrics matter most to a seller when comparing peers?
6. Do you have the Curinos product list handy (names + one-line descriptions) for the product pages?
7. Notifications: email, in-app only, or both? Instant, or a weekly digest?
8. Should the Run A / Run B pipeline stay paused until it can write to the app?
