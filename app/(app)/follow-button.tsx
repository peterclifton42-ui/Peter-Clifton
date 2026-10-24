"use client";

import { useOptimistic, useTransition } from "react";
import { setFollowing } from "./follow";

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
