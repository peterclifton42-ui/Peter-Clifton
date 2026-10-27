"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireViewer } from "@/lib/auth";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// A manager puts a bank in (or takes it out of) a team member's book. Row-level
// security limits it to the manager's own team; admins can assign anyone.
export async function setAssignment(slug: string, sellerId: string, assign: boolean): Promise<{ error?: string }> {
  const viewer = await requireViewer();
  if (!canManage(viewer)) return { error: "Only managers can assign accounts." };
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error } = assign
    ? await supabase.from("favourites").upsert(
        { user_id: sellerId, slug, my_account: true, assigned_by: viewer.id, assigned_at: now },
        { onConflict: "user_id,slug" },
      )
    : await supabase.from("favourites").update({ my_account: false, assigned_by: null, assigned_at: null })
        .eq("user_id", sellerId).eq("slug", slug);
  if (error) return { error: /row-level security/i.test(error.message) ? "You can only assign accounts to people on your team." : error.message };

  await supabase.from("account_assignments").insert({ slug, seller_id: sellerId, action: assign ? "assigned" : "unassigned", by_user: viewer.id });

  // Let them know (not when managers change their own book).
  if (sellerId !== viewer.id && adminConfigured()) {
    const db = createAdminClient();
    const { data: inst } = await db.from("institutions").select("name").eq("slug", slug).maybeSingle();
    const who = viewer.fullName?.split(" ")[0] ?? "Your manager";
    const name = inst?.name ?? slug;
    await db.from("notifications").insert({
      user_id: sellerId, kind: "assignment", slug, link: `/banks/${slug}`,
      title: assign ? `${who} assigned you ${name}` : `${who} took ${name} out of your book`,
      body: assign
        ? "It's now one of your accounts: it counts in your Whitespace, Home and digest."
        : "You still follow it for news; it no longer counts in your book.",
    });
  }
  revalidatePath("/", "layout");
  return {};
}
