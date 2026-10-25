"use client";

import { useActionState } from "react";
import { createUser, removeUser, resetPassword, sendEmailPreview, setRole, type AdminState } from "./actions";

function PasswordToShare({ state }: { state: AdminState }) {
  if (state?.error) return <div className="notice error">{state.error}</div>;
  if (!state?.created) return null;
  return (
    <div className="notice ok">
      Temporary password for {state.created.email}:{" "}
      <span className="temp-password">{state.created.password}</span>
      <br />
      Send it to them privately. It is shown only once; they can change it under their name, top right.
    </div>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  return (
    <form action={action}>
      <PasswordToShare state={state} />
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
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create login"}</button>
      </div>
    </form>
  );
}

type UserRowProps = { id: string; email: string; fullName: string | null; role: string; isSelf: boolean };

export function UserRow({ id, email, fullName, role, isSelf }: UserRowProps) {
  const [state, resetAction, resetting] = useActionState(resetPassword, undefined);
  return (
    <div>
      <div className="user-row">
        <div className="who">
          <strong>{fullName || email}</strong>
          {fullName && <span className="dim">{email}</span>}
        </div>
        <form action={setRole}>
          <input type="hidden" name="id" value={id} />
          <select name="role" defaultValue={role} disabled={isSelf} aria-label={`Role for ${email}`}>
            <option value="pending">Pending (no access)</option>
            <option value="seller">Seller</option>
            <option value="admin">Admin</option>
          </select>
          {!isSelf && <button type="submit" className="secondary">Save role</button>}
        </form>
        <form action={resetAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="email" value={email} />
          <button type="submit" className="secondary" disabled={resetting}>Reset password</button>
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
      <PasswordToShare state={state} />
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
