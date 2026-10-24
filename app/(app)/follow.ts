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
