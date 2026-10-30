"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Shows a saved plan, or writes a new one and streams it in as it arrives.
export function PlanView({ slug, productSlug, title, initial, meta, outdated, enabled }: {
  slug: string; productSlug: string; title: string; initial: string | null; meta: string | null; outdated: boolean; enabled: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  async function generate() {
    setBusy(true); setError(null); setText("");
    try {
      const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, product: productSlug }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null) as { error?: string } | null;
        setError(j?.error ?? "Something went wrong. Try again."); setText(initial ?? ""); return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let all = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        all += decoder.decode(value, { stream: true });
        const [plan, err] = all.split("[[error]]");
        setText(plan.trimEnd());
        if (err) setError(err);
      }
      router.refresh();
    } catch {
      setError("The connection dropped. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const html = body.current?.innerHTML ?? "";
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }),
      })]);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  // Word opens an HTML document saved as .doc, keeping headings, lists and tables.
  function download() {
    const doc = `<html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px;text-align:left}</style></head><body><h1>Engagement plan: ${title}</h1>${body.current?.innerHTML ?? ""}</body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿", doc], { type: "application/msword" }));
    a.download = `Engagement plan - ${title.replace(/[^\w &-]+/g, "")}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="panel plan">
      <div className="plan-bar">
        <span className="dim">{busy ? "Writing the plan from the dashboard, news and your whitespace notes…" : meta ?? "No plan yet."}</span>
        <div className="plan-actions">
          {text && !busy && <button type="button" className="secondary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>}
          {text && !busy && <button type="button" className="secondary" onClick={download}>Download (Word)</button>}
          {enabled && (
            <button type="button" onClick={generate} disabled={busy}>
              {busy ? "Writing…" : text ? "Refresh plan" : "Generate engagement plan"}
            </button>
          )}
        </div>
      </div>
      {outdated && !busy && <p className="ws-hint">The dashboard has been updated since this plan was written. Refresh it to pick up the new research.</p>}
      {!enabled && <p className="ws-hint warn-text">AI isn&apos;t switched on: ANTHROPIC_API_KEY is not set in Vercel.</p>}
      {error && <div className="notice error">{error}</div>}
      {text ? (
        <div className="plan-body" ref={body}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: ({ children }) => <div className="table-wrap flat"><table>{children}</table></div> }}>{text}</ReactMarkdown>
        </div>
      ) : !busy && (
        <p>One click writes a one-page plan for this pursuit: the objective and why now, who to engage, a dated sequence to the target quarter, the opening talk track, objections, proof points and the next three actions. It&apos;s saved here for the whole account team. Takes about a minute.</p>
      )}
    </section>
  );
}
