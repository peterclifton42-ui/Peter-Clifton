"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireViewer } from "@/lib/auth";
import { productBySlug } from "@/lib/products";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LOST_WINDOW_MONTHS, applicability, isStatus, monthsAgo, parseUsd, quarterOptions } from "@/lib/whitespace";

export type SaveState = { error?: string; saved?: boolean } | undefined;

// Sets (or clears, with status "none") one institution x product. The history
// row is written by the database trigger.
export async function saveWhitespace(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const viewer = await requireViewer();
  if (viewer.role === "pending") return { error: "Your account is waiting for approval." };
  const slug = String(formData.get("slug") ?? "");
  const productSlug = String(formData.get("product") ?? "");
  const status = String(formData.get("status") ?? "");
  const product = productBySlug(productSlug);
  if (!product) return { error: "Unknown product." };

  const supabase = await createClient();
  const { data: inst } = await supabase.from("institutions").select("slug, category, assets_b").eq("slug", slug).maybeSingle();
  if (!inst) return { error: "Unknown institution." };

  if (status === "none") {
    const { error } = await supabase.from("whitespace").delete().eq("slug", slug).eq("product_slug", productSlug);
    if (error) return { error: error.message };
    revalidate(slug);
    return { saved: true };
  }
  if (!isStatus(status)) return { error: "Choose a status." };
  const applies = applicability(product, inst);
  if (!applies.ok && status !== "not_fit" && status !== "client") return { error: `${product.name} doesn't apply here (${applies.reason}).` };

  const pursuit = status === "validated" || status === "in_play";
  const quarter = String(formData.get("quarter") ?? "") || null;
  if (quarter && !quarterOptions(new Date(), 11).includes(quarter)) return { error: "Choose a quarter from the list." };
  if (status === "validated" && !quarter) return { error: "Choose the quarter you plan to pursue it." };

  const acv = parseUsd(String(formData.get("acv") ?? ""));
  if (Number.isNaN(acv)) return { error: "Enter the ACV as a number, like 250k or 1.2m." };
  if (acv != null && acv > 50_000_000) return { error: "That ACV looks too large. Enter the annual value in dollars, like 250k." };

  let lostOn: string | null = null;
  const window = LOST_WINDOW_MONTHS[status];
  if (window) {
    const month = String(formData.get("lost_on") ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Choose the month it was lost." };
    lostOn = `${month}-01`;
    const ago = monthsAgo(lostOn);
    if (ago < 0) return { error: "The lost month can't be in the future." };
    if (ago >= window) return { error: `That's more than ${window} months ago, so it counts as eligible again. Choose another status instead.` };
  }
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;

  const { error } = await supabase.from("whitespace").upsert({
    slug, product_slug: productSlug, status,
    target_quarter: pursuit ? quarter : null,
    acv_usd: pursuit || window ? acv : null,
    lost_on: lostOn, note,
    updated_by: viewer.id, updated_at: new Date().toISOString(),
    is_demo: false, // a real edit makes the row real
  }, { onConflict: "slug,product_slug" });
  if (error) return { error: error.message };
  revalidate(slug);
  return { saved: true };
}

function revalidate(slug: string) {
  revalidatePath(`/banks/${slug}/whitespace`);
  revalidatePath("/whitespace");
}

// Admin: remove every demo row, its history and snapshots, and the demo sellers.
export async function clearDemoWhitespace() {
  await requireAdmin();
  if (!adminConfigured()) return;
  const admin = createAdminClient();
  await admin.from("whitespace").delete().eq("is_demo", true);
  await admin.from("whitespace_events").delete().eq("is_demo", true);
  await admin.from("whitespace_snapshots").delete().eq("is_demo", true);
  // Demo sellers (their follows and team places go with them).
  const { data: demoPeople } = await admin.from("profiles").select("id").eq("is_demo", true);
  for (const p of demoPeople ?? []) await admin.auth.admin.deleteUser(p.id as string);
  revalidatePath("/whitespace");
  revalidatePath("/admin");
}

