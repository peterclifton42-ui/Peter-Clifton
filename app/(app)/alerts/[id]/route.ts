import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Opening an alert marks it read, then goes to the page or article it points at.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("link, read_at").eq("id", Number(id)).maybeSingle();
  if (data && !data.read_at) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", Number(id));
  }
  const link = data?.link ?? "/alerts";
  const target = link.startsWith("/") ? new URL(link, request.url) : /^https:\/\//.test(link) ? link : new URL("/alerts", request.url);
  return NextResponse.redirect(target);
}
