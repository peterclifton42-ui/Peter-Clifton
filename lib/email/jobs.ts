import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, formatDay, kindLabel, needsRefresh, todayISO, type EarningsEvent } from "../earnings";
import { pause, sendEmail, type Email } from "./send";
import { renderEmail, type Item, type Section } from "./templates";

type Person = { id: string; email: string; full_name: string | null };
type Prefs = { instant: boolean; digest: boolean };

async function people(db: SupabaseClient, ids?: string[]) {
  let q = db.from("profiles").select("id, email, full_name").in("role", ["seller", "admin"]);
  if (ids) q = q.in("id", ids);
  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    q, db.from("email_preferences").select("user_id, instant, digest"),
  ]);
  const prefsBy = new Map((prefs ?? []).map((p) => [p.user_id as string, p as Prefs]));
  return (profiles ?? []).map((p) => ({ person: p as Person, prefs: prefsBy.get(p.id) ?? { instant: true, digest: true } }));
}

async function log(db: SupabaseClient, job: string, email: Email, error: string | null) {
  await db.from("email_log").insert({
    job, recipient: email.to, subject: email.subject, status: error ? "failed" : "sent", error,
  });
}

const firstName = (p: Person) => p.full_name?.split(" ")[0] ?? null;

// ---- Instant alerts: one email per person covering everything new since the last run.

const INSTANT_KINDS = ["dashboard", "results"];

export async function runAlerts(db: SupabaseClient) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // News waits for the weekly digest, and anything over a day old is too stale to email.
  await db.from("notifications").update({ email_status: "digest only" }).is("email_status", null).eq("kind", "news");
  await db.from("notifications").update({ email_status: "skipped: older than a day" })
    .is("email_status", null).lt("created_at", since);

  // Claim the pending rows so an overlapping run can't email them twice.
  const { data: claimed, error } = await db.from("notifications").update({ email_status: "sending" })
    .is("email_status", null).in("kind", INSTANT_KINDS)
    .select("id, user_id, kind, title, body, link, created_at");
  if (error) throw new Error(error.message);
  if (!claimed?.length) return { people: 0, sent: 0 };

  const byUser = new Map<string, typeof claimed>();
  for (const n of claimed) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);

  let sent = 0;
  for (const { person, prefs } of await people(db, [...byUser.keys()])) {
    const items = byUser.get(person.id)!;
    const ids = items.map((n) => n.id);
    if (!prefs.instant) {
      await db.from("notifications").update({ email_status: "off" }).in("id", ids);
      continue;
    }
    const dashboards = items.filter((n) => n.kind === "dashboard");
    const results = items.filter((n) => n.kind === "results");
    const toItem = (n: (typeof items)[number]): Item => ({ title: n.title, body: n.body, link: n.link });
    const subject = items.length === 1 ? items[0].title : `${items.length} updates on banks you follow`;
    const email: Email = {
      to: person.email, subject,
      ...renderEmail({
        preheader: items.map((n) => n.title).join(" · "),
        heading: subject,
        intro: `${firstName(person) ? `Hi ${firstName(person)}, here` : "Here"}'s what just changed for the banks you follow.`,
        sections: [
          { heading: "Dashboards updated", items: dashboards.map(toItem) },
          { heading: "Results out", items: results.map(toItem) },
        ],
      }),
    };
    const result = await sendEmail(email);
    await db.from("notifications").update({ email_status: result.ok ? "sent" : `failed: ${result.error}`.slice(0, 300) }).in("id", ids);
    await log(db, "alerts", email, result.ok ? null : result.error);
    if (result.ok) sent++;
    await pause();
  }
  // Rows claimed for people who have since lost access.
  await db.from("notifications").update({ email_status: "no access" }).eq("email_status", "sending");
  return { people: byUser.size, sent };
}

// ---- Weekly digest

type Inst = { slug: string; name: string; latest_quarter: string | null; researched_at: string | null };

async function digestData(db: SupabaseClient) {
  const today = todayISO();
  const weekAgo = addDays(today, -7);
  const [inst, summaries, snaps, events, news, follows] = await Promise.all([
    db.from("institutions").select("slug, name, latest_quarter"),
    db.from("institution_summaries").select("slug, researched_at"),
    db.from("snapshots").select("slug, quarter, loaded_at").gte("loaded_at", `${weekAgo}T00:00:00Z`),
    db.from("earnings_events").select("slug, period, event_date, kind, status, source_url, note")
      .gte("event_date", addDays(today, -60)).lte("event_date", addDays(today, 14)),
    db.from("news_items").select("slug, published_on, headline, summary, source_name, url")
      .gte("published_on", weekAgo).order("published_on", { ascending: false }),
    db.from("favourites").select("user_id, slug"),
  ]);
  const failed = [inst, summaries, snaps, events, news, follows].find((r) => r.error);
  if (failed) throw new Error(failed.error!.message);
  const researched = new Map((summaries.data ?? []).map((r) => [r.slug as string, r.researched_at as string | null]));
  const followsBy = new Map<string, Set<string>>();
  for (const f of follows.data ?? []) followsBy.set(f.user_id, (followsBy.get(f.user_id) ?? new Set()).add(f.slug));
  return {
    today, weekAgo,
    institutions: new Map((inst.data ?? []).map((i) => [i.slug as string, { ...i, researched_at: researched.get(i.slug) ?? null } as Inst])),
    snapshots: (snaps.data ?? []) as { slug: string; quarter: string | null; loaded_at: string }[],
    events: (events.data ?? []) as EarningsEvent[],
    news: (news.data ?? []) as { slug: string; published_on: string; headline: string; summary: string | null; source_name: string | null; url: string }[],
    followsBy,
  };
}

type DigestData = Awaited<ReturnType<typeof digestData>>;

function buildDigest(person: Person, d: DigestData): Email | null {
  const followed = d.followsBy.get(person.id);
  const mine = (slug: string) => !followed || followed.has(slug);
  const name = (slug: string) => d.institutions.get(slug)?.name ?? slug;
  const cap = followed ? 50 : 8;

  const updated: Item[] = d.snapshots.filter((s) => mine(s.slug) && s.loaded_at.slice(0, 10) >= d.weekAgo)
    .map((s) => ({ title: `${name(s.slug)}${s.quarter ? ` — now ${s.quarter}` : ""}`, link: `/banks/${s.slug}/changes`, body: "See what changed since the last version." }))
    .slice(0, cap);
  const reported: Item[] = d.events.filter((e) => mine(e.slug) && e.status === "reported" && e.event_date >= d.weekAgo && e.event_date <= d.today)
    .map((e) => ({ title: `${name(e.slug)} — ${e.period}`, meta: `${kindLabel(e.kind)} · ${formatDay(e.event_date)}`, link: `/banks/${e.slug}` }))
    .slice(0, cap);
  const coming: Item[] = d.events.filter((e) => mine(e.slug) && e.status !== "reported" && e.event_date > d.today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .map((e) => ({ title: `${name(e.slug)} — ${e.period}`, meta: `${formatDay(e.event_date)} · ${e.status === "scheduled" ? "confirmed" : "estimated"}`, link: `/banks/${e.slug}` }))
    .slice(0, cap);
  const perBank = new Map<string, number>();
  const news: Item[] = d.news.filter((n) => mine(n.slug)).filter((n) => {
    const c = perBank.get(n.slug) ?? 0;
    perBank.set(n.slug, c + 1);
    return c < 3;
  }).map((n) => ({ title: `${name(n.slug)}: ${n.headline}`, body: n.summary, meta: [n.source_name, formatDay(n.published_on)].filter(Boolean).join(" · "), link: n.url }))
    .slice(0, followed ? 30 : 8);
  const behind: Item[] = followed ? [...followed].map((slug) => d.institutions.get(slug)).filter((i): i is Inst => Boolean(i))
    .filter((i) => d.events.some((e) => e.slug === i.slug && needsRefresh(e, i.researched_at)))
    .map((i) => ({ title: i.name, meta: `Dashboard still on ${i.latest_quarter ?? "older results"}`, link: `/banks/${i.slug}` })) : [];

  if (!updated.length && !reported.length && !coming.length && !news.length) return null;
  const sections: Section[] = [
    { heading: "Dashboards updated this week", items: updated },
    { heading: "Results out this week", items: reported },
    { heading: "Reporting in the next two weeks", items: coming },
    { heading: "News", items: news },
    { heading: "Results out, dashboard refresh queued", items: behind },
  ];
  const subject = `Your weekly bank briefing — ${formatDay(d.today)}`;
  return {
    to: person.email, subject,
    ...renderEmail({
      preheader: `${updated.length} dashboards updated · ${coming.length} reporting soon · ${news.length} news items`,
      heading: "Your weekly bank briefing",
      intro: followed
        ? `${firstName(person) ? `Hi ${firstName(person)}, here` : "Here"}'s the week for the ${followed.size} bank${followed.size === 1 ? "" : "s"} you follow.`
        : "You don't follow any banks yet, so here's the week across all of them. Star banks in the app to get a personal briefing.",
      sections,
    }),
  };
}

function mondayOf(iso: string) {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

export async function runDigest(db: SupabaseClient) {
  const d = await digestData(db);
  const week = mondayOf(d.today);
  let sent = 0, skipped = 0;
  for (const { person, prefs } of await people(db)) {
    if (!prefs.digest) { skipped++; continue; }
    const email = buildDigest(person, d);
    if (!email) { skipped++; continue; }
    // Claim this person's digest for the week; a second run finds it taken.
    const { data: claim } = await db.from("digest_sends").upsert({ user_id: person.id, week_start: week },
      { onConflict: "user_id,week_start", ignoreDuplicates: true }).select("user_id");
    if (!claim?.length) { skipped++; continue; }
    const result = await sendEmail(email);
    await log(db, "digest", email, result.ok ? null : result.error);
    if (result.ok) sent++;
    else await db.from("digest_sends").delete().eq("user_id", person.id).eq("week_start", week);
    await pause();
  }
  return { week, sent, skipped };
}

// The admin's "send me a preview" buttons.
export async function sendPreview(db: SupabaseClient, userId: string, kind: "test" | "digest") {
  const [{ person }] = await people(db, [userId]);
  let email: Email | null;
  if (kind === "digest") {
    email = buildDigest(person, await digestData(db));
    if (!email) return { ok: false as const, error: "Nothing to put in a digest this week." };
  } else {
    email = {
      to: person.email, subject: "Bank Intelligence test email",
      ...renderEmail({
        preheader: "Email is working.", heading: "Email is working",
        intro: "This test came from the Bank Intelligence app. Alerts and the weekly digest will arrive looking like this.",
        sections: [],
      }),
    };
  }
  const result = await sendEmail(email);
  await log(db, `preview-${kind}`, email, result.ok ? null : result.error);
  return result.ok ? { ok: true as const, to: person.email } : result;
}
