import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { formatDay } from "@/lib/earnings";
import { createClient } from "@/lib/supabase/server";
import { RefreshNewsButton } from "../bank-actions";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "News history" };

// Every news item ever collected for one institution, newest first, by month.
export default async function NewsHistoryPage({ params }: Props) {
  const { slug } = await params;
  await requireViewer();
  const supabase = await createClient();
  const [{ data: inst }, { data: items }, { data: runs }] = await Promise.all([
    supabase.from("institutions").select("name").eq("slug", slug).maybeSingle(),
    supabase.from("news_items").select("id, published_on, headline, summary, source_name, url, created_at")
      .eq("slug", slug).order("published_on", { ascending: false }),
    supabase.from("news_refreshes").select("started_at, status, items_added").eq("slug", slug)
      .order("started_at", { ascending: false }).limit(1),
  ]);
  if (!inst) notFound();

  const months = new Map<string, NonNullable<typeof items>>();
  for (const n of items ?? []) {
    const key = new Date(`${n.published_on}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    months.set(key, [...(months.get(key) ?? []), n]);
  }
  const last = runs?.[0];

  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <p className="crumb"><Link href={`/banks/${slug}`}>{inst.name}</Link> · News</p>
          <h1>News history</h1>
          <p>
            {items?.length ?? 0} item{items?.length === 1 ? "" : "s"} collected by the weekly news job and on-demand refreshes. The Ask assistant
            can search this history.{last && <> Last refreshed {new Date(last.started_at).toLocaleDateString("en-US", { day: "numeric", month: "short" })}.</>}
          </p>
        </div>
        <RefreshNewsButton slug={slug} />
      </div>
      {months.size === 0 ? <div className="panel"><p className="dim">No news collected yet. Use “Refresh news” to search now.</p></div> : (
        [...months.entries()].map(([month, list]) => (
          <section key={month} className="panel">
            <h2>{month}</h2>
            <ul className="news-list">
              {list.map((n) => (
                <li key={n.id}>
                  <span className="dim">{formatDay(n.published_on)}{n.source_name ? ` · ${n.source_name}` : ""}</span>
                  {n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer"><b>{n.headline}</b></a> : <b>{n.headline}</b>}
                  {n.summary && <p>{n.summary}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
