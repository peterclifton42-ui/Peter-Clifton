"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { requestRefresh } from "./actions";

type NewsState = { busy: boolean; message?: string; error?: boolean };

// Runs an on-demand news search for one institution and reports the outcome.
function useNewsRefresh(slug: string) {
  const router = useRouter();
  const [state, setState] = useState<NewsState>({ busy: false });

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

  return { state, run };
}

export function RefreshNewsButton({ slug }: { slug: string }) {
  const { state, run } = useNewsRefresh(slug);
  return (
    <span className="news-refresh">
      <button type="button" className="link" disabled={state.busy} onClick={run}>
        {state.busy ? "Searching the web (up to a minute)…" : "Refresh news"}
      </button>
      {state.message && <span className={state.error ? "bad" : "dim"}>{state.message}</span>}
    </span>
  );
}

// One "Refresh" menu on the bank page: a quick news search, or a request for the
// whole dashboard to be re-researched by the next scheduled refresh.
export function RefreshMenu({ slug, requested }: { slug: string; requested: { byYou: boolean; at: string } | null }) {
  const news = useNewsRefresh(slug);
  const [pending, start] = useTransition();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false;
    };
    // A click inside the dashboard frame never reaches this page, but it does take focus from it.
    const blur = () => { if (menu.current) menu.current.open = false; };
    document.addEventListener("click", close, true);
    window.addEventListener("blur", blur);
    return () => { document.removeEventListener("click", close, true); window.removeEventListener("blur", blur); };
  }, []);
  const done = () => { if (menu.current) menu.current.open = false; };
  const requestedOn = requested && new Date(requested.at).toLocaleDateString("en-US", { day: "numeric", month: "short" });

  return (
    <span className="refresh-menu-wrap">
      {news.state.busy && <span className="dim">Searching for news (up to a minute)…</span>}
      {!news.state.busy && news.state.message && <span className={news.state.error ? "bad" : "dim"}>{news.state.message}</span>}
      <details className="menu" ref={menu}>
        <summary className="tool-btn">⟳ Refresh</summary>
        <div className="menu-list" role="menu">
          <button type="button" role="menuitem" disabled={news.state.busy} onClick={() => { done(); news.run(); }}>
            <b>Refresh news</b>
            <span>Searches the web for the last 30 days. About a minute.</span>
          </button>
          {requested ? (
            <div className="menu-note">
              <b>Full refresh requested{requested.byYou ? " by you" : ""} {requestedOn}</b>
              <span>The next scheduled run (00:07 or 12:07 UTC) takes it first. You&apos;ll get an alert when it&apos;s live.</span>
            </div>
          ) : (
            <button type="button" role="menuitem" disabled={pending} onClick={() => start(async () => { await requestRefresh(slug); done(); })}>
              <b>{pending ? "Requesting…" : "Request full refresh"}</b>
              <span>Re-researches the whole dashboard at the next scheduled run (00:07 or 12:07 UTC).</span>
            </button>
          )}
        </div>
      </details>
    </span>
  );
}
