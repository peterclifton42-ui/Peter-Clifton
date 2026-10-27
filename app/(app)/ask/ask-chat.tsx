"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Turn = { role: "user" | "assistant"; content: string; logId?: number | null; rating?: 1 | -1; error?: boolean };
// For a comparison, slug is the comma-separated ids in page order, name lists
// them and focus is the first one's name (for the starter questions).
export type ChatContext = { kind: "bank" | "product" | "compare"; slug: string; name: string; focus?: string } | null;

const STARTERS: Record<string, string[]> = {
  market: [
    "Which of my banks are most likely to need deposit pricing help this quarter, and why?",
    "Who reports results in the next two weeks, and what should I watch for?",
    "Summarise my whitespace: where's the biggest opportunity, and what should I pursue next quarter?",
    "What are the most common objections to Pricing Data, and how do I answer them?",
  ],
  bank: [
    "Give me a one-minute brief before my call.",
    "What's changed since their last results, and what's the best opening?",
    "Who should I talk to, and what does each of them care about?",
    "Which products should we pursue here next, given the research and our whitespace?",
  ],
  product: [
    "Which three banks should I call first for this, and what do I say?",
    "What objections will I hear, and how do I answer them?",
    "Which of the banks I follow are a fit?",
  ],
  compare: [
    "Summarise this comparison: who stands out, and on what?",
    "Where is {focus} weaker than the others, and which Curinos products help with that?",
    "Which of these looks under the most deposit pressure, and why?",
    "Turn this into three talking points for a call with {focus}.",
  ],
};

function storageKey(context: ChatContext) {
  return `ask:${context ? `${context.kind}:${context.slug}` : "market"}`;
}

export function AskChat({ context, compact = false }: { context: ChatContext; compact?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // Keep the conversation for this page while the tab is open.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey(context));
      if (saved) setTurns(JSON.parse(saved));
    } catch { /* storage unavailable */ }
  }, [context]);
  useEffect(() => {
    try { sessionStorage.setItem(storageKey(context), JSON.stringify(turns)); } catch { /* storage unavailable */ }
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, context]);

  function patchLast(update: (t: Turn) => Turn) {
    setTurns((all) => [...all.slice(0, -1), update(all[all.length - 1])]);
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = [...turns.filter((t) => !t.error), { role: "user" as const, content: q }];
    setTurns([...turns, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setStatus("Thinking");
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), context }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Something went wrong." }));
        patchLast((t) => ({ ...t, content: err.error ?? "Something went wrong.", error: true }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "status") setStatus(e.text);
          else if (e.type === "text") { setStatus(null); patchLast((t) => ({ ...t, content: t.content + e.text })); }
          else if (e.type === "error") patchLast((t) => ({ ...t, content: `${t.content}${t.content ? "\n\n" : ""}${e.message}`, error: !t.content }));
          else if (e.type === "done") patchLast((t) => ({ ...t, logId: e.logId }));
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        patchLast((t) => ({ ...t, content: t.content || "The connection dropped. Try again.", error: !t.content }));
      } else {
        patchLast((t) => ({ ...t, content: t.content || "Stopped.", error: !t.content }));
      }
    } finally {
      setBusy(false);
      setStatus(null);
      abort.current = null;
    }
  }

  async function rate(index: number, rating: 1 | -1) {
    const turn = turns[index];
    if (!turn.logId) return;
    const comment = rating === -1 ? window.prompt("What was wrong or missing? (optional)") ?? "" : "";
    setTurns((all) => all.map((t, i) => (i === index ? { ...t, rating } : t)));
    await fetch("/api/ask/rate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: turn.logId, rating, comment }) });
  }

  const starters = STARTERS[context?.kind ?? "market"].map((s) => s.replace("{focus}", context?.focus ?? "the first institution"));

  return (
    <div className={`ask${compact ? " compact" : ""}`}>
      <div className="ask-log" aria-live="polite">
        {turns.length === 0 && (
          <div className="ask-empty">
            <p className="dim">
              {context?.kind === "compare" ? "Ask anything about this comparison. " : context ? `Ask anything about ${context.name}. ` : "Ask about any bank, product or the whole market. "}
              Answers come from the app&apos;s dashboards, news, calendar and call report figures, with links to the source.
            </p>
            <div className="starters">
              {starters.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`msg ${t.role}${t.error ? " error" : ""}`}>
            {t.role === "user" ? <p>{t.content}</p> : (
              <>
                {t.content ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => href?.startsWith("/")
                        ? <Link href={href}>{children}</Link>
                        : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
                      table: ({ children }) => <div className="table-wrap flat"><table>{children}</table></div>,
                    }}
                  >{t.content}</ReactMarkdown>
                ) : <p className="dim">{status ?? "Thinking"}…</p>}
                {busy && i === turns.length - 1 && t.content && status && <p className="dim status">{status}…</p>}
                {t.logId && !busy && (
                  <div className="rate">
                    <button type="button" aria-label="Helpful" aria-pressed={t.rating === 1} onClick={() => rate(i, 1)}>👍</button>
                    <button type="button" aria-label="Not helpful" aria-pressed={t.rating === -1} onClick={() => rate(i, -1)}>👎</button>
                    {t.rating && <span className="dim">Thanks for the feedback.</span>}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <textarea
          value={input} rows={compact ? 2 : 3} maxLength={4000}
          placeholder={context?.kind === "compare" ? "Ask about this comparison…" : context ? `Ask about ${context.name}…` : "Ask a question…"}
          aria-label="Your question"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
        />
        <div className="ask-actions">
          <span className="dim ask-privacy">Questions are saved so admins can improve the app.</span>
          {turns.length > 0 && !busy && <button type="button" className="link" onClick={() => setTurns([])}>New conversation</button>}
          {busy
            ? <button type="button" className="secondary" onClick={() => abort.current?.abort()}>Stop</button>
            : <button type="submit" disabled={!input.trim()}>Ask</button>}
        </div>
      </form>
    </div>
  );
}

// A button that opens the assistant in a side panel, scoped to one bank or product.
export function AskDrawer({ context }: { context: NonNullable<ChatContext> }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <button type="button" className="ask-open" onClick={() => setOpen(true)}>Ask about this {context.kind === "compare" ? "comparison" : context.kind}</button>
      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <aside className="drawer" role="dialog" aria-label={`Ask about ${context.name}`} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <b>{context.kind === "compare" ? "Ask about this comparison" : `Ask about ${context.name}`}</b>
              <button type="button" className="link" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            <AskChat context={context} compact />
          </aside>
        </div>
      )}
    </>
  );
}
