import React from 'react';
import { cn } from './cn';

/**
 * Placeholder block for content that hasn't loaded yet.
 *
 * Size it with `className`. There are no preset sizes, because a skeleton only
 * reads as a placeholder when it matches the shape of whatever replaces it.
 *
 * Use this rather than rendering zeroed data while loading: a `0` that later
 * becomes `47` looks like a real answer, so people read it as one.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  /** Pill radius, for avatars and badges. */
  round?: boolean;
}

export default function Skeleton({ className, round, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-line motion-reduce:animate-none',
        round ? 'rounded-full' : 'rounded',
        className,
      )}
      {...rest}
    />
  );
}
