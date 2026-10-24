import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Role = "pending" | "seller" | "admin";

export type Viewer = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
};

// The signed-in user and their role, or a redirect to the login page.
export async function requireViewer(): Promise<Viewer> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", userId)
    .single();

  return {
    id: userId,
    email: profile?.email ?? String(data.claims.email ?? ""),
    fullName: profile?.full_name ?? null,
    role: (profile?.role as Role) ?? "pending",
  };
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "admin") redirect("/");
  return viewer;
}
