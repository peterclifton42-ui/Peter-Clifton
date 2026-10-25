import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { emailConfigured } from "@/lib/email/send";
import { adminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm, EmailPreviewForm, UserRow } from "./forms";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const [{ data: users }, { data: runs }, { data: institutions }, { data: emails }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, created_at").order("created_at"),
    supabase.from("refresh_runs").select("id, job, slug, started_at, finished_at, status, note")
      .order("started_at", { ascending: false }).limit(12),
    supabase.from("institutions").select("slug, name"),
    supabase.from("email_log").select("id, job, recipient, subject, status, error, created_at")
      .order("created_at", { ascending: false }).limit(10),
  ]);
  const names = new Map((institutions ?? []).map((i) => [i.slug as string, i.name as string]));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p>Create logins for sellers and manage who has access.</p>
        </div>
      </div>

      {!adminConfigured() && (
        <div className="notice error">
          The admin key isn&apos;t set up yet, so logins can&apos;t be created. Add <code>SUPABASE_SECRET_KEY</code> in
          Vercel → Settings → Environment Variables, then redeploy.
        </div>
      )}

      <div className="panel">
        <h2>Add a seller</h2>
        <p>The app creates the login and shows a temporary password to send them.</p>
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
        <h2>People with access ({users?.length ?? 0})</h2>
        {(users ?? []).map((u) => (
          <UserRow key={u.id} id={u.id} email={u.email} fullName={u.full_name} role={u.role} isSelf={u.id === viewer.id} />
        ))}
      </div>
    </main>
  );
}
