import "server-only";

// Sends email through Resend (resend.com). Needs RESEND_API_KEY in Vercel; until
// a domain is verified there, EMAIL_FROM stays on Resend's test sender, which can
// only deliver to the Resend account's own address.
export const APP_URL = (process.env.APP_URL || "https://peter-clifton.vercel.app").replace(/\/$/, "");
const FROM = process.env.EMAIL_FROM || "Bank Intelligence <onboarding@resend.dev>";

export type Email = { to: string; subject: string; html: string; text: string };
export type SendResult = { ok: true } | { ok: false; error: string };

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(email: Email): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Resend allows a few requests a second; pause between sends in a batch.
export const pause = () => new Promise((r) => setTimeout(r, 600));
