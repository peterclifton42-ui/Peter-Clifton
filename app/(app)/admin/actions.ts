"use server";

import { revalidatePath } from "next/cache";
import { createLink, emailLink, type LinkKind } from "@/lib/accounts";
import { requireAdmin } from "@/lib/auth";
import { sendPreview } from "@/lib/email/jobs";
import { emailConfigured } from "@/lib/email/send";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

export type AdminState = {
  error?: string;
  // The link went out by email (emailed) or must be passed on by hand (emailError).
  link?: { email: string; kind: LinkKind; url: string; emailed: boolean; emailError?: string };
} | undefined;

const ROLES = ["pending", "seller", "admin"] as const;

const NO_KEY = "Logins can't be managed until SUPABASE_SECRET_KEY is added in Vercel (see the note above).";

async function sendLink(userId: string, email: string, name: string | null, kind: LinkKind, invitedBy: { id: string; name: string | null }) {
  const admin = createAdminClient();
  const url = await createLink(admin, userId, kind, invitedBy.id);
  const emailError = await emailLink(admin, { to: email, name, kind, url, invitedBy: invitedBy.name });
  return { email, kind, url, emailed: !emailError, emailError: emailError ?? undefined };
}

// Creates the login (with no usable password) and sends a link to set one.
export async function createUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const viewer = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "seller");
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { error: "Unknown role." };
  if (!adminConfigured()) return { error: NO_KEY };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName || null },
  });
  if (error || !data.user) {
    return { error: /already/i.test(error?.message ?? "") ? `${email} already has a login. Use "Resend invite" or "Send reset link" on their row below.` : error?.message ?? "Couldn't create the user." };
  }

  const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
  if (roleError) return { error: `User created, but setting their role failed: ${roleError.message}` };

  revalidatePath("/admin");
  try {
    return { link: await sendLink(data.user.id, email, fullName || null, "invite", { id: viewer.id, name: viewer.fullName }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
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

// A fresh invite for someone who has never signed in, otherwise a reset link.
export async function sendPasswordLink(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const viewer = await requireAdmin();
  const id = String(formData.get("id"));
  if (!adminConfigured()) return { error: NO_KEY };
  const { data, error } = await createAdminClient().auth.admin.getUserById(id);
  if (error || !data.user?.email) return { error: error?.message ?? "User not found." };
  const kind: LinkKind = data.user.last_sign_in_at ? "reset" : "invite";
  const name = (data.user.user_metadata?.full_name as string | undefined) ?? null;
  try {
    return { link: await sendLink(id, data.user.email, name, kind, { id: viewer.id, name: viewer.fullName }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
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
