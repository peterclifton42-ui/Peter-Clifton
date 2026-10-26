import "server-only";
import { memberNames } from "./people";
import { createClient } from "./supabase/server";

// A manager's team: the sellers they picked (plus the manager themselves) and
// each one's book (followed banks marked "My account"). Row-level security
// lets a manager read only their own team's follows.
export type TeamMember = { id: string; name: string; self: boolean; banks: string[] };

export async function loadTeam(managerId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data: team } = await supabase.from("team_members").select("seller_id").eq("manager_id", managerId);
  const ids = [managerId, ...(team ?? []).map((t) => t.seller_id as string)];
  const [{ data: favs }, names] = await Promise.all([
    supabase.from("favourites").select("user_id, slug").in("user_id", ids).eq("my_account", true),
    memberNames(),
  ]);
  return ids.map((id) => ({
    id,
    name: id === managerId ? `${names.get(id)?.split(" ")[0] ?? "You"} (you)` : names.get(id) ?? "Unknown",
    self: id === managerId,
    banks: (favs ?? []).filter((f) => f.user_id === id).map((f) => f.slug as string),
  })).sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name));
}

// Who owns each bank in a set of team members.
export function ownersByBank(members: TeamMember[]) {
  const owners = new Map<string, TeamMember[]>();
  for (const m of members) for (const s of m.banks) owners.set(s, [...(owners.get(s) ?? []), m]);
  return owners;
}
