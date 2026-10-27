import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { memberNames } from "@/lib/people";
import { REQUEST_STATUS } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import { joinRequest, setRequestStatus } from "./actions";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Request a new institution" };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" });

// Request a dashboard for a bank or credit union the app doesn't cover yet, and
// see where every request is in the queue.
export default async function RequestInstitutionPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [{ data: requests }, { data: followers }, names] = await Promise.all([
    supabase.from("institution_requests").select("id, name, kind, website, note, requested_by, status, slug, error, attempts, created_at, finished_at")
      .order("created_at", { ascending: false }).limit(60),
    supabase.from("institution_request_followers").select("request_id, user_id"),
    memberNames(),
  ]);
  const waiting = new Map<number, string[]>();
  for (const f of followers ?? []) waiting.set(f.request_id as number, [...(waiting.get(f.request_id as number) ?? []), f.user_id as string]);
  const queue = (requests ?? []).filter((r) => r.status === "queued").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const position = new Map(queue.map((r, i) => [r.id as number, i + 1]));
  const admin = viewer.role === "admin";

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="crumb"><Link href="/banks">← Banks</Link></p>
          <h1>Request a new bank or credit union</h1>
          <p>Ask for a full research dashboard on an institution the app doesn&apos;t cover yet. Requests go straight into the queue; each scheduled run builds the oldest one first.</p>
        </div>
      </div>

      <section className="panel">
        <RequestForm />
      </section>

      <section className="panel">
        <h2>Requests ({queue.length} in the queue)</h2>
        {(requests ?? []).length === 0 ? <p className="dim">No requests yet.</p> : (
          <ul className="request-list">
            {(requests ?? []).map((r) => {
              const status = REQUEST_STATUS[r.status] ?? { label: r.status, tone: "" };
              const people = waiting.get(r.id) ?? [];
              const mine = r.requested_by === viewer.id || admin;
              return (
                <li key={r.id}>
                  <div className="request-main">
                    <b>{r.slug ? <Link href={`/banks/${r.slug}`}>{r.name}</Link> : r.name}</b>
                    <span className={`badge ${status.tone}`}>{status.label}{r.status === "queued" && position.get(r.id) ? ` · #${position.get(r.id)}` : ""}</span>
                    <span className="dim">
                      {r.kind === "credit_union" ? "Credit union" : "Bank"} · requested by {names.get(r.requested_by ?? "")?.split(" ")[0] ?? "someone"} {day(r.created_at)}
                      {people.length > 1 && ` · ${people.length} people waiting`}
                    </span>
                  </div>
                  {r.note && <p className="dim request-note">“{r.note}”</p>}
                  {r.status === "failed" && r.error && <p className="request-note bad">{r.error}</p>}
                  <div className="request-actions">
                    {(r.status === "queued" || r.status === "building") && !people.includes(viewer.id) && (
                      <form action={joinRequest}><input type="hidden" name="id" value={r.id} /><button type="submit" className="secondary">I want this too</button></form>
                    )}
                    {r.status === "queued" && mine && (
                      <form action={setRequestStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="to" value="cancelled" /><button type="submit" className="link">Cancel</button></form>
                    )}
                    {r.status === "failed" && mine && (
                      <form action={setRequestStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="to" value="queued" /><button type="submit" className="secondary">Try again</button></form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
