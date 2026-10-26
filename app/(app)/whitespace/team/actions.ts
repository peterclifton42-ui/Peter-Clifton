"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canManage, requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Replaces the manager's team with the sellers ticked on the form.
export async function saveTeam(formData: FormData) {
  const viewer = await requireViewer();
  if (!canManage(viewer)) redirect("/whitespace");
  const picked = new Set(formData.getAll("seller").map(String).filter((id) => id !== viewer.id));
  const supabase = await createClient();
  const { data: current } = await supabase.from("team_members").select("seller_id").eq("manager_id", viewer.id);
  const have = new Set((current ?? []).map((c) => c.seller_id as string));
  const drop = [...have].filter((id) => !picked.has(id));
  const add = [...picked].filter((id) => !have.has(id));
  if (drop.length) await supabase.from("team_members").delete().eq("manager_id", viewer.id).in("seller_id", drop);
  if (add.length) await supabase.from("team_members").insert(add.map((seller_id) => ({ manager_id: viewer.id, seller_id, added_by: viewer.id })));
  revalidatePath("/whitespace");
  redirect("/whitespace?view=team");
}
