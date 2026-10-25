import type { Metadata } from "next";
import { NAME_UNDER_LOGO } from "@/lib/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="login-wrap">
      <div className="panel login-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img className="login-logo" src="/curinos-logo.svg" alt="Curinos" width={117} height={26} />
        <h1>{NAME_UNDER_LOGO}</h1>
        <p className="sub">Sign in with the email your invite was sent to.</p>
        <LoginForm />
      </div>
    </main>
  );
}
