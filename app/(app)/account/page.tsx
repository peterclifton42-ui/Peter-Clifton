import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmailForm } from "./email-form";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data: prefs } = await supabase.from("email_preferences").select("instant, digest").eq("user_id", viewer.id).maybeSingle();
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Your account</h1>
          <p>{viewer.fullName ? `${viewer.fullName} · ` : ""}{viewer.email} · <span className="badge role">{viewer.role}</span></p>
        </div>
      </div>
      {viewer.role !== "pending" && (
        <div className="panel">
          <h2>Email</h2>
          <p>Emails go to {viewer.email} and only cover the banks you follow. Everything also appears under Alerts in the app.</p>
          <EmailForm instant={prefs?.instant ?? true} digest={prefs?.digest ?? true} />
        </div>
      )}
      <div className="panel">
        <h2>Change your password</h2>
        <p>If your admin gave you a temporary password, replace it here with one only you know.</p>
        <PasswordForm />
      </div>
    </main>
  );
}
