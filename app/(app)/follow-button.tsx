"use client";

import { useOptimistic, useTransition } from "react";
import { setFollowing, setMyAccount } from "./follow";

type Props = { slug: string; name: string; following: boolean; compact?: boolean };

export function FollowButton({ slug, name, following, compact }: Props) {
  const [optimistic, setOptimistic] = useOptimistic(following);
  const [, startTransition] = useTransition();

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation(); // the directory row is itself a link
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      await setFollowing(slug, next);
    });
  }

  const label = optimistic ? `Unfollow ${name}` : `Follow ${name}`;
  return (
    <button
      type="button"
      className={`follow${optimistic ? " on" : ""}${compact ? " compact" : ""}`}
      onClick={toggle}
      aria-pressed={optimistic}
      aria-label={label}
      title={label}
    >
      {optimistic ? "★" : "☆"}
      {!compact && <span>{optimistic ? "Following" : "Follow"}</span>}
    </button>
  );
}

// "My account": a followed bank the seller owns counts in their book (and their
// manager's team view); otherwise it's followed for news and alerts only.
export function AccountToggle({ slug, mine }: { slug: string; mine: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(mine);
  const [, startTransition] = useTransition();
  const toggle = () => startTransition(async () => { setOptimistic(!optimistic); await setMyAccount(slug, !optimistic); });
  return (
    <button type="button" className={`follow account${optimistic ? " on" : ""}`} onClick={toggle} aria-pressed={optimistic}
      title={optimistic ? "In your book: counts in Whitespace and your manager's team view. Click to follow for news only." : "Followed for news only. Click to add it to your book of accounts."}>
      {optimistic ? "✓ My account" : "+ My account"}
    </button>
  );
}
