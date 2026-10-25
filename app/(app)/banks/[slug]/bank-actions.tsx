"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestRefresh } from "./actions";

export function RequestRefreshButton({ slug, requested }: { slug: string; requested: { byYou: boolean; at: string } | null }) {
  const [pending, start] = useTransition();
  if (requested) {
    const day = new Date(requested.at).toLocaleDateString("en-US", { day: "numeric", month: "short" });
    return (
      <span className="meta" title="The refresh job runs at 00:07 and 12:07 UTC and takes requested banks first. You'll get an alert when it's live.">
        ⟳ Full refresh requested{requested.byYou ? " by you" : ""} {day} · next run takes it first
      </span>
    );
  }
  return (
    <button type="button" className="ask-open secondary" disabled={pending} onClick={() => start(() => requestRefresh(slug))}
      title="Re-researches the whole dashboard (results, strategy, products, contacts). Puts this bank first in line for the next scheduled refresh at 00:07 or 12:07 UTC; you'll get an alert when it's live.">
      {pending ? "Requesting…" : "Request full refresh"}
    </button>
  );
}

export function RefreshNewsButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; message?: string; error?: boolean }>({ busy: false });

  async function run() {
    setState({ busy: true });
    try {
      const res = await fetch(`/api/news/${slug}`, { method: "POST" });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ error: "Something went wrong." }));
        return setState({ busy: false, message: body.error, error: true });
      }
      // Progress lines while it searches; the last line is the result.
      const text = await res.text();
      const lines = text.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } });
      const body = lines.reverse().find((l) => l?.done);
      if (!body) return setState({ busy: false, message: "The search didn't finish. Try again in a minute.", error: true });
      if (body.error) return setState({ busy: false, message: body.error, error: true });
      setState({
        busy: false,
        message: body.added
          ? `Added ${body.added} new item${body.added === 1 ? "" : "s"}.`
          : body.found ? `Found ${body.found}, but none were new or recent enough.` : "No new news found in the last 30 days.",
      });
      router.refresh();
    } catch {
      setState({ busy: false, message: "The connection dropped. Check All news in a minute; the search may still finish.", error: true });
    }
  }

  return (
    <span className="news-refresh">
      <button type="button" className="link" disabled={state.busy} onClick={run}>
        {state.busy ? "Searching the web (up to a minute)…" : "Refresh news"}
      </button>
      {state.message && <span className={state.error ? "bad" : "dim"}>{state.message}</span>}
    </span>
  );
}
