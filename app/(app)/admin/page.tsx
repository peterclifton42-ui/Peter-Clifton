import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { askConfigured } from "@/lib/ask/agent";
import { emailConfigured } from "@/lib/email/send";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ClearDemoButton, CreateUserForm, EmailPreviewForm, UserRow } from "./forms";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: users }, { data: runs }, { data: institutions }, { data: emails }, { data: asks }, { data: flagged }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, created_at, is_demo").order("created_at"),
    supabase.from("refresh_runs").select("id, job, slug, started_at, finished_at, status, note")
      .order("started_at", { ascending: false }).limit(12),
    supabase.from("institutions").select("slug, name"),
    supabase.from("email_log").select("id, job, recipient, subject, status, error, created_at")
      .order("created_at", { ascending: false }).limit(10),
    supabase.from("ask_log").select("user_id, cost_usd, status, rating").gte("created_at", monthStart),
    supabase.from("ask_log").select("id, user_id, question, comment, created_at")
      .eq("rating", -1).order("created_at", { ascending: false }).limit(8),
  ]);
  // Who has signed in at least once (auth data, so it needs the secret key).
  const signedIn = new Set<string>();
  if (adminConfigured()) {
    const { data: auth } = await createAdminClient().auth.admin.listUsers({ perPage: 500 });
    (auth?.users ?? []).forEach((u) => { if (u.last_sign_in_at) signedIn.add(u.id); });
  }
  const [{ count: wsTotal }, { count: wsDemo }] = await Promise.all([
    supabase.from("whitespace").select("id", { count: "exact", head: true }),
    supabase.from("whitespace").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);
  const demoSellers = (users ?? []).filter((u) => (u as { is_demo?: boolean }).is_demo).length;
  const emailOf = new Map((users ?? []).map((u) => [u.id as string, (u.full_name || u.email) as string]));
  const askCost = (asks ?? []).reduce((sum, a) => sum + Number(a.cost_usd ?? 0), 0);
  const askUsers = new Set((asks ?? []).map((a) => a.user_id)).size;
  const askErrors = (asks ?? []).filter((a) => a.status === "error").length;
  const ratings = (asks ?? []).filter((a) => a.rating != null);
  const names = new Map((institutions ?? []).map((i) => [i.slug as string, i.name as string]));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p>Invite sellers and manage who has access.</p>
        </div>
      </div>

      {!adminConfigured() && (
        <div className="notice error">
          The admin key isn&apos;t set up yet, so logins can&apos;t be created. Add <code>SUPABASE_SECRET_KEY</code> in
          Vercel → Settings → Environment Variables, then redeploy.
        </div>
      )}

      <div className="panel">
        <h2>Invite someone</h2>
        <p>They get an email with a link to choose their own password. If the email can&apos;t be sent, you get the link to pass on yourself.</p>
        <CreateUserForm />
      </div>

      <div className="panel">
        <h2>Automatic updates</h2>
        <p>
          A refresh job researches one out-of-date dashboard twice a day (most-followed banks first), and a weekly job
          confirms results dates and collects news. Their recent runs:
        </p>
        {(runs ?? []).length === 0 ? <p className="dim">No runs yet.</p> : (
          <div className="table-wrap flat">
            <table className="calendar">
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="when">{new Date(r.started_at).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                    <td>{r.job === "weekly" ? "Weekly calendar and news" : r.slug ? names.get(r.slug) ?? r.slug : "Refresh"}</td>
                    <td><span className={`badge run-${r.status}`}>{r.status}</span></td>
                    <td className="dim" colSpan={2}>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Email</h2>
        {emailConfigured() ? (
          <p>
            Instant alerts go out within 30 minutes of a followed bank&apos;s results or dashboard update. The weekly digest
            goes out on Monday at 11:23 UTC, after the weekly news job. Each person chooses which they get on their account page.
          </p>
        ) : (
          <div className="notice info">
            Email isn&apos;t switched on yet. Alerts still appear in the app. To send email, add <code>RESEND_API_KEY</code> in
            Vercel → Settings → Environment Variables and redeploy.
          </div>
        )}
        <EmailPreviewForm />
        {(emails ?? []).length > 0 && (
          <div className="table-wrap flat">
            <table className="calendar">
              <tbody>
                {(emails ?? []).map((e) => (
                  <tr key={e.id}>
                    <td className="when">{new Date(e.created_at).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                    <td>{e.recipient}</td>
                    <td><span className={`badge run-${e.status === "sent" ? "done" : "failed"}`}>{e.status}</span></td>
                    <td className="dim">{e.error ?? e.subject}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Ask assistant</h2>
        {!askConfigured() ? (
          <div className="notice info">
            The assistant isn&apos;t switched on. Add <code>ANTHROPIC_API_KEY</code> (from console.anthropic.com) in Vercel → Settings →
            Environment Variables and redeploy. Set a monthly spend limit in the Anthropic console too.
          </div>
        ) : (
          <p>
            This month: <b>{asks?.length ?? 0}</b> questions from {askUsers} {askUsers === 1 ? "person" : "people"}, about{" "}
            <b>${askCost.toFixed(2)}</b> of Claude API usage{askErrors > 0 && <>, {askErrors} failed</>}.
            {ratings.length > 0 && <> {ratings.filter((r) => r.rating === 1).length} 👍 · {ratings.filter((r) => r.rating === -1).length} 👎.</>}
            {" "}Each person can ask up to {Number(process.env.ASK_DAILY_LIMIT) || 40} questions in 24 hours.
          </p>
        )}
        <p><Link href="/admin/questions">See every question and answer →</Link></p>
        {(flagged ?? []).length > 0 && (
          <>
            <h3>Answers marked 👎</h3>
            <ul className="plain">
              {(flagged ?? []).map((f) => (
                <li key={f.id}>
                  <b>{f.question}</b>
                  <span className="dim"> — {emailOf.get(f.user_id) ?? "someone"}, {new Date(f.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short" })}{f.comment ? `: “${f.comment}”` : ""}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Whitespace</h2>
        <p>
          <b>{wsTotal ?? 0}</b> product statuses set across all banks{(wsDemo ?? 0) > 0 && <>, of which <b>{wsDemo}</b> are demo data</>}
          {demoSellers > 0 && <>, plus <b>{demoSellers}</b> demo sellers on your team</>}.{" "}
          <Link href="/whitespace">Open Whitespace →</Link>
        </p>
        {(wsDemo ?? 0) > 0 && <ClearDemoButton count={wsDemo ?? 0} />}
      </div>

      <div className="panel">
        <h2>People with access ({users?.length ?? 0})</h2>
        {(users ?? []).map((u) => (
          <UserRow key={u.id} id={u.id} email={u.email} fullName={u.full_name} role={u.role} isSelf={u.id === viewer.id}
            signedIn={!adminConfigured() || signedIn.has(u.id)} />
        ))}
      </div>
    </main>
  );
}
