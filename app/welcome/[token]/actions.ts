"use server";

import { redirect } from "next/navigation";
import { findLink } from "@/lib/accounts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordState = { error?: string } | undefined;

// Sets the password from a one-time link, then signs the person in.
export async function setPasswordFromLink(token: string, _prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const admin = createAdminClient();
  const found = await findLink(admin, token);
  if ("problem" in found) return { error: found.problem };
  // Claim the link first so it can't be used twice.
  const { data: claimed } = await admin.from("account_links").update({ used_at: new Date().toISOString() })
    .eq("id", found.link.id).is("used_at", null).select("id");
  if (!claimed?.length) return { error: "This link has already been used." };

  const { data: user, error } = await admin.auth.admin.updateUserById(found.link.user_id, {
    password,
    ...(fullName ? { user_metadata: { full_name: fullName } } : {}),
  });
  if (error || !user.user?.email) return { error: error?.message ?? "Couldn't set the password." };
  if (fullName) await admin.from("profiles").update({ full_name: fullName }).eq("id", found.link.user_id);

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.user.email, password });
  if (signInError) redirect("/login");
  redirect("/");
}
