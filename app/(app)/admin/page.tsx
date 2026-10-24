import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { adminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm, UserRow } from "./forms";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at");

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
        <h2>People with access ({users?.length ?? 0})</h2>
        {(users ?? []).map((u) => (
          <UserRow key={u.id} id={u.id} email={u.email} fullName={u.full_name} role={u.role} isSelf={u.id === viewer.id} />
        ))}
      </div>
    </main>
  );
}
