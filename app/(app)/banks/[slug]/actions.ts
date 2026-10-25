"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Ask for an out-of-date dashboard to be refreshed. The scheduled refresh job
// takes requested institutions first; publishing closes the request.
export async function requestRefresh(slug: string) {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data: open } = await supabase.from("refresh_requests").select("id").eq("slug", slug).is("fulfilled_at", null).limit(1);
  if (!open?.length) await supabase.from("refresh_requests").insert({ slug, requested_by: viewer.id });
  revalidatePath(`/banks/${slug}`);
}
