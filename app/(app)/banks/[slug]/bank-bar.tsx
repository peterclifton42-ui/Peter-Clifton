import Link from "next/link";
import { cache } from "react";
import { requireViewer } from "@/lib/auth";
import { EVENT_COLUMNS, formatDay, latestAndNext, needsRefresh, todayISO, type EarningsEvent } from "@/lib/earnings";
import { categoryLabel, formatAssets, shortQuarter, INSTITUTION_COLUMNS, type Institution } from "@/lib/institutions";
import { peerSuggestions } from "@/lib/peers";
import { createClient } from "@/lib/supabase/server";
import { AskDrawer } from "../../ask/ask-chat";
import { AccountToggle, FollowButton } from "../../follow-button";
import { RefreshMenu } from "./bank-actions";

export type BankInstitution = Institution & { current_snapshot_id: number | null };

// One institution, shared by the bank page, its Whitespace view and their titles.
export const loadInstitution = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("institutions").select(`${INSTITUTION_COLUMNS}, current_snapshot_id`)
    .eq("slug", slug).maybeSingle();
  return data as BankInstitution | null;
});

// The toolbar above every view of an institution: Dashboard | Whitespace, the
// research status, links and actions.
export async function BankBar({ institution, researchedAt, view }: {
  institution: BankInstitution; researchedAt: string; view: "dashboard" | "whitespace";
}) {
  const slug = institution.slug;
  const viewer = await requireViewer();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: events }, { data: fav }, { count: versions }, peerMap, { count: newsTotal }, { data: requests }] = await Promise.all([
    supabase.from("earnings_events").select(EVENT_COLUMNS).eq("slug", slug),
    supabase.from("favourites").select("my_account").eq("user_id", viewer.id).eq("slug", slug).maybeSingle(),
    supabase.from("snapshots").select("id", { count: "exact", head: true }).eq("slug", slug),
    peerSuggestions(supabase),
    supabase.from("news_items").select("id", { count: "exact", head: true }).eq("slug", slug),
    supabase.from("refresh_requests").select("requested_by, requested_at").eq("slug", slug).is("fulfilled_at", null)
      .order("requested_at").limit(1),
  ]);
  const request = requests?.[0] ? { byYou: requests[0].requested_by === viewer.id, at: requests[0].requested_at as string } : null;
  const { latest, next } = latestAndNext((events ?? []) as EarningsEvent[], today).get(slug) ?? {};
  const outOfDate = latest && needsRefresh(latest, researchedAt);

  return (
    <div className="bank-bar">
      <Link href="/banks" className="back">← Banks</Link>
      <nav className="view-switch" aria-label="View">
        <Link href={`/banks/${slug}`} className={view === "dashboard" ? "active" : ""} aria-current={view === "dashboard" ? "page" : undefined}>Dashboard</Link>
        <Link href={`/banks/${slug}/whitespace`} className={view === "whitespace" ? "active" : ""} aria-current={view === "whitespace" ? "page" : undefined}>Whitespace</Link>
      </nav>
      <span className="meta">
        {categoryLabel(institution.category)} · {formatAssets(institution.assets_b)} · data to{" "}
        {shortQuarter(institution.latest_quarter)} · researched{" "}
        {new Date(researchedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
      </span>
      {outOfDate ? (
        <span className="badge medium" title="The latest results are out but this dashboard was researched before them.">
          {latest.period} results out {formatDay(latest.event_date)} · not in dashboard yet
        </span>
      ) : next ? (
        <span className="meta">Next results {formatDay(next.event_date)}{next.status === "estimated" ? " (est.)" : ""}</span>
      ) : null}
      <span className="bank-tools">
        {(versions ?? 0) > 1 && <Link href={`/banks/${slug}/changes`}>What changed</Link>}
        <Link href={`/compare?ids=${[slug, ...(peerMap[slug]?.suggestions ?? []).map((p) => p.slug)].join(",")}&a=${slug}`}>Compare peers</Link>
        {(newsTotal ?? 0) > 0 && <Link href={`/banks/${slug}/news`}>News history ({newsTotal})</Link>}
        <RefreshMenu slug={slug} requested={request} />
        <FollowButton slug={slug} name={institution.name} following={Boolean(fav)} />
        {fav && <AccountToggle slug={slug} mine={fav.my_account} />}
        <AskDrawer context={{ kind: "bank", slug, name: institution.name }} />
      </span>
    </div>
  );
}
