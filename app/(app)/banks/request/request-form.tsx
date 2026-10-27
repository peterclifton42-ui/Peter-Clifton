"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { requestInstitution } from "./actions";

export function RequestForm() {
  const [state, action, pending] = useActionState(requestInstitution, undefined);
  const [confirmNew, setConfirmNew] = useState(false);
  if (state?.queued || state?.joined) {
    return (
      <div className="notice ok">
        {state.queued
          ? <>Requested <b>{state.queued}</b>. It&apos;s in the queue: the next scheduled run (00:07 or 12:07 UTC) takes the oldest request first, and you&apos;ll get an alert when the dashboard is live.</>
          : <><b>{state.joined}</b> was already requested, so you&apos;ve joined that request. You&apos;ll get an alert when it&apos;s live.</>}
        {" "}<Link href="/banks/request">Request another</Link>
      </div>
    );
  }
  return (
    <form action={action}>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.duplicate && !confirmNew && (
        <div className="notice info">
          The app already covers <Link href={`/banks/${state.duplicate.slug}`}><b>{state.duplicate.name}</b></Link>. Is that the one you mean?{" "}
          <button type="button" className="link" onClick={() => setConfirmNew(true)}>No, it&apos;s a different institution</button>
        </div>
      )}
      <input type="hidden" name="confirm_new" value={confirmNew ? "1" : ""} />
      <div className="row">
        <div className="field" style={{ flex: "2 1 260px" }}>
          <label htmlFor="rq-name">Name</label>
          <input id="rq-name" name="name" required minLength={3} maxLength={120} placeholder="e.g. Pinnacle Financial Partners" />
        </div>
        <div className="field" style={{ flex: "1 1 160px" }}>
          <label htmlFor="rq-kind">Type</label>
          <select id="rq-kind" name="kind" defaultValue="bank">
            <option value="bank">Bank or thrift</option>
            <option value="credit_union">Credit union</option>
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: "1 1 260px" }}>
          <label htmlFor="rq-site">Website or ticker (optional, helps find the right one)</label>
          <input id="rq-site" name="website" maxLength={200} placeholder="e.g. pnfp.com or PNFP" />
        </div>
        <div className="field" style={{ flex: "2 1 320px" }}>
          <label htmlFor="rq-note">Why (optional)</label>
          <input id="rq-note" name="note" maxLength={500} placeholder="e.g. New territory account; meeting in January" />
        </div>
      </div>
      <label className="toggle"><input type="checkbox" name="add_to_book" defaultChecked /> Add it to my book when it&apos;s ready</label>
      <div className="row" style={{ marginTop: 14 }}>
        <button type="submit" disabled={pending}>{pending ? "Checking…" : "Request dashboard"}</button>
        <span className="dim">US banks and credit unions only. A full build takes one scheduled run (about 12 hours).</span>
      </div>
    </form>
  );
}
