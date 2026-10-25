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
3. **Email (Resend).** In Resend (resend.com): *API Keys → Create API key* with "Sending access". In Vercel add `RESEND_API_KEY` with that value, then redeploy. Until a domain is verified in Resend, email can only go to the Resend account's own address. After verifying a domain, also add `EMAIL_FROM`, for example `Bank Intelligence <alerts@yourdomain.com>`. Admin → Email has buttons to send yourself a test email and this week's digest.

## Alerts and email

- The database records an alert for each follower when a dashboard is republished, results are marked reported, or news is added (triggers on `institutions`, `earnings_events` and `news_items`). They show under **Alerts** in the app.
- Supabase's scheduler (pg_cron) calls `/api/email/alerts` every 30 minutes and `/api/email/digest` on Mondays at 11:23 UTC, with a secret only the database holds. Dashboard and results alerts are emailed straight away (one email per person per run); news waits for the weekly digest.
- Each person turns instant alerts and the digest on or off on their account page. Every send is listed under Admin → Email.

## Adding a seller

Sign in as an admin, open **Admin**, enter their name and email and click **Create login**. Send them the temporary password it shows; they can change it under their name (top right).

## Working on the code

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```
