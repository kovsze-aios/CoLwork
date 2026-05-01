import React from "react";
import { cn } from "../lib/cn";

/**
 * Shimmer skeleton — used everywhere a panel is mid-fetch so the layout
 * doesn't shift and the user gets a visible "I'm working" signal.
 *
 * The shimmer animation is defined in `index.css` (@keyframes skeleton-shimmer).
 */
export function Skeleton({ className, ...rest }) {
  return (
    <div
      {...rest}
      className={cn(
        "relative overflow-hidden rounded-md bg-zinc-900/70",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-[skeleton-shimmer_1.4s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-zinc-800/60 before:to-transparent",
        className,
      )}
    />
  );
}

/** Stack of three text-line skeletons — covers most card-body cases. */
export function SkeletonLines({ count = 3, className }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === count - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** A full metric-card skeleton matching the Dashboard tile shape. */
export function SkeletonCard() {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3 backdrop-blur-sm">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-2 w-32" />
    </div>
  );
}

export default Skeleton;
