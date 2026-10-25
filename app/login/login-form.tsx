"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action}>
      {state?.error && <div className="notice error">{state.error}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" defaultValue={state?.email} key={state?.email} required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="dim" style={{ marginTop: 14, textAlign: "center" }}><Link href="/login/forgot">Forgot your password?</Link></p>
    </form>
  );
}
