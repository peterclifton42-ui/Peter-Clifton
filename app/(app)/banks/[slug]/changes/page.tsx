import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { compareDashboards } from "@/lib/changes";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "What changed" };

const PRIORITY = (p: number | null) => (p ? `P${p}` : "Not recommended");

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ChangesPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const [{ data: institution }, { data: versions }] = await Promise.all([
    supabase.from("institutions").select("name").eq("slug", slug).maybeSingle(),
    supabase.from("snapshots").select("id, data, loaded_at, source").eq("slug", slug)
      .order("loaded_at", { ascending: false }).limit(2),
  ]);
  if (!institution || !versions?.length) notFound();

  const [current, previous] = versions;
  const back = <Link href={`/banks/${slug}`}>← Back to {institution.name}</Link>;

  if (!previous) {
    return (
      <main className="page">
        <p>{back}</p>
        <div className="panel">
          <h2>What changed at {institution.name}</h2>
          <p>
            There is only one version of this dashboard so far (researched {day(current.loaded_at)}). Once it is refreshed
            with new results, this page shows what moved between the two.
          </p>
        </div>
      </main>
    );
  }

  const c = compareDashboards(previous.data, current.data);
  const moved = c.metrics.filter((m) => m.before !== m.after);

  return (
    <main className="page">
      <p>{back}</p>
      <div className="page-head">
        <div>
          <h1>What changed at {institution.name}</h1>
          <p>
            {c.quarterBefore ?? "Previous"} dashboard (researched {day(previous.loaded_at)}) compared with{" "}
            {c.quarterAfter ?? "the current"} dashboard (researched {day(current.loaded_at)}).
          </p>
        </div>
      </div>

      {(c.opportunity || c.health || c.theme) && (
        <section className="panel">
          <h2>The big picture</h2>
          <dl className="changes">
            {c.opportunity && <><dt>Opportunity</dt><dd><s>{c.opportunity.before ?? "–"}</s> → <strong>{c.opportunity.after ?? "–"}</strong></dd></>}
            {c.health && <><dt>Health rating</dt><dd><s>{c.health.before ?? "–"}</s> → <strong>{c.health.after ?? "–"}</strong></dd></>}
            {c.theme && <><dt>Sales theme</dt><dd><s>{c.theme.before ?? "–"}</s><br /><strong>{c.theme.after ?? "–"}</strong></dd></>}
          </dl>
        </section>
      )}

      <section className="panel">
        <h2>Headline metrics ({moved.length} moved)</h2>
        <div className="table-wrap flat">
          <table className="compare">
            <thead><tr><th>Metric</th><th>Before</th><th>Now</th><th>As of</th></tr></thead>
            <tbody>
              {c.metrics.map((m) => (
                <tr key={m.label} className={m.before === m.after ? "same" : undefined}>
                  <td>{m.label}</td><td>{m.before ?? "–"}</td><td><strong>{m.after ?? "–"}</strong></td><td className="dim">{m.asOf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Product recommendations ({c.products.length} changed)</h2>
        {c.products.length === 0 ? <p>Same products at the same priorities.</p> : (
          <div className="table-wrap flat">
            <table className="compare">
              <thead><tr><th>Product</th><th>Before</th><th>Now</th><th className="num">Fit</th></tr></thead>
              <tbody>
                {c.products.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td>{PRIORITY(p.before)}</td>
                    <td><strong>{PRIORITY(p.after)}</strong></td>
                    <td className="num">{p.fitBefore ?? "–"} → {p.fitAfter ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>New in the news ({c.newNews.length})</h2>
        {c.newNews.length === 0 ? <p>No new news items.</p> : (
          <ul className="event-list">
            {c.newNews.map((n) => (
              <li key={n.title}>
                <span className="when">{n.date ?? ""}</span>
                {n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a> : n.title}
                {n.source && <span className="dim">{n.source}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
