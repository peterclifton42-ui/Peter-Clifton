import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderDashboard } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { withCollectedNews } from "@/lib/news/merge";
import { BankBar, loadInstitution } from "./bank-bar";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const institution = await loadInstitution(slug);
  return { title: institution?.name ?? "Not found" };
}

export default async function BankPage({ params }: Props) {
  const { slug } = await params;
  const institution = await loadInstitution(slug);
  if (!institution?.current_snapshot_id) notFound();

  const supabase = await createClient();
  const [{ data: snapshot }, { data: collected }] = await Promise.all([
    supabase.from("snapshots").select("data, loaded_at").eq("id", institution.current_snapshot_id).single(),
    supabase.from("news_items").select("published_on, headline, summary, source_name, url, tag, sales_angle, created_at")
      .eq("slug", slug).order("published_on", { ascending: false }).limit(30),
  ]);
  if (!snapshot) notFound();
  const html = await renderDashboard(withCollectedNews(snapshot.data, collected ?? [], snapshot.loaded_at));

  return (
    <div className="bank-page">
      <BankBar institution={institution} researchedAt={snapshot.loaded_at} view="dashboard" />
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
