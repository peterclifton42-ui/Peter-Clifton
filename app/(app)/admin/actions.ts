"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { sendPreview } from "@/lib/email/jobs";
import { emailConfigured } from "@/lib/email/send";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

export type AdminState = { error?: string; created?: { email: string; password: string } } | undefined;

const ROLES = ["pending", "seller", "admin"] as const;

const NO_KEY = "Logins can't be managed until SUPABASE_SECRET_KEY is added in Vercel (see the note above).";

// Readable temporary password: no characters that are easy to confuse.
function temporaryPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(14);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function createUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "seller");
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { error: "Unknown role." };
  if (!adminConfigured()) return { error: NO_KEY };

  const admin = createAdminClient();
  const password = temporaryPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || null },
  });
  if (error || !data.user) return { error: error?.message ?? "Couldn't create the user." };

  const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
  if (roleError) return { error: `User created, but setting their role failed: ${roleError.message}` };

  revalidatePath("/admin");
  return { created: { email, password } };
}

export async function setRole(formData: FormData) {
  const viewer = await requireAdmin();
  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (!ROLES.includes(role as (typeof ROLES)[number])) return;
  if (id === viewer.id && role !== "admin") return; // never lock yourself out
  if (!adminConfigured()) return;
  await createAdminClient().from("profiles").update({ role }).eq("id", id);
  revalidatePath("/admin");
}

export async function resetPassword(_prev: AdminState, formData: FormData): Promise<AdminState> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const email = String(formData.get("email"));
  if (!adminConfigured()) return { error: NO_KEY };
  const password = temporaryPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password });
  if (error) return { error: error.message };
  return { created: { email, password } };
}

export async function removeUser(formData: FormData) {
  const viewer = await requireAdmin();
  const id = String(formData.get("id"));
  if (id === viewer.id || !adminConfigured()) return;
  await createAdminClient().auth.admin.deleteUser(id);
  revalidatePath("/admin");
}

export type EmailPreviewState = { error?: string; sentTo?: string } | undefined;

export async function sendEmailPreview(_prev: EmailPreviewState, formData: FormData): Promise<EmailPreviewState> {
  const viewer = await requireAdmin();
  if (!adminConfigured()) return { error: NO_KEY };
  if (!emailConfigured()) return { error: "Email isn't set up yet: add RESEND_API_KEY in Vercel (see the note above)." };
  const kind = formData.get("kind") === "digest" ? "digest" : "test";
  const result = await sendPreview(createAdminClient(), viewer.id, kind);
  revalidatePath("/admin");
  return result.ok ? { sentTo: result.to } : { error: result.error };
}
