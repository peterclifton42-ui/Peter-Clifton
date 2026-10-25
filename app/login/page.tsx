import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="login-wrap">
      <div className="panel login-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img className="login-logo" src="/curinos-logo.svg" alt="Curinos" width={117} height={26} />
        <h1>{APP_NAME}</h1>
        <p className="sub">Sign in with the email your invite was sent to.</p>
        <LoginForm />
      </div>
    </main>
  );
}
