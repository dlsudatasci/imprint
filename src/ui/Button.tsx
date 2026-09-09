import React from 'react';
import { cn } from './cn';

/**
 * The button. Every clickable action on the platform uses this.
 *
 * Appearance comes from `variant` and `size`, never from `className` — that is
 * reserved for layout, such as margin, width or flex placement. If a screen
 * needs a look these props don't cover, add a variant here rather than styling
 * it at the call site. See cn.ts for why overrides don't reliably work.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'neutral' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Visual weight. `primary` is the page's single main action. */
  variant?: ButtonVariant;
  /** `md` is the default; `sm` is for navbars and dense toolbars. */
  size?: ButtonSize;
  /**
   * Renders `type="submit"`. Defaults to `type="button"` rather than the HTML
   * default, so dropping one inside a form doesn't accidentally submit it.
   */
  submit?: boolean;
  /** Stretches to the container width — the norm for buttons inside forms. */
  fullWidth?: boolean;
  /** Layout classes only. */
  className?: string;
  children: React.ReactNode;
}

const base = [
  'inline-flex items-center justify-center gap-2',
  'font-bold border',
  'rounded-control',
  // Hover feedback is a colour change alone — no lift, no shadow.
  'transition-colors duration-300 ease-in-out',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ');

const sizes: Record<ButtonSize, string> = {
  sm: 'py-2 px-4 text-sm',
  md: 'py-3 px-6 text-base',
};

const variants: Record<ButtonVariant, string> = {
  primary: [
    'bg-primary border-primary text-white',
    'hover:bg-primary-hover',
  ].join(' '),
  secondary: [
    'bg-transparent border-primary text-primary',
    'hover:bg-primary hover:text-white',
  ].join(' '),
  neutral: [
    'bg-surface border-line text-ink',
    'hover:border-subtle hover:bg-surface-subtle',
  ].join(' '),
  danger: [
    'bg-surface border-danger-border text-danger',
    'hover:bg-danger hover:text-white',
  ].join(' '),
};

export default function Button({
  variant = 'primary',
  size = 'md',
  submit,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={submit ? 'submit' : 'button'}
      className={cn(base, sizes[size], variants[variant], fullWidth && 'w-full', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
