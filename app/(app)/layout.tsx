import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  let unread = 0;
  if (viewer.role !== "pending") {
    const supabase = await createClient();
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("user_id", viewer.id).is("read_at", null);
    unread = count ?? 0;
  }

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">Bank Intelligence</Link>
        {viewer.role !== "pending" && (
          <nav className="nav">
            <Link href="/">Home</Link>
            <Link href="/banks">Banks</Link>
            <Link href="/calendar">Calendar</Link>
            <Link href="/compare">Compare</Link>
            <Link href="/insights">Insights</Link>
            <Link href="/products">Products</Link>
            <Link href="/alerts" aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}>
              Alerts{unread > 0 && <span className="count">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            {viewer.role === "admin" && <Link href="/admin">Admin</Link>}
          </nav>
        )}
        <div className="user">
          <Link href="/account">{viewer.fullName || viewer.email}</Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="link">Sign out</button>
          </form>
        </div>
      </header>
      {viewer.role === "pending" ? (
        <main className="page">
          <div className="panel">
            <h2>Your account is waiting for approval</h2>
            <p>An admin needs to give your account access before you can see the bank dashboards.</p>
          </div>
        </main>
      ) : (
        children
      )}
    </>
  );
}
