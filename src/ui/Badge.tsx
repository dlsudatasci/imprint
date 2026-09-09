import React from 'react';
import { cn } from './cn';

/**
 * Small status pill, used for session states and counts.
 *
 * Pick `tone` for what the badge means, not for the colour you want — the
 * colour follows from the meaning. That keeps success and failure reading the
 * same way everywhere on the platform.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Renders a leading dot — useful for live/status readouts. */
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-subtle text-body border-line',
  info: 'bg-info-soft text-primary border-info-border',
  success: 'bg-success-soft text-success border-success-border',
  warning: 'bg-warning-soft text-warning border-warning-border',
  danger: 'bg-danger-soft text-danger border-danger-border',
};

const dots: Record<BadgeTone, string> = {
  neutral: 'bg-subtle',
  info: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export default function Badge({
  tone = 'neutral',
  dot,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap',
        'py-1 px-3 rounded-full border',
        'text-xs font-semibold',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  );
}
