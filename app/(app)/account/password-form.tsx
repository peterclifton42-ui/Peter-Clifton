"use client";

import { useActionState } from "react";
import { changePassword } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action}>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">Password changed.</div>}
      <div className="row">
        <div className="field">
          <label htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">Type it again</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        <button type="submit" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
      </div>
    </form>
  );
}
