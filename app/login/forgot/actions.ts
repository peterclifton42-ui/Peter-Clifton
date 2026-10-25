"use server";

import { createLink, emailLink } from "@/lib/accounts";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

export type ForgotState = { sent?: boolean; error?: string } | undefined;

// Emails a reset link if the address has an account. The reply is the same
// either way, so the form can't be used to find out who has one.
export async function requestReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { error: "Enter your email address." };
  if (!adminConfigured()) return { error: "Password resets aren't set up yet. Ask your admin." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, full_name").ilike("email", email).maybeSingle();
  if (profile) {
    // At most one email every 5 minutes per account.
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count } = await admin.from("account_links").select("id", { count: "exact", head: true })
      .eq("user_id", profile.id).gte("created_at", since);
    if (!count) {
      const url = await createLink(admin, profile.id, "reset", null);
      await emailLink(admin, { to: email, name: profile.full_name, kind: "reset", url });
    }
  }
  return { sent: true };
}
