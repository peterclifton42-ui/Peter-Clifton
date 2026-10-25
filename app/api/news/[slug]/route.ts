import { NextResponse, type NextRequest } from "next/server";
import { askConfigured } from "@/lib/ask/agent";
import { NEWS_COOLDOWN_HOURS, refreshNews } from "@/lib/news/refresh";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// "Refresh news" on a bank page: a web search for recent news, saved to news_items.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DAILY_PER_PERSON = 15;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).single();
  if (!profile || profile.role === "pending") return NextResponse.json({ error: "Your account doesn't have access yet." }, { status: 403 });
  if (!askConfigured() || !adminConfigured()) return NextResponse.json({ error: "News refresh isn't switched on (ANTHROPIC_API_KEY or SUPABASE_SECRET_KEY missing)." }, { status: 503 });

  const { data: inst } = await db.from("institutions").select("slug, name, category").eq("slug", slug).maybeSingle();
  if (!inst) return NextResponse.json({ error: "Unknown institution." }, { status: 404 });

  const since = new Date(Date.now() - NEWS_COOLDOWN_HOURS * 3600 * 1000).toISOString();
  const { data: recent } = await db.from("news_refreshes").select("started_at, status")
    .eq("slug", slug).neq("status", "failed").gte("started_at", since).order("started_at", { ascending: false }).limit(1);
  if (recent?.length) {
    const when = new Date(recent[0].started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    return NextResponse.json({ error: recent[0].status === "running" ? "A news refresh for this bank is already running." : `News was refreshed at ${when} ET. Try again in a few hours.` }, { status: 429 });
  }
  const { count } = await db.from("news_refreshes").select("id", { count: "exact", head: true })
    .eq("requested_by", userId).gte("started_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if ((count ?? 0) >= DAILY_PER_PERSON) return NextResponse.json({ error: `You've refreshed news ${DAILY_PER_PERSON} times in 24 hours. Try again later.` }, { status: 429 });

  const result = await refreshNews({
    admin: createAdminClient(), slug, name: inst.name, isCreditUnion: inst.category === "credit_union", userId,
  });
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: 502 });
}
