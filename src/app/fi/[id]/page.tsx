import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase";
import FiActions from "@/components/FiActions";
import type {
  FiFinancials,
  FinancialInstitution,
  FiNewsItem,
  FiProductMatch,
} from "@/lib/types";

const METRIC_LABELS: Record<string, string> = {
  total_assets: "Total assets",
  total_assets_thousands: "Total assets ($k)",
  total_liabilities: "Total liabilities",
  stockholders_equity: "Stockholders' equity",
  net_income: "Net income",
  net_income_thousands: "Net income ($k)",
  deposits: "Deposits",
  revenues: "Revenues",
  total_deposits_thousands: "Total deposits ($k)",
  roa_pct: "ROA (%)",
  roe_pct: "ROE (%)",
  efficiency_ratio_pct: "Efficiency ratio (%)",
  net_interest_margin_pct: "Net interest margin (%)",
  deposit_growth_yoy_pct: "Deposit growth YoY (%)",
  asset_growth_yoy_pct: "Asset growth YoY (%)",
};

function formatMetricValue(value: number | string | null): string {
  if (value === null) return "—";
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value;
}

export default async function FiDashboardPage({
  params,
}: PageProps<"/fi/[id]">) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: fi } = await supabase
    .from("financial_institutions")
    .select("*")
    .eq("id", id)
    .single<FinancialInstitution>();

  if (!fi) notFound();

  const [{ data: financials }, { data: news }, { data: matches }] = await Promise.all([
    supabase
      .from("fi_financials")
      .select("*")
      .eq("fi_id", id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle<FiFinancials>(),
    supabase
      .from("fi_news")
      .select("*")
      .eq("fi_id", id)
      .order("published_at", { ascending: false })
      .limit(10)
      .returns<FiNewsItem[]>(),
    supabase
      .from("fi_product_matches")
      .select("*, product:products(*)")
      .eq("fi_id", id)
      .order("score", { ascending: false })
      .returns<FiProductMatch[]>(),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        &larr; Search another institution
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{fi.name}</h1>
          <p className="text-sm text-zinc-500">
            {fi.fi_type.replace(/_/g, " ")}
            {fi.city && fi.state ? ` · ${fi.city}, ${fi.state}` : ""}
          </p>
        </div>
        <FiActions fiId={fi.id} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Financial snapshot</h2>
        {financials ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(financials.metrics)
              .filter(([, v]) => v !== null)
              .map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    {METRIC_LABELS[key] ?? key}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatMetricValue(value)}
                  </p>
                </div>
              ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">
            No financial data yet. Click &ldquo;Refresh financials &amp; news&rdquo; to fetch it.
          </p>
        )}
        {financials?.as_of_date && (
          <p className="mt-2 text-xs text-zinc-400">
            As of {financials.as_of_date} &middot; source: {financials.source}
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Recent news</h2>
        {news && news.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {news.map((n) => (
              <li key={n.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  {n.title}
                </a>
                <p className="mt-1 text-xs text-zinc-500">
                  {n.source ?? "Unknown source"}
                  {n.published_at ? ` · ${new Date(n.published_at).toLocaleDateString()}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No news fetched yet.</p>
        )}
      </section>

      <section className="mt-10 mb-16">
        <h2 className="text-lg font-semibold">Recommended Curinos products</h2>
        {matches && matches.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {matches.map((m) => (
              <li key={m.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{m.product?.name ?? "Unknown product"}</p>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {m.product?.category.replace(/_/g, " ")}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-900 px-3 py-1 text-sm font-semibold text-white dark:bg-white dark:text-black">
                    {m.score}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{m.rationale}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">
            No analysis yet. Refresh data, then click &ldquo;Analyze product fit&rdquo;.
          </p>
        )}
      </section>
    </div>
  );
}
