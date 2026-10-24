"use client";

import { useActionState } from "react";
import { saveEmailPreferences } from "./actions";

export function EmailForm({ instant, digest }: { instant: boolean; digest: boolean }) {
  const [state, action, pending] = useActionState(saveEmailPreferences, undefined);
  return (
    <form action={action}>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">Email settings saved.</div>}
      <div className="checks">
        <label>
          <input type="checkbox" name="instant" defaultChecked={instant} />
          <span>Instant alerts
            <span className="dim">An email when a bank you follow reports results or its dashboard is updated. Several updates at once arrive as one email.</span>
          </span>
        </label>
        <label>
          <input type="checkbox" name="digest" defaultChecked={digest} />
          <span>Weekly digest
            <span className="dim">Monday morning: the week&apos;s updated dashboards, results, news and who reports next, for the banks you follow.</span>
          </span>
        </label>
      </div>
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save email settings"}</button>
    </form>
  );
}
