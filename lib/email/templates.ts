import "server-only";
import { APP_URL } from "./send";

// Plain, email-client-safe HTML: tables and inline styles, light background.

export type Item = { title: string; body?: string | null; link?: string | null; meta?: string | null };
export type Section = { heading: string; items: Item[]; empty?: string };

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function absolute(link: string | null | undefined) {
  if (!link) return null;
  return link.startsWith("/") ? APP_URL + link : link;
}

function itemHtml(item: Item) {
  const href = absolute(item.link);
  const title = href
    ? `<a href="${esc(href)}" style="color:#1d4ed8;text-decoration:none;font-weight:600">${esc(item.title)}</a>`
    : `<strong>${esc(item.title)}</strong>`;
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">
    ${title}
    ${item.meta ? `<div style="color:#6b7280;font-size:12px;margin-top:2px">${esc(item.meta)}</div>` : ""}
    ${item.body ? `<div style="color:#374151;font-size:14px;margin-top:4px">${esc(item.body)}</div>` : ""}
  </td></tr>`;
}

export function renderEmail(opts: { preheader: string; heading: string; intro: string; sections: Section[] }) {
  const sections = opts.sections.filter((s) => s.items.length || s.empty).map((s) => `
    <h2 style="font-size:15px;color:#111827;margin:24px 0 4px">${esc(s.heading)}</h2>
    ${s.items.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${s.items.map(itemHtml).join("")}</table>`
      : `<p style="color:#6b7280;font-size:14px;margin:4px 0">${esc(s.empty!)}</p>`}`).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;padding:28px">
<tr><td>
  <div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#2563eb;text-transform:uppercase">Bank Intelligence</div>
  <h1 style="font-size:20px;color:#111827;margin:6px 0 8px">${esc(opts.heading)}</h1>
  <p style="color:#374151;font-size:14px;margin:0">${esc(opts.intro)}</p>
  ${sections}
  <p style="margin:28px 0 0"><a href="${APP_URL}/" style="background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Open Bank Intelligence</a></p>
  <p style="color:#9ca3af;font-size:12px;margin:24px 0 0">You get this because you follow these banks. <a href="${APP_URL}/account" style="color:#6b7280">Change your email settings</a>.</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    opts.heading, "", opts.intro,
    ...opts.sections.filter((s) => s.items.length || s.empty).flatMap((s) => [
      "", s.heading.toUpperCase(),
      ...(s.items.length
        ? s.items.map((i) => `- ${i.title}${i.meta ? ` (${i.meta})` : ""}${i.body ? `\n  ${i.body}` : ""}${absolute(i.link) ? `\n  ${absolute(i.link)}` : ""}`)
        : [s.empty!]),
    ]),
    "", `Open Bank Intelligence: ${APP_URL}/`, `Change your email settings: ${APP_URL}/account`,
  ].join("\n");

  return { html, text };
}
