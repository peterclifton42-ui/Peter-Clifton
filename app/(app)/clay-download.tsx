"use client";

import { useState } from "react";

// Downloads a Clay CSV without leaving the page. Following a link to the file
// opens it in place of the app on phones and in-app browsers, with no way back;
// instead the file is fetched here and handed to the share sheet (phones) or
// saved as a download (desktop). Errors show next to the button.
export function ClayDownload({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function download(e: React.MouseEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null;
        setNote(j?.error ?? "The download didn't work. Try again.");
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Clay export.csv";
      const blob = await res.blob();
      const file = new File([blob], name, { type: "text/csv" });
      const touch = window.matchMedia("(pointer: coarse)").matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); } catch { /* closed the sheet */ }
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote("Downloaded.");
      setTimeout(() => setNote(null), 3000);
    } catch {
      setNote("The connection dropped. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <a href={href} onClick={download} className={className} aria-busy={busy}>{busy ? "Preparing…" : children}</a>
      {note && <span className="clay-note" role="status">{note}</span>}
    </>
  );
}
