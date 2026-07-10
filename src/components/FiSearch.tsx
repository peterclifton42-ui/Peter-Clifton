"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FiSearchCandidate } from "@/lib/types";

export default function FiSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<FiSearchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (query.trim().length < 2) {
        setCandidates([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/fi/search?q=${encodeURIComponent(query)}`);
        const body = await res.json();
        setCandidates(body.candidates ?? []);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function selectCandidate(candidate: FiSearchCandidate) {
    setSelecting(true);
    try {
      const res = await fetch("/api/fi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidate),
      });
      const body = await res.json();
      if (body.fi?.id) {
        router.push(`/fi/${body.fi.id}`);
      }
    } finally {
      setSelecting(false);
    }
  }

  return (
    <div className="w-full max-w-xl">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a bank, credit union, or lender..."
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        disabled={selecting}
      />
      {loading && (
        <p className="mt-2 text-sm text-zinc-500">Searching FDIC and SEC EDGAR...</p>
      )}
      {candidates.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {candidates.map((c, i) => (
            <li key={`${c.source}-${c.fdic_cert ?? c.sec_cik}-${i}`}>
              <button
                onClick={() => selectCandidate(c)}
                disabled={selecting}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
              >
                <span>
                  <span className="font-medium">{c.name}</span>
                  {c.city && c.state && (
                    <span className="ml-2 text-sm text-zinc-500">
                      {c.city}, {c.state}
                    </span>
                  )}
                </span>
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800">
                  {c.source === "fdic" ? "FDIC" : "SEC"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
