import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { THEMES } from "../insights";
import { PRODUCTS } from "../products";

// What sellers ask the assistant: the saved questions (ask_log), filtered for the
// admin Questions page and its CSV download, plus counts of the banks, products
// and topics they mention.

export type QuestionFilters = { q?: string; user?: string; bank?: string; rating?: string; days?: string };

export type QuestionRow = {
  id: number; user_id: string; context: string | null; question: string; answer: string | null;
  tools_used: string[] | null; cost_usd: number | null; status: string; error: string | null;
  rating: number | null; comment: string | null; created_at: string;
};

export const DAY_OPTIONS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["all", "All time"]] as const;
export const RATING_OPTIONS = [["", "Any rating"], ["up", "👍"], ["down", "👎"], ["weak", "Not answered well"]] as const;

// An answer that says the app doesn't hold what was asked.
const NO_DATA = /(doesn['’]t|does not|don['’]t) (hold|have|include|contain)|not (in|held in) the app|no (data|information|record)s? (on|about|for)|isn['’]t (in|available)|couldn['’]t find|not available in the app/i;

// Why an answer fell short, or null if it didn't: an error or refusal, a 👎, or
// the assistant saying the app doesn't hold what was asked (a data gap).
export function shortfall(r: Pick<QuestionRow, "status" | "rating" | "answer">): "error" | "thumbs down" | "data gap" | null {
  if (r.status !== "ok") return "error";
  if (r.rating === -1) return "thumbs down";
  return NO_DATA.test(r.answer ?? "") ? "data gap" : null;
}

// "Truist Financial Corporation" -> "Truist"; "Old National Bancorp" -> "Old National".
const SUFFIX = /\b(the|corporation|corp|incorporated|inc|company|co|bancorp(oration)?|bancshares|banc|financial|holdings?|group|federal credit union|credit union|fcu|bank|n\.?a\.?)\b\.?/gi;
function shortName(name: string) {
  const short = name.replace(SUFFIX, " ").replace(/[,.&]+/g, " ").replace(/\s+/g, " ").trim();
  return short.length >= 4 ? short : name;
}

type Institution = { slug: string; name: string; ticker: string | null };

const GENERIC = new Set(["first", "united", "national", "american", "citizens", "community", "western", "eastern", "southern",
  "northern", "pacific", "central", "peoples", "people's", "home", "old", "new", "state", "security", "capital"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Ways a seller might name each institution: its short name, its first word when
// that is distinctive ("valley" for Valley National), and its ticker.
function nameMatchers(institutions: Institution[]) {
  const firstWords = new Map<string, number>();
  const shorts = institutions.map((i) => shortName(i.name).toLowerCase());
  shorts.forEach((n) => { const w = n.split(" ")[0]; firstWords.set(w, (firstWords.get(w) ?? 0) + 1); });
  return institutions.map((i, k) => {
    const words = [shorts[k]];
    const first = shorts[k].split(" ")[0];
    if (first !== shorts[k] && first.length >= 4 && !GENERIC.has(first) && firstWords.get(first) === 1) words.push(first);
    const names = new RegExp(`\\b(${words.map(escape).join("|")})\\b`, "i");
    const ticker = i.ticker && /^[A-Z]{3,5}$/.test(i.ticker) ? new RegExp(`\\b${i.ticker}\\b`) : null;
    return { slug: i.slug, test: (q: string) => names.test(q) || Boolean(ticker?.test(q)) };
  });
}

// The institutions a question is about: the page it was asked from, plus any
// named in its text.
export function banksIn(r: Pick<QuestionRow, "context" | "question">, matchers: ReturnType<typeof nameMatchers>) {
  const found = new Set<string>();
  if (r.context?.startsWith("bank:")) found.add(r.context.slice(5));
  if (r.context?.startsWith("compare:")) for (const s of r.context.slice(8).split(",")) found.add(s);
  for (const m of matchers) if (m.test(r.question)) found.add(m.slug);
  return [...found];
}

export function productsIn(r: Pick<QuestionRow, "context" | "question">) {
  const found = new Set<string>();
  if (r.context?.startsWith("product:")) found.add(r.context.slice(8));
  const text = r.question.toLowerCase();
  for (const p of PRODUCTS) if (text.includes(p.name.toLowerCase())) found.add(p.slug);
  return [...found];
}

export function topicsIn(question: string) {
  return THEMES.filter((t) => t.pattern.test(question)).map((t) => t.key);
}

export async function loadQuestions(db: SupabaseClient, f: QuestionFilters) {
  const [{ data: institutions }, { data: people }] = await Promise.all([
    db.from("institutions").select("slug, name, ticker"),
    db.from("profiles").select("id, email, full_name"),
  ]);
  let query = db.from("ask_log")
    .select("id, user_id, context, question, answer, tools_used, cost_usd, status, error, rating, comment, created_at")
    .order("created_at", { ascending: false }).limit(2000);
  const days = f.days === "all" ? null : Number(f.days) || 30;
  if (days) query = query.gte("created_at", new Date(Date.now() - days * 86400 * 1000).toISOString());
  if (f.user) query = query.eq("user_id", f.user);
  if (f.rating === "up") query = query.eq("rating", 1);
  if (f.rating === "down") query = query.eq("rating", -1);
  const { data } = await query;

  const inst = (institutions ?? []) as Institution[];
  const matchers = nameMatchers(inst);
  const words = f.q?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const rows = ((data ?? []) as QuestionRow[]).map((r) => ({
    ...r, banks: banksIn(r, matchers), products: productsIn(r), topics: topicsIn(r.question), shortfall: shortfall(r),
  })).filter((r) =>
    (!f.bank || r.banks.includes(f.bank))
    && (f.rating !== "weak" || r.shortfall)
    && words.every((w) => `${r.question} ${r.answer ?? ""} ${r.comment ?? ""}`.toLowerCase().includes(w)));

  return {
    rows,
    people: new Map((people ?? []).map((p) => [p.id as string, (p.full_name || p.email) as string])),
    institutions: new Map(inst.map((i) => [i.slug, i.name])),
  };
}

export function topCounts(lists: string[][], n = 8) {
  const counts = new Map<string, number>();
  lists.flat().forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
