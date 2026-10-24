import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { renderDashboard } from "@/lib/dashboard";
import { categoryLabel, formatAssets, shortQuarter, INSTITUTION_COLUMNS, type Institution } from "@/lib/institutions";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ slug: string }> };

async function loadInstitution(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("institutions")
    .select(`${INSTITUTION_COLUMNS}, current_snapshot_id`)
    .eq("slug", slug)
    .maybeSingle();
  return data as (Institution & { current_snapshot_id: number | null }) | null;
}

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
  const { data: snapshot } = await supabase
    .from("snapshots")
    .select("data, loaded_at")
    .eq("id", institution.current_snapshot_id)
    .single();
  if (!snapshot) notFound();

  const html = await renderDashboard(snapshot.data);

  return (
    <>
      <div className="bank-bar">
        <Link href="/">← All banks</Link>
        <span className="meta">
          {categoryLabel(institution.category)} · {formatAssets(institution.assets_b)} assets · data to{" "}
          {shortQuarter(institution.latest_quarter)} · researched{" "}
          {new Date(snapshot.loaded_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>
      {/* The dashboard runs in a sandbox with no access to this page or the login session. */}
      <iframe
        className="dashboard-frame"
        title={`${institution.name} dashboard`}
        srcDoc={html}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      />
    </>
  );
}
