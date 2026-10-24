import { NextResponse, type NextRequest } from "next/server";
import { runAlerts, runDigest } from "@/lib/email/jobs";
import { emailConfigured } from "@/lib/email/send";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

// Called by the database scheduler (pg_cron): /api/email/alerts every 30 minutes,
// /api/email/digest on Monday. The bearer token is a secret only the database holds.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  if (job !== "alerts" && job !== "digest") return NextResponse.json({ error: "unknown job" }, { status: 404 });
  if (!adminConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });

  const db = createAdminClient();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: ok } = token ? await db.rpc("email_cron_secret_ok", { p_secret: token }) : { data: false };
  if (!ok) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  // Without Resend, leave everything pending; in-app alerts still work.
  if (!emailConfigured()) return NextResponse.json({ job, skipped: "RESEND_API_KEY is not set" });

  try {
    return NextResponse.json({ job, ...(job === "alerts" ? await runAlerts(db) : await runDigest(db)) });
  } catch (e) {
    return NextResponse.json({ job, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
