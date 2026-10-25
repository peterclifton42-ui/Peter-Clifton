"use server";

import { createClient } from "@/lib/supabase/server";

export type PasswordState = { error?: string; ok?: boolean } | undefined;

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true };
}

export type PrefsState = { error?: string; ok?: boolean } | undefined;

export async function saveEmailPreferences(_prev: PrefsState, formData: FormData): Promise<PrefsState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: "Please sign in again." };
  const { error } = await supabase.from("email_preferences").upsert({
    user_id: userId,
    instant: formData.get("instant") === "on",
    digest: formData.get("digest") === "on",
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return { ok: true };
}
