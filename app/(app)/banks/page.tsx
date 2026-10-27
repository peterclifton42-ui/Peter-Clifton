import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { EVENT_COLUMNS, latestAndNext, todayISO, type EarningsEvent } from "@/lib/earnings";
import { followedSlugs } from "@/lib/follows";
import { INSTITUTION_COLUMNS, type Institution } from "@/lib/institutions";
import { createClient } from "@/lib/supabase/server";
import { Directory, type EarningsCell } from "./directory";

export const metadata: Metadata = { title: "Banks" };

export default async function DirectoryPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [{ data, error }, { data: events }, followed, { count: queued }] = await Promise.all([
    supabase.from("institutions").select(INSTITUTION_COLUMNS).order("assets_b", { ascending: false }),
    supabase.from("earnings_events").select(EVENT_COLUMNS),
    followedSlugs(viewer.id),
    supabase.from("institution_requests").select("id", { count: "exact", head: true }).in("status", ["queued", "building"]),
  ]);

  const today = todayISO();
  const earnings: Record<string, EarningsCell> = {};
  for (const [slug, { latest, next }] of latestAndNext((events ?? []) as EarningsEvent[], today)) {
    earnings[slug] = {
      next: next ? { date: next.event_date, estimated: next.status === "estimated", period: next.period } : null,
      reported: latest?.status === "reported" ? { date: latest.event_date, period: latest.period } : null,
    };
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Banks and credit unions</h1>
          <p>Search or filter, then open an institution to see its full dashboard. Tap ☆ to follow it.</p>
        </div>
        <div className="head-actions">
          <Link href="/banks/request" className="button secondary head-link">+ Request a new bank or credit union</Link>
          {(queued ?? 0) > 0 && <Link href="/banks/request" className="dim">{queued} in the queue</Link>}
        </div>
      </div>
      {error ? (
        <div className="notice error">Couldn&apos;t load the directory: {error.message}</div>
      ) : (
        <Directory
          institutions={(data ?? []) as Institution[]}
          followed={[...followed]}
          earnings={earnings}
        />
      )}
    </main>
  );
}
