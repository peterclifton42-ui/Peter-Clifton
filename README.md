# Bank Intelligence

A private website where Curinos sellers sign in, search the covered banks and credit unions, and open each one's sales-intelligence dashboard.

- **Plan and roadmap:** [`docs/APP_VISION.md`](docs/APP_VISION.md)
- **Existing dashboard pipeline (catalogue, scorer, page templates):** [`reference/`](reference/)

## How it fits together

| Piece | What it does |
|---|---|
| **Vercel** (project `peter-clifton`) | Hosts the website. Every push to GitHub deploys automatically. |
| **Supabase** (project `bank-intelligence`) | Holds the logins and the data: `institutions` (one row per bank), `snapshots` (each research refresh's full dashboard data), `profiles` (who can see what), `favourites`. |
| `reference/SHELL_TOP.html` + `SHELL_BOTTOM.html` | The dashboard page design. The app rebuilds each bank's dashboard from its stored data plus these two files, exactly as `build_v2.py` does. |

Roles: **pending** (signed up but no access), **seller** (can see everything), **admin** (can also manage logins at `/admin`).

## One-time setup

1. **Admin key in Vercel.** In Supabase: *Project Settings → API Keys → Secret keys*, create or copy a secret key. In Vercel: *peter-clifton → Settings → Environment Variables*, add `SUPABASE_SECRET_KEY` with that value for Production and Preview, then redeploy. Without it, the admin screen can't create logins.
2. **Turn off public sign-up.** In Supabase: *Authentication → Sign In / Providers → Email*, switch off *Allow new users to sign up*. (Anyone who did sign up would only ever be "pending" with no access, but this closes the door entirely.)
3. **Ask assistant (Claude API).** At console.anthropic.com create an API key and set a monthly spend limit (Settings → Limits). In Vercel add `ANTHROPIC_API_KEY`, then redeploy. Optional: `ASK_DAILY_LIMIT` (questions per person per 24 hours, default 40).
4. **Email (Resend).** In Resend (resend.com): *API Keys → Create API key* with "Sending access". In Vercel add `RESEND_API_KEY` with that value, then redeploy. Until a domain is verified in Resend, email can only go to the Resend account's own address. After verifying a domain, also add `EMAIL_FROM`, for example `Bank Intelligence <alerts@yourdomain.com>`. Admin → Email has buttons to send yourself a test email and this week's digest.

## Compare

`/compare` puts up to six institutions side by side on official call report figures, held in `regulatory_metrics`. `pipeline/regulatory.py` loads them (the weekly job runs it): FDIC BankFind for banks, adding up every active charter the holding company owns, and NCUA's quarterly 5300 files for credit unions. Which filing belongs to which institution is in `pipeline/regulatory-ids.csv`; add a row there when a new institution is added. The metric definitions are in `lib/metrics.ts` and shown on the page.

## Insights and Products

- `/insights` reads every current dashboard together (the `insight_inputs` view): 15 market themes counted by where they come up (SWOT threats and opportunities, strategy pillars, "now" sales timing), product demand, the most common lead angle, and the objections sellers meet with the rebuttals the playbooks give. Themes and objection types are keyword rules in `lib/insights.ts`; every count opens to the sentences behind it.
- `/products` and `/products/<product>` list every catalogue product with its target list (priority 1–2, ranked by fit, with each dashboard's reasoning and opening line), priority 3, the institutions ruled out and why, objections and answers, and the seller-facing parts of the catalogue entry.
- The catalogue's guardrails are applied in the app: roadmap and unlisted products are labelled and capped at priority 3, and UK-only products are not recommended to US institutions, even on dashboards written before catalogue V4.
- The product list comes from `lib/catalogue.json`. After editing the catalogue, run `python3 pipeline/catalogue.py` and commit the JSON.

## Ask

`/ask`, plus "Ask about this bank/product" on every bank and product page, is a chat assistant (Claude Opus 5.5 through the Claude API). It answers only from the app's own data, using read-only tools in `lib/ask/tools.ts` that run as the signed-in seller, so row-level security applies:
- find institutions;
- read any dashboard section (strategy, maturity, technology, contacts, playbook and the rest), or one section across all dashboards;
- news, the earnings calendar and call report figures;
- market insights and the product catalogue.

The instructions in `lib/ask/agent.ts` require linked sources and enforce the catalogue's product rules. Every question is logged in `ask_log` (tokens, estimated cost, 👍/👎 with comments), and Admin → Ask assistant shows the month's usage and the answers marked 👎.

## Alerts and email

- The database records an alert for each follower when a dashboard is republished, results are marked reported, or news is added (triggers on `institutions`, `earnings_events` and `news_items`). They show under **Alerts** in the app.
- Supabase's scheduler (pg_cron) calls `/api/email/alerts` every 30 minutes and `/api/email/digest` on Mondays at 11:23 UTC, with a secret only the database holds. Dashboard and results alerts are emailed straight away (one email per person per run); news waits for the weekly digest.
- Each person turns instant alerts and the digest on or off on their account page. Every send is listed under Admin → Email.

**After adding or changing a key in Vercel, redeploy.** Vercel only gives keys to versions built after they were added. Use Deployments → the top Production deployment → ⋯ → Redeploy, or merge any change. Until then the app keeps saying the feature isn't switched on.

## Adding a seller

Sign in as an admin, open **Admin**, enter their name and email and click **Create login**. Send them the temporary password it shows; they can change it under their name (top right).

## Working on the code

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```
