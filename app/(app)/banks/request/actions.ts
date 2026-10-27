"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { sameInstitution } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";

export type RequestState = {
  error?: string;
  duplicate?: { slug: string; name: string };
  joined?: string;
  queued?: string;
} | undefined;

// Queue a dashboard for an institution the app doesn't cover yet (no approval:
// the scheduled refresh job builds at most one per run, before routine refreshes).
export async function requestInstitution(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const viewer = await requireViewer();
  if (viewer.role === "pending") return { error: "Your account is waiting for approval." };
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const website = String(formData.get("website") ?? "").trim().slice(0, 200) || null;
  const kind = formData.get("kind") === "credit_union" ? "credit_union" : "bank";
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const addToBook = formData.get("add_to_book") === "on";
  const confirmed = formData.get("confirm_new") === "1";
  if (name.length < 3) return { error: "Enter the institution's name." };

  const supabase = await createClient();
  const [{ data: covered }, { data: open }] = await Promise.all([
    supabase.from("institutions").select("slug, name"),
    supabase.from("institution_requests").select("id, name").in("status", ["queued", "building"]),
  ]);
  const match = (covered ?? []).find((i) => sameInstitution(i.name, name));
  if (match && !confirmed) return { duplicate: { slug: match.slug, name: match.name } };

  const existing = (open ?? []).find((r) => sameInstitution(r.name, name));
  if (existing) {
    await supabase.from("institution_request_followers")
      .upsert({ request_id: existing.id, user_id: viewer.id, add_to_book: addToBook }, { onConflict: "request_id,user_id" });
    revalidatePath("/banks/request");
    return { joined: existing.name };
  }

  const { data: created, error } = await supabase.from("institution_requests")
    .insert({ name, website, kind, note, requested_by: viewer.id }).select("id").single();
  if (error || !created) return { error: error?.message ?? "Couldn't save the request." };
  await supabase.from("institution_request_followers").insert({ request_id: created.id, user_id: viewer.id, add_to_book: addToBook });
  revalidatePath("/banks/request");
  revalidatePath("/banks");
  return { queued: name };
}

export async function joinRequest(formData: FormData) {
  const viewer = await requireViewer();
  const id = Number(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("institution_request_followers").upsert({ request_id: id, user_id: viewer.id, add_to_book: true }, { onConflict: "request_id,user_id" });
  revalidatePath("/banks/request");
}

// The requester (or an admin) can cancel a queued request or retry a failed one.
export async function setRequestStatus(formData: FormData) {
  await requireViewer();
  const id = Number(formData.get("id"));
  const to = formData.get("to") === "queued" ? "queued" : "cancelled";
  const supabase = await createClient();
  await supabase.from("institution_requests").update({ status: to, ...(to === "queued" ? { attempts: 0, error: null } : {}) }).eq("id", id);
  revalidatePath("/banks/request");
  revalidatePath("/banks");
}
