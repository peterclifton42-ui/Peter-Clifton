import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canManage, requireViewer } from "@/lib/auth";
import { formatAssets } from "@/lib/institutions";
import { loadTeam } from "@/lib/team";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { saveTeam } from "./actions";
import { Coverage } from "./coverage";

export const metadata: Metadata = { title: "Team and coverage" };

const ROLE_LABEL: Record<string, string> = { seller: "Seller", manager: "Manager", admin: "Admin" };

// A manager picks the sellers whose books roll up into their team view.
export default async function ManageTeamPage() {
  const viewer = await requireViewer();
  if (!canManage(viewer)) redirect("/whitespace");
  const supabase = await createClient();
  // Names and roles of everyone with access (sellers can't read each other's profiles).
  const db = adminConfigured() ? createAdminClient() : supabase;
  const [{ data: people }, { data: team }, { data: books }, { data: insts }, members] = await Promise.all([
    db.from("profiles").select("id, full_name, email, role, is_demo").in("role", ["seller", "manager", "admin"]).order("full_name"),
    supabase.from("team_members").select("seller_id").eq("manager_id", viewer.id),
    db.from("favourites").select("user_id").eq("my_account", true),
    supabase.from("institutions").select("slug, name, category, assets_b").order("assets_b", { ascending: false }),
    loadTeam(viewer.id),
  ]);
  const owners: Record<string, string[]> = {};
  for (const m of members) for (const s of m.banks) (owners[s] ??= []).push(m.id);
  const onTeam = new Set((team ?? []).map((t) => t.seller_id as string));
  const bookSize = new Map<string, number>();
  for (const b of books ?? []) bookSize.set(b.user_id as string, (bookSize.get(b.user_id as string) ?? 0) + 1);
  const others = (people ?? []).filter((p) => p.id !== viewer.id);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="crumb"><Link href="/whitespace?view=team">← Team whitespace</Link></p>
          <h1>Manage your team</h1>
          <p>Pick who&apos;s on your team, then assign them their banks and credit unions.</p>
        </div>
      </div>
      <form action={saveTeam} className="panel">
        <h2>Team</h2>
        <p className="dim">Tick the sellers whose books roll up into your team view. Your own book is always included. Sellers can be on more than one manager&apos;s team.</p>
        {others.length === 0 ? <p className="dim">No one else has access yet. Invite sellers from Admin.</p> : (
          <ul className="team-pick">
            {others.map((p) => (
              <li key={p.id}>
                <label className="toggle">
                  <input type="checkbox" name="seller" value={p.id} defaultChecked={onTeam.has(p.id)} />
                  <b>{p.full_name || p.email}</b>
                </label>
                <span className="dim">{p.email}</span>
                <span className="badge role">{ROLE_LABEL[p.role] ?? p.role}</span>
                {p.is_demo && <span className="badge status-estimated">Demo</span>}
                <span className="dim">{bookSize.get(p.id) ?? 0} accounts</span>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button type="submit">Save team</button>
          <Link href="/whitespace?view=team">Cancel</Link>
        </div>
      </form>

      <section className="panel" id="coverage">
        <h2>Coverage</h2>
        <p className="dim">
          Assigning a bank puts it in that person&apos;s book (followed, with My account on) and lets them know.
          Taking it out leaves them following it for news. They can still change their own book too.
        </p>
        <Coverage
          rows={(insts ?? []).map((i) => ({ slug: i.slug, name: i.name, category: i.category, assets: formatAssets(i.assets_b) }))}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          owners={owners}
        />
      </section>
    </main>
  );
}
