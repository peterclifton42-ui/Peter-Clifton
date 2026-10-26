"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setFollowing(slug: string, follow: boolean) {
  const viewer = await requireViewer();
  const supabase = await createClient();
  if (follow) {
    await supabase.from("favourites").upsert({ user_id: viewer.id, slug }, { onConflict: "user_id,slug", ignoreDuplicates: true });
  } else {
    await supabase.from("favourites").delete().eq("user_id", viewer.id).eq("slug", slug);
  }
  revalidatePath("/", "layout");
}

// Marks a followed bank as one of the seller's own accounts (in their book).
export async function setMyAccount(slug: string, mine: boolean) {
  const viewer = await requireViewer();
  const supabase = await createClient();
  await supabase.from("favourites").update({ my_account: mine }).eq("user_id", viewer.id).eq("slug", slug);
  revalidatePath("/", "layout");
}
