import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="login-wrap">
      <div className="panel login-card">
        <h1>Bank Intelligence</h1>
        <p className="sub">Sign in with the account your admin created for you.</p>
        <LoginForm />
      </div>
    </main>
  );
}
