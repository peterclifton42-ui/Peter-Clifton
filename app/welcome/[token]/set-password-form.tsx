"use client";

import { useActionState } from "react";
import { setPasswordFromLink } from "./actions";

export function SetPasswordForm({ token, askName, defaultName }: { token: string; askName: boolean; defaultName: string }) {
  const [state, action, pending] = useActionState(setPasswordFromLink.bind(null, token), undefined);
  return (
    <form action={action}>
      {state?.error && <div className="notice error">{state.error}</div>}
      {askName && (
        <div className="field">
          <label htmlFor="full_name">Your name</label>
          <input id="full_name" name="full_name" defaultValue={defaultName} autoComplete="name" />
        </div>
      )}
      <div className="field">
        <label htmlFor="password">Password (at least 10 characters)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="confirm">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <button type="submit" disabled={pending}>{pending ? "Saving…" : askName ? "Set password and sign in" : "Save and sign in"}</button>
    </form>
  );
}
