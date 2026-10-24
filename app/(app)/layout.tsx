import Link from "next/link";
import { requireViewer } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">Bank Intelligence</Link>
        {viewer.role !== "pending" && (
          <nav className="nav">
            <Link href="/">Banks</Link>
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
