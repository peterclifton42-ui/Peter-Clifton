import type { Metadata } from "next";
import Link from "next/link";
import { DAY_OPTIONS, RATING_OPTIONS, loadQuestions, topCounts, type QuestionFilters } from "@/lib/ask/questions";
import { requireAdmin } from "@/lib/auth";
import { THEMES } from "@/lib/insights";
import { productBySlug } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Questions" };

const TOPIC = new Map(THEMES.map((t) => [t.key, t.label]));
const PAGE = 50;

// Every question asked in Ask, with what the assistant answered, so admins can
// see what sellers look for and where the app falls short.
export default async function QuestionsPage({ searchParams }: { searchParams: Promise<QuestionFilters & { page?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const { rows, people, institutions } = await loadQuestions(await createClient(), f);
  const page = Math.max(1, Number(f.page) || 1);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const asked = new Set(rows.map((r) => r.user_id)).size;
  const weak = rows.filter((r) => r.shortfall);
  const gaps = rows.filter((r) => r.shortfall === "data gap").length;
  const errors = rows.filter((r) => r.shortfall === "error").length;
  const banks = topCounts(rows.map((r) => r.banks));
  const products = topCounts(rows.map((r) => r.products));
  const topics = topCounts(rows.map((r) => r.topics));
  const cost = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const query = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ q: f.q, user: f.user, bank: f.bank, rating: f.rating, days: f.days, ...extra })
      .forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  };
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="crumb"><Link href="/admin">← Admin</Link></p>
          <h1>Questions</h1>
          <p>Everything sellers have asked the assistant, and how well it answered.</p>
        </div>
        <a className="button secondary" href={`/admin/questions/export?${query({})}`}>Download CSV</a>
      </div>

      <form className="panel filters" method="get">
        <input name="q" defaultValue={f.q} placeholder="Search questions and answers" aria-label="Search" />
        <select name="user" defaultValue={f.user ?? ""} aria-label="Person">
          <option value="">Everyone</option>
          {[...people].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select name="bank" defaultValue={f.bank ?? ""} aria-label="Bank">
          <option value="">Any bank</option>
          {[...institutions].sort((a, b) => a[1].localeCompare(b[1])).map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
        </select>
        <select name="rating" defaultValue={f.rating ?? ""} aria-label="Rating">
          {RATING_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="days" defaultValue={f.days ?? "30"} aria-label="Period">
          {DAY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="submit">Filter</button>
        {(f.q || f.user || f.bank || f.rating || f.days) && <Link href="/admin/questions">Clear</Link>}
      </form>

      <div className="panel">
        <h2>What sellers are asking</h2>
        <div className="stat-row">
          <div className="stat"><b>{rows.length}</b><span>questions</span></div>
          <div className="stat"><b>{asked}</b><span>{asked === 1 ? "person" : "people"}</span></div>
          <div className="stat"><b>{weak.length}</b><span>not answered well ({gaps} data {gaps === 1 ? "gap" : "gaps"}, {errors} {errors === 1 ? "error" : "errors"})</span></div>
          <div className="stat"><b>${cost.toFixed(2)}</b><span>API cost</span></div>
        </div>
        <div className="three-col">
          <div>
            <h3>Banks</h3>
            {banks.length === 0 ? <p className="dim">None named yet.</p> : (
              <ol className="tally">{banks.map(([slug, n]) => (
                <li key={slug}><Link href={`/admin/questions?${query({ bank: slug, page: undefined })}`}>{institutions.get(slug) ?? slug}</Link><span>{n}</span></li>
              ))}</ol>
            )}
          </div>
          <div>
            <h3>Topics</h3>
            {topics.length === 0 ? <p className="dim">No common topics yet.</p> : (
              <ol className="tally">{topics.map(([key, n]) => <li key={key}>{TOPIC.get(key) ?? key}<span>{n}</span></li>)}</ol>
            )}
          </div>
          <div>
            <h3>Products</h3>
            {products.length === 0 ? <p className="dim">None named yet.</p> : (
              <ol className="tally">{products.map(([slug, n]) => (
                <li key={slug}><Link href={`/products/${slug}`}>{productBySlug(slug)?.name ?? slug}</Link><span>{n}</span></li>
              ))}</ol>
            )}
          </div>
        </div>
        {weak.length > 0 && (
          <p className="dim" style={{ marginTop: 12 }}>
            &ldquo;Not answered well&rdquo; means a 👎, an error, or a data gap (the answer says the app doesn&apos;t hold something). Data
            gaps are the clearest signs of what to add. <Link href={`/admin/questions?${query({ rating: "weak", page: undefined })}`}>Show only these →</Link>
          </p>
        )}
      </div>

      <div className="panel">
        <h2>{rows.length === 0 ? "No questions match" : `Questions ${(page - 1) * PAGE + 1}–${(page - 1) * PAGE + shown.length} of ${rows.length}`}</h2>
        {shown.map((r) => (
          <details key={r.id} className="qa">
            <summary>
              <span className="qa-q">{r.question}</span>
              <span className="qa-meta">
                {people.get(r.user_id) ?? "Unknown"} · {when(r.created_at)}
                {r.context && <> · asked on {r.context.startsWith("bank:") ? institutions.get(r.context.slice(5)) ?? r.context.slice(5) : productBySlug(r.context.slice(8))?.name ?? r.context.slice(8)}</>}
                {r.rating === 1 && " · 👍"}{r.rating === -1 && " · 👎"}
                {r.shortfall && r.shortfall !== "thumbs down" && <span className="badge medium">{r.shortfall}</span>}
              </span>
            </summary>
            {r.comment && <p className="qa-comment">Seller&apos;s comment: &ldquo;{r.comment}&rdquo;</p>}
            <div className="qa-answer">{r.answer || r.error || "No answer saved."}</div>
            <p className="dim">
              {r.tools_used?.length ? `Looked up: ${[...new Set(r.tools_used)].join(", ")}` : "No lookups"}
              {r.cost_usd != null && ` · $${Number(r.cost_usd).toFixed(3)}`}
            </p>
          </details>
        ))}
        {rows.length > PAGE && (
          <div className="pager">
            {page > 1 && <Link href={`/admin/questions?${query({ page: String(page - 1) })}`}>← Newer</Link>}
            {page * PAGE < rows.length && <Link href={`/admin/questions?${query({ page: String(page + 1) })}`}>Older →</Link>}
          </div>
        )}
      </div>
    </main>
  );
}
