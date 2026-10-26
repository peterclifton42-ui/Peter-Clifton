import "server-only";
import { createClient } from "./supabase/server";

// Slugs of the institutions the signed-in user follows.
export async function followedSlugs(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("favourites").select("slug").eq("user_id", userId);
  return new Set((data ?? []).map((f) => f.slug as string));
}

// The seller's book: followed banks they mark as their own accounts ("My
// account"); the rest are followed for news and alerts only.
export async function bookSlugs(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("favourites").select("slug").eq("user_id", userId).eq("my_account", true);
  return new Set((data ?? []).map((f) => f.slug as string));
}
