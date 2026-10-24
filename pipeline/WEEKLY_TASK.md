# Weekly task — keep the earnings calendar right and collect fresh news

Runs unattended every Monday morning (scheduled task "Bank Intelligence — weekly calendar and news"). Fresh session: decide everything yourself and never ask questions. Budget: **30 web calls** in total.

Repository: `/home/user/Peter-Clifton` (`git pull -q origin main`; clone peterclifton42-ui/Peter-Clifton if it is missing). Database: Supabase project `bank-intelligence` (id `zwevbnccqixavejvlwhb`), through the Supabase connector's `execute_sql`.

Start a run: `insert into public.refresh_runs (job, note) values ('weekly', 'Calendar and news') returning id;`. Keep that id as the RUN ID.

## Part 1 — Earnings calendar (about 15 calls)

1. **Dates that have passed but aren't marked reported:**
   ```sql
   select e.slug, i.name, i.ticker, e.period, e.event_date, e.kind, e.status
   from public.earnings_events e join public.institutions i using (slug)
   where e.status <> 'reported' and e.event_date <= current_date order by e.event_date;
   ```
   - **Earnings releases:** confirm each one from the company's release or SEC 8-K. Then set `status = 'reported'`, the actual `event_date` and `source_url`. If the company has moved the date, set the new date and `status = 'scheduled'` (or leave `'estimated'` if it's still unannounced).
   - **NCUA and FFIEC call-report rows:** mark `reported` once the quarter's data is public. For NCUA, check that the quarterly data page lists the quarter; for FFIEC, that the call report is on cdr.ffiec.gov. Otherwise move the date out a week.

2. **Dates in the next 21 days that aren't confirmed:**
   ```sql
   select e.slug, i.name, i.ticker, e.period, e.event_date from public.earnings_events e join public.institutions i using (slug)
   where e.status = 'estimated' and e.kind = 'earnings'
     and e.event_date between current_date and current_date + 21 order by e.event_date;
   ```
   Search for each company's announcement. If one exists, set the confirmed date, `status = 'scheduled'`, `source_url` and `note = null`.

3. **Make sure every institution has a next period:** for each institution whose latest period is now `reported`, insert the following quarter if it's missing, as `estimated`:
   - **Earnings:** 13 weeks after the reported date.
   - **NCUA:** the first Thursday of the third month after quarter end.
   - **FFIEC:** about 36 days after quarter end.

   Use `insert … on conflict (slug, period) do nothing`, with `note` set to "Estimated from the previous quarter's date".

Every update also sets `updated_at = now()`. Never mark something reported without a source.

## Part 2 — News (about 15 calls)

Who to cover, followed institutions first, at most 15:

```sql
select i.slug, i.name, count(f.user_id) as followers
from public.institutions i left join public.favourites f using (slug)
group by i.slug, i.name order by followers desc, i.assets_b desc nulls last limit 15;
```

For each one, make one WebSearch: `"<name>" news <current month> <year>`. Keep at most 3 items from the last 14 days that a seller would care about: results, deals, leadership changes, launches, branch moves, regulatory actions, ratings. Skip stock-price noise and listicles. Insert each item:

```sql
insert into public.news_items (slug, published_on, headline, summary, source_name, url)
values ('<slug>', '<YYYY-MM-DD>', '<headline>', '<one plain sentence on why it matters to a seller>', '<publisher>', '<url>')
on conflict (slug, headline) do nothing;
```

Rules for news items:
- Use the headline as published. Never invent a figure.
- The summary is one sentence.
- No item without a working source URL.
- Double any single quote inside a string ('').

## Finish

```sql
update public.refresh_runs set status = 'done', finished_at = now(),
  note = 'Calendar: <n> confirmed, <n> marked reported, <n> next-quarter rows added. News: <n> items for <n> institutions. <calls> calls.'
where id = <RUN ID>;
```

If anything fails, set `status = 'failed'` with the step and error in `note`, and email peter.clifton42@gmail.com, subject "Bank Intelligence weekly task failed (<date>)".
