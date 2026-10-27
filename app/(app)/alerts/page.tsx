import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markAllRead } from "./actions";

export const metadata: Metadata = { title: "Alerts" };

const KIND_LABEL: Record<string, string> = { dashboard: "Dashboard updated", results: "Results out", news: "News", whitespace: "Whitespace", request: "Your request" };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export default async function AlertsPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, kind, title, body, link, created_at, read_at")
    .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(60);
  const alerts = data ?? [];
  const unread = alerts.filter((a) => !a.read_at).length;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p>Dashboard updates, results and news for the banks you follow. You can change which of these are emailed to you on <Link href="/account">your account page</Link>.</p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="secondary">Mark all as read</button>
          </form>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="panel">
          <p>No alerts yet. <Link href="/banks">Follow some banks</Link> and you&apos;ll be told here when their results come out or their dashboard is updated.</p>
        </div>
      ) : (
        <div className="panel alerts">
          {alerts.map((a) => (
            <a key={a.id} href={`/alerts/${a.id}`} className={`alert${a.read_at ? "" : " unread"}`}
              {...(a.link && !a.link.startsWith("/") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              <span className={`badge kind-${a.kind}`}>{KIND_LABEL[a.kind] ?? a.kind}</span>
              <span className="alert-main">
                <strong>{a.title}</strong>
                {a.body && <span className="dim">{a.body}</span>}
              </span>
              <span className="when">{when(a.created_at)}</span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
