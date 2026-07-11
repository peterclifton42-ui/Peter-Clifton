"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FiActions({ fiId }: { fiId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ingest" | "match" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshData() {
    setBusy("ingest");
    setError(null);
    try {
      const res = await fetch(`/api/fi/${fiId}/ingest`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to refresh data");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function analyze() {
    setBusy("match");
    setError(null);
    try {
      const res = await fetch(`/api/fi/${fiId}/match`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to analyze");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        <button
          onClick={refreshData}
          disabled={busy !== null}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {busy === "ingest" ? "Refreshing..." : "Refresh financials & news"}
        </button>
        <button
          onClick={analyze}
          disabled={busy !== null}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {busy === "match" ? "Analyzing..." : "Analyze product fit"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
