import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const viewer = await requireViewer();
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Your account</h1>
          <p>{viewer.fullName ? `${viewer.fullName} · ` : ""}{viewer.email} · <span className="badge role">{viewer.role}</span></p>
        </div>
      </div>
      <div className="panel">
        <h2>Change your password</h2>
        <p>If your admin gave you a temporary password, replace it here with one only you know.</p>
        <PasswordForm />
      </div>
    </main>
  );
}
