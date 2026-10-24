"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", viewer.id).is("read_at", null);
  revalidatePath("/", "layout");
}
