"use client";

import { useActionState } from "react";
import { clearDemoWhitespace } from "../whitespace/actions";
import { createUser, removeUser, sendEmailPreview, sendPasswordLink, setRole, type AdminState } from "./actions";

function LinkResult({ state }: { state: AdminState }) {
  if (state?.error) return <div className="notice error">{state.error}</div>;
  if (!state?.link) return null;
  const { email, kind, url, emailed, emailError } = state.link;
  const what = kind === "invite" ? "invite" : "password reset link";
  if (emailed) {
    return <div className="notice ok">Sent the {what} to {email}. {kind === "invite" ? "The link works for 7 days." : "The link works for 2 hours."}</div>;
  }
  return (
    <div className="notice info">
      Couldn&apos;t email {email}, so send them this {what} yourself (it works {kind === "invite" ? "for 7 days" : "for 2 hours"}, once):
      <div className="copy-link">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link to send" />
        <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(url)}>Copy</button>
      </div>
      <span className="dim">Why: {emailError}</span>
    </div>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  return (
    <form action={action}>
      <LinkResult state={state} />
      <div className="row">
        <div className="field">
          <label htmlFor="full_name">Name</label>
          <input id="full_name" name="full_name" placeholder="Jane Smith" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" placeholder="jane.smith@curinos.com" required />
        </div>
        <div className="field" style={{ flex: "0 1 140px" }}>
          <label htmlFor="role">Role</label>
          <select id="role" name="role" defaultValue="seller">
            <option value="seller">Seller</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
      </div>
    </form>
  );
}

type UserRowProps = { id: string; email: string; fullName: string | null; role: string; isSelf: boolean; signedIn: boolean };

export function UserRow({ id, email, fullName, role, isSelf, signedIn }: UserRowProps) {
  const [state, linkAction, sending] = useActionState(sendPasswordLink, undefined);
  return (
    <div>
      <div className="user-row">
        <div className="who">
          <strong>{fullName || email}</strong>
          {fullName && <span className="dim">{email}</span>}
          {!signedIn && <span className="badge status-estimated">Invited · not signed in yet</span>}
        </div>
        <form action={setRole}>
          <input type="hidden" name="id" value={id} />
          <select name="role" defaultValue={role} disabled={isSelf} aria-label={`Role for ${email}`}>
            <option value="pending">Pending (no access)</option>
            <option value="seller">Seller</option>
            <option value="manager">Manager (seller + team view)</option>
            <option value="admin">Admin</option>
          </select>
          {!isSelf && <button type="submit" className="secondary">Save role</button>}
        </form>
        <form action={linkAction}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="secondary" disabled={sending}>
            {sending ? "Sending…" : signedIn ? "Send reset link" : "Resend invite"}
          </button>
        </form>
        {!isSelf && (
          <form
            action={removeUser}
            onSubmit={(e) => { if (!confirm(`Remove ${email}? They will lose access immediately.`)) e.preventDefault(); }}
          >
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="secondary">Remove</button>
          </form>
        )}
      </div>
      <LinkResult state={state} />
    </div>
  );
}

export function EmailPreviewForm() {
  const [state, action, pending] = useActionState(sendEmailPreview, undefined);
  return (
    <form action={action}>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.sentTo && <div className="notice ok">Sent to {state.sentTo}. It can take a minute to arrive; check spam too.</div>}
      <div className="row">
        <button type="submit" name="kind" value="test" className="secondary" disabled={pending}>Send me a test email</button>
        <button type="submit" name="kind" value="digest" className="secondary" disabled={pending}>Send me this week&apos;s digest</button>
      </div>
    </form>
  );
}

export function ClearDemoButton({ count }: { count: number }) {
  return (
    <form action={clearDemoWhitespace}
      onSubmit={(e) => { if (!confirm(`Remove all ${count} demo whitespace entries, their history and the demo sellers? Real entries stay.`)) e.preventDefault(); }}>
      <button type="submit" className="secondary">Clear demo data ({count})</button>
    </form>
  );
}
