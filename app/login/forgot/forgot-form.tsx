"use client";

import { useActionState } from "react";
import { requestReset } from "./actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  if (state?.sent) {
    return (
      <div className="notice ok">
        If that email has an account, a link is on its way. It works for 2 hours. Nothing after a few minutes? Check spam, or ask your admin.
      </div>
    );
  }
  return (
    <form action={action}>
      {state?.error && <div className="notice error">{state.error}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      <button type="submit" disabled={pending}>{pending ? "Sending…" : "Send me a link"}</button>
    </form>
  );
}
