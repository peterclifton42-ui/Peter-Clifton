import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderDashboard } from "@/lib/dashboard";
import { peerSuggestions } from "@/lib/peers";
import { createClient } from "@/lib/supabase/server";
import { withCollectedNews } from "@/lib/news/merge";
import { BankBar, loadInstitution } from "../bank-bar";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; at?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const institution = await loadInstitution(slug);
  return { title: institution ? `${institution.name} · Full report` : "Not found" };
}

// The full research dashboard. ?tab= and ?at= open it on a tab and section (the
// Summary page links in this way).
export default async function BankReportPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tab, at } = await searchParams;
  const institution = await loadInstitution(slug);
  if (!institution?.current_snapshot_id) notFound();

  const supabase = await createClient();
  const [{ data: snapshot }, { data: collected }, peers] = await Promise.all([
    supabase.from("snapshots").select("data, loaded_at").eq("id", institution.current_snapshot_id).single(),
    supabase.from("news_items").select("published_on, headline, summary, source_name, url, tag, sales_angle, created_at")
      .eq("slug", slug).order("published_on", { ascending: false }).limit(30),
    peerSuggestions(supabase),
  ]);
  if (!snapshot) notFound();
  const compareHref = `/compare?ids=${[slug, ...(peers[slug]?.suggestions ?? []).map((p) => p.slug)].join(",")}&a=${slug}`;
  const html = await renderDashboard(withCollectedNews(snapshot.data, collected ?? [], snapshot.loaded_at), {
    open: tab ? { tab, at } : null, compareHref,
  });

  return (
    <div className="bank-page">
      <BankBar institution={institution} researchedAt={snapshot.loaded_at} view="report" />
      {/* The dashboard runs in a sandbox with no access to this page or the login session. */}
      <iframe
        className="dashboard-frame"
        title={`${institution.name} dashboard`}
        srcDoc={html}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}
