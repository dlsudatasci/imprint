import React from 'react';
import { cn } from './cn';

/**
 * Square button holding a single icon.
 *
 * Separate from Button because it has no label padding and needs a fixed square
 * footprint, which doesn't fit Button's sizing.
 *
 * `aria-label` is required. There is no visible text, so without one the button
 * is unusable with a screen reader.
 */

export type IconButtonTone = 'neutral' | 'primary' | 'danger';
export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  tone?: IconButtonTone;
  size?: IconButtonSize;
  /** Round rather than rounded-square — for avatars and floating controls. */
  round?: boolean;
  /** Required: the accessible name, since there is no visible label. */
  'aria-label': string;
  className?: string;
  children: React.ReactNode;
}

const sizes: Record<IconButtonSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
};

const tones: Record<IconButtonTone, string> = {
  neutral: 'bg-surface border-line text-muted hover:text-ink hover:bg-surface-subtle',
  primary: 'bg-primary-50 border-primary-100 text-primary hover:bg-primary-100',
  danger: 'bg-surface border-danger-border text-danger hover:bg-danger-soft',
};

export default function IconButton({
  tone = 'neutral',
  size = 'md',
  round,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center shrink-0 border',
        'transition-colors duration-300 ease-in-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        round ? 'rounded-full' : 'rounded-control',
        sizes[size],
        tones[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
