import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <main className="login-wrap">
      <div className="panel login-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img className="login-logo" src="/curinos-logo.svg" alt="Curinos" width={117} height={26} />
        <h1>{APP_NAME}</h1>
        <p className="sub">Enter your email and we&apos;ll send you a link to choose a new password.</p>
        <ForgotForm />
        <p className="dim" style={{ marginTop: 16 }}><Link href="/login">← Back to sign in</Link></p>
      </div>
    </main>
  );
}
