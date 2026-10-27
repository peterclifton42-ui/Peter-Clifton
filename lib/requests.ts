// Matching a requested institution's name against what the app already covers,
// so "Frost" finds Cullen/Frost and "SECU" style duplicates are caught.

const SUFFIX = /\b(the|corporation|corp|incorporated|inc|company|co|bancorp(oration)?|bancshares|bankshares|banc|financial|holdings?|group|federal credit union|credit union|fcu|bank|n\.?a\.?)\b\.?/gi;

export function normalName(name: string) {
  return name.toLowerCase().replace(/\./g, "").replace(/&/g, " and ").replace(SUFFIX, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// True when two names plausibly mean the same institution.
export function sameInstitution(a: string, b: string) {
  const x = normalName(a), y = normalName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length < y.length ? x : y, long = x.length < y.length ? y : x;
  return short.length >= 4 && new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(long);
}

export const REQUEST_STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "In the queue", tone: "status-scheduled" },
  building: { label: "Building now", tone: "run-running" },
  live: { label: "Live", tone: "run-published" },
  failed: { label: "Couldn't build", tone: "run-failed" },
  cancelled: { label: "Cancelled", tone: "run-skipped" },
};
