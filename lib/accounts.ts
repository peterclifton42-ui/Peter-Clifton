import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_NAME } from "./brand";
import { APP_URL, emailConfigured, sendEmail } from "./email/send";
import { renderEmail } from "./email/templates";

// One-time "set your password" links: an invite from an admin, or a forgotten
// password. The emailed token is random; only its SHA-256 is stored, in
// account_links, which only the secret-key client can read.

export type LinkKind = "invite" | "reset";
const LIFETIME_HOURS: Record<LinkKind, number> = { invite: 24 * 7, reset: 2 };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createLink(admin: SupabaseClient, userId: string, kind: LinkKind, createdBy: string | null) {
  // A new link replaces any earlier unused one.
  await admin.from("account_links").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null);
  const token = randomBytes(32).toString("base64url");
  const { error } = await admin.from("account_links").insert({
    user_id: userId, kind, token_hash: hash(token), created_by: createdBy,
    expires_at: new Date(Date.now() + LIFETIME_HOURS[kind] * 3600 * 1000).toISOString(),
  });
  if (error) throw new Error(`Couldn't create the link: ${error.message}`);
  return `${APP_URL}/welcome/${token}`;
}

export type LinkRow = { id: number; user_id: string; kind: LinkKind; expires_at: string; used_at: string | null };

// The link's row if it can still be used, or why not.
export async function findLink(admin: SupabaseClient, token: string): Promise<{ link: LinkRow } | { problem: string }> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { problem: "This link isn't valid." };
  const { data } = await admin.from("account_links").select("id, user_id, kind, expires_at, used_at")
    .eq("token_hash", hash(token)).maybeSingle();
  if (!data) return { problem: "This link isn't valid." };
  if (data.used_at) return { problem: "This link has already been used, or a newer one was sent." };
  if (new Date(data.expires_at) < new Date()) return { problem: "This link has expired." };
  return { link: data as LinkRow };
}

// Emails the link. Returns an error message when the email couldn't be sent, so
// the admin can pass the link on themselves.
export async function emailLink(admin: SupabaseClient, opts: {
  to: string; name: string | null; kind: LinkKind; url: string; invitedBy?: string | null;
}): Promise<string | null> {
  if (!emailConfigured()) return "Email isn't set up (RESEND_API_KEY).";
  const first = opts.name?.split(" ")[0];
  const invite = opts.kind === "invite";
  const subject = invite ? `You're invited to ${APP_NAME}` : `Set a new password for ${APP_NAME}`;
  const { html, text } = renderEmail({
    preheader: invite ? "Set your password to get started." : "This link works for 2 hours.",
    heading: invite ? `${first ? `${first}, you're` : "You're"} invited to ${APP_NAME}` : "Set a new password",
    intro: invite
      ? `${opts.invitedBy ? `${opts.invitedBy} has` : "You've been"} given you access to ${APP_NAME}: research dashboards, news, earnings dates and an AI assistant for the banks and credit unions Curinos sells to. Choose a password to get started. The link works for 7 days.`
      : "Someone (hopefully you) asked to reset your password. Choose a new one with the button below. The link works for 2 hours and only once.",
    sections: [],
    button: { label: invite ? "Set your password" : "Choose a new password", url: opts.url },
    footer: invite
      ? `Your sign-in email is ${opts.to}. Afterwards, sign in at ${APP_URL}/login.`
      : "If you didn't ask for this, ignore this email; your password stays the same.",
  });
  const email = { to: opts.to, subject, html, text };
  const result = await sendEmail(email);
  const error = result.ok ? null : result.error;
  await admin.from("email_log").insert({ job: opts.kind, recipient: opts.to, subject, status: error ? "failed" : "sent", error });
  return error;
}
