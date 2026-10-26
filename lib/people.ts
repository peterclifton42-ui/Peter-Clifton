import "server-only";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Display names of everyone with a login, for "who changed this". Sellers can
// read only their own profile, so this reads names (nothing else) server-side.
export async function memberNames() {
  const db = adminConfigured() ? createAdminClient() : await createClient();
  const { data } = await db.from("profiles").select("id, full_name, email");
  return new Map((data ?? []).map((p) => [p.id as string, ((p.full_name as string | null) || (p.email as string).split("@")[0])]));
}
