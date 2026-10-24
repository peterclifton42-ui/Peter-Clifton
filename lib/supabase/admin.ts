import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

// Full-access client for admin tasks (creating logins, resetting passwords).
// The secret key lives only in the server environment, never in the browser.
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is not set. Add it in Vercel → Settings → Environment Variables.");
  }
  return createClient(SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function adminConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}
