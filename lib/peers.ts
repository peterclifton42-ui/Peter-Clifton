import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Peer suggestions for Compare and the bank page. An institution's own disclosed
// peer group (proxy / 10-K, in peer_groups) comes first; the rest are ranked by
// similarity on official figures: size 40%, region 20%, business model and
// balance sheet 40%. Only covered institutions can be suggested, because
// Compare needs their call-report figures.

export type Suggestion = { slug: string; reasons: string[]; official: boolean };
export type PeerMap = Record<string, { suggestions: Suggestion[]; officialSource: string | null }>;

type Inst = { slug: string; name: string; category: string; assets_b: number | null; hq: string | null; type_label: string | null };
type Latest = { slug: string; ldr: number | null; deposit_cost: number | null; nim: number | null };

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const CODES = new Set(Object.values(STATES).concat("DC"));
// US Census divisions (nearby) and regions (same part of the country).
const DIVISION: Record<string, string> = {};
const REGION: Record<string, string> = {};
for (const [div, region, states] of [
  ["New England", "Northeast", "CT ME MA NH RI VT"], ["Mid-Atlantic", "Northeast", "NJ NY PA"],
  ["East North Central", "Midwest", "IL IN MI OH WI"], ["West North Central", "Midwest", "IA KS MN MO NE ND SD"],
  ["South Atlantic", "South", "DE DC FL GA MD NC SC VA WV"], ["East South Central", "South", "AL KY MS TN"],
  ["West South Central", "South", "AR LA OK TX"], ["Mountain", "West", "AZ CO ID MT NV NM UT WY"], ["Pacific", "West", "AK CA HI OR WA"],
] as const) for (const s of states.split(" ")) { DIVISION[s] = div; REGION[s] = region; }

// The state in an HQ string like "Tacoma, WA", "Winter Haven, FL 33880" or "Montana (city not confirmed)".
export function stateOf(hq: string | null) {
  if (!hq) return null;
  const code = hq.match(/,\s*([A-Z]{2})\b/)?.[1] ?? hq.match(/\b([A-Z]{2})\s+\d{5}\b/)?.[1];
  if (code && CODES.has(code)) return code;
  const lower = hq.toLowerCase();
  const name = Object.keys(STATES).sort((a, b) => b.length - a.length).find((n) => lower.includes(n));
  return name ? STATES[name] : null;
}

// Business model from the directory's type label.
function model(i: Inst) {
  const t = `${i.type_label ?? ""} ${i.name}`.toLowerCase();
  if (i.category === "credit_union") return "credit union";
  if (/neobank|digital/.test(t)) return "digital-first";
  if (/card/.test(t)) return "card issuer";
  if (/specialty|education lend/.test(t)) return "specialty lender";
  return "regional";
}

const close = (a: number | null, b: number | null, scale: number) => (a == null || b == null ? 0.5 : Math.max(0, 1 - Math.abs(a - b) / scale));

function score(me: Inst, them: Inst, ml: Latest | undefined, tl: Latest | undefined) {
  const reasons: string[] = [];
  // Size: within 2x scores well; 4x apart scores nothing.
  const ratio = Math.abs(Math.log(Number(them.assets_b ?? 1) / Number(me.assets_b ?? 1)));
  const size = Math.max(0, 1 - ratio / Math.log(4));
  if (ratio < Math.log(1.5)) reasons.push("similar size");
  // Region.
  const [ms, ts] = [stateOf(me.hq), stateOf(them.hq)];
  const region = !ms || !ts ? 0.3 : ms === ts ? 1 : DIVISION[ms] === DIVISION[ts] ? 0.8 : REGION[ms] === REGION[ts] ? 0.5 : 0;
  if (ms && ts) {
    if (ms === ts) reasons.push(`also in ${ms}`);
    else if (DIVISION[ms] === DIVISION[ts]) reasons.push(`nearby (${DIVISION[ms]})`);
    else if (REGION[ms] === REGION[ts]) reasons.push(`same region (${REGION[ms]})`);
  }
  // Business model and balance sheet.
  const sameModel = model(me) === model(them);
  const ldr = close(ml?.ldr ?? null, tl?.ldr ?? null, 30);
  const cost = close(ml?.deposit_cost ?? null, tl?.deposit_cost ?? null, 1.5);
  const nim = close(ml?.nim ?? null, tl?.nim ?? null, 1.5);
  const profile = (sameModel ? 1 : 0) * 0.4 + ldr * 0.2 + cost * 0.2 + nim * 0.2;
  if (sameModel && model(me) !== "regional") reasons.push(`also ${model(me)}`);
  if (ldr > 0.8 && cost > 0.75) reasons.push("similar funding mix");
  else if (cost > 0.85) reasons.push("similar deposit cost");
  if (nim > 0.85) reasons.push("similar margin");
  return { value: 0.4 * size + 0.2 * region + 0.4 * profile, reasons };
}

export async function peerSuggestions(db: SupabaseClient, n = 5): Promise<PeerMap> {
  const [{ data: insts }, { data: metrics }, { data: groups }] = await Promise.all([
    db.from("institutions").select("slug, name, category, assets_b, hq, type_label"),
    db.from("regulatory_metrics").select("slug, period, ldr, deposit_cost, nim").order("period", { ascending: false }).limit(2000),
    db.from("peer_groups").select("slug, source, year, peers"),
  ]);
  const all = (insts ?? []) as Inst[];
  const latest = new Map<string, Latest>();
  for (const m of (metrics ?? []) as (Latest & { period: string })[]) if (!latest.has(m.slug)) latest.set(m.slug, m);
  const official = new Map((groups ?? []).map((g) => [g.slug as string, g]));
  const result: PeerMap = {};
  for (const me of all) {
    const group = official.get(me.slug);
    const named = new Set(((group?.peers ?? []) as { slug: string | null }[]).map((p) => p.slug).filter(Boolean) as string[]);
    // Only when the group names someone we cover (Truist's peers are all larger banks we don't).
    const source = group && named.size ? `${group.year ? `${group.year} ` : ""}${group.source === "proxy" ? "proxy statement" : group.source === "10-k" ? "10-K" : "investor deck"}` : null;
    const ranked = all
      .filter((t) => t.slug !== me.slug && t.category === me.category && t.assets_b != null)
      .map((t) => {
        const s = score(me, t, latest.get(me.slug), latest.get(t.slug));
        const isOfficial = named.has(t.slug);
        return { slug: t.slug, value: s.value + (isOfficial ? 1 : 0), official: isOfficial, reasons: isOfficial ? [`in its own peer group (${source})`, ...s.reasons] : s.reasons };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, n);
    result[me.slug] = { suggestions: ranked.map(({ slug, reasons, official }) => ({ slug, reasons: reasons.length ? reasons : ["closest overall"], official })), officialSource: source };
  }
  return result;
}
