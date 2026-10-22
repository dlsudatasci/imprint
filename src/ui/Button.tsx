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

export type ButtonVariant = 'primary' | 'secondary' | 'neutral' | 'danger' | 'plain';
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
  // Hover feedback is a colour change alone — no lift, no shadow. Pressing
  // answers at once (16 Oct 2026, apple-design: respond on press, not on
  // release): the button settles to 97% over 100 ms while held. Colour keeps
  // its 300 ms. Reduced motion keeps the colour change and drops the scale.
  '[transition:color_300ms_ease-in-out,background-color_300ms_ease-in-out,border-color_300ms_ease-in-out,transform_100ms_ease-out]',
  'enabled:active:scale-[0.97] motion-reduce:enabled:active:scale-100',
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
  // Tinted text and nothing else (22 Oct 2026, apple-design), as a secondary
  // action in a list on iOS: Show more under the dashboard's sessions. It dims
  // the moment it is pressed, on top of the press scale.
  plain: [
    'bg-transparent border-transparent text-primary',
    'hover:text-primary-hover enabled:active:opacity-40',
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
