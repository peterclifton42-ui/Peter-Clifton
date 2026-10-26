"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LOST_WINDOW_MONTHS, STATUSES, STATUS_KEYS, formatQuarter, formatUsd, quarterOptions, type Status } from "@/lib/whitespace-core";
import { saveWhitespace } from "./actions";

export type EditorTarget = {
  slug: string; bankName: string; productSlug: string; productName: string;
  applies: boolean; appliesReason?: string; aiHint?: string | null;
  row: { status: Status; target_quarter: string | null; acv_usd: number | null; lost_on: string | null; note: string | null } | null;
};

// The coloured status chip used everywhere whitespace appears.
export function StatusPill({ status, expired, compact }: { status: Status | null; expired?: boolean; compact?: boolean }) {
  if (!status) return <span className="ws-pill ws-none">{compact ? "–" : "Not reviewed"}</span>;
  if (expired) return <span className="ws-pill ws-expired" title="The loss is outside its window, so this is eligible again.">{compact ? "↺" : "Eligible again"}</span>;
  const s = STATUSES[status];
  return <span className={`ws-pill ws-${status}`} title={s.label}>{compact ? s.code : s.short}</span>;
}

// A button (pill or grid cell) that opens the editor for one product.
export function EditTrigger({ target, children, className, label }: {
  target: EditorTarget; children: React.ReactNode; className?: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? "ws-edit"} onClick={() => setOpen(true)} aria-label={label} title={label}>
        {children}
      </button>
      {open && <Editor target={target} onClose={() => setOpen(false)} />}
    </>
  );
}

function Editor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveWhitespace, undefined);
  const [status, setStatus] = useState<Status | "none">(target.row?.status ?? "none");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { if (state?.saved) onClose(); }, [state, onClose]);

  const pursuit = status === "validated" || status === "in_play";
  const lostWindow = status !== "none" ? LOST_WINDOW_MONTHS[status] : undefined;
  const quarters = quarterOptions();
  const today = new Date();
  const minMonth = lostWindow ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - lostWindow + 1, 1)).toISOString().slice(0, 7) : undefined;
  const choices: (Status | "none")[] = target.applies ? ["none", ...STATUS_KEYS] : ["none", "client", "not_fit"];

  return (
    <dialog ref={dialog} className="ws-dialog" onClose={onClose} onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <form action={action}>
        <input type="hidden" name="slug" value={target.slug} />
        <input type="hidden" name="product" value={target.productSlug} />
        <input type="hidden" name="status" value={status} />
        <div className="ws-dialog-head">
          <div>
            <b>{target.productName}</b>
            <span className="dim">{target.bankName}</span>
          </div>
          <button type="button" className="link" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {target.aiHint && <p className="ws-hint">{target.aiHint}</p>}
        {!target.applies && <p className="ws-hint warn-text">Not applicable: {target.appliesReason}.</p>}
        {state?.error && <div className="notice error">{state.error}</div>}

        <fieldset className="ws-choices">
          <legend>Status</legend>
          {choices.map((s) => (
            <label key={s} className={`ws-choice${status === s ? " on" : ""}`}>
              <input type="radio" name="status-choice" checked={status === s} onChange={() => setStatus(s)} />
              {s === "none" ? <span className="ws-pill ws-none">Not reviewed</span> : <span className={`ws-pill ws-${s}`}>{STATUSES[s].short}</span>}
              <span className="dim">{s === "none" ? "Clear the status" : STATUSES[s].label}</span>
            </label>
          ))}
        </fieldset>

        {pursuit && (
          <div className="row">
            <div className="field">
              <label htmlFor="ws-quarter">{status === "validated" ? "Quarter to pursue" : "Expected close"}</label>
              <select id="ws-quarter" name="quarter" defaultValue={target.row?.target_quarter ?? (status === "validated" ? quarters[1] : "")}>
                {status === "in_play" && <option value="">Not set</option>}
                {quarters.map((q) => <option key={q} value={q}>{formatQuarter(q)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ws-acv">Opportunity (ACV, USD)</label>
              <input id="ws-acv" name="acv" inputMode="decimal" placeholder="e.g. 250k" defaultValue={target.row?.acv_usd ? formatUsd(target.row.acv_usd).replace("$", "") : ""} />
            </div>
          </div>
        )}
        {lostWindow && (
          <div className="row">
            <div className="field">
              <label htmlFor="ws-lost">Month lost (within {lostWindow} months)</label>
              <input id="ws-lost" name="lost_on" type="month" min={minMonth} max={today.toISOString().slice(0, 7)} defaultValue={target.row?.lost_on?.slice(0, 7) ?? ""} required />
            </div>
            <div className="field">
              <label htmlFor="ws-acv">Value lost (ACV, optional)</label>
              <input id="ws-acv" name="acv" inputMode="decimal" placeholder="e.g. 150k" defaultValue={target.row?.acv_usd ? formatUsd(target.row.acv_usd).replace("$", "") : ""} />
            </div>
          </div>
        )}
        {status !== "none" && (
          <div className="field">
            <label htmlFor="ws-note">Note (optional)</label>
            <input id="ws-note" name="note" maxLength={500} defaultValue={target.row?.note ?? ""}
              placeholder={status === "not_fit" ? "Why it isn't a fit" : lostWindow ? "Who it went to, or why" : "Context for the team"} />
          </div>
        )}
        <div className="ws-dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </dialog>
  );
}
