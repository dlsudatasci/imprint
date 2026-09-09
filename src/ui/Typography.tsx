import React from 'react';
import { cn } from './cn';

/**
 * Heading and text components — every piece of text on the platform.
 *
 * Size and weight come from which component you pick, not from `className`,
 * which is for layout only. Choose by meaning: H1 for the page title, H2 for a
 * section, P for running copy, Meta for secondary text.
 *
 * Headings render in the display typeface, body text in the UI typeface.
 */

type Props = {
  className?: string;
  children: React.ReactNode;
};

const heading = 'font-display font-extrabold text-ink tracking-tight text-balance';

/** Page title. One per page — the hero or page header. */
export function H1({ className, children }: Props) {
  return (
    <h1 className={cn(heading, 'text-4xl lg:text-5xl', className)}>{children}</h1>
  );
}

/** Section heading within a page, and card titles. */
export function H2({ className, children }: Props) {
  return <h2 className={cn(heading, 'text-3xl', className)}>{children}</h2>;
}

/** Subsection heading. */
export function H3({ className, children }: Props) {
  return (
    <h3 className={cn('font-display font-bold text-ink tracking-tight text-2xl', className)}>
      {children}
    </h3>
  );
}

/** Running copy. */
export function P({ className, children }: Props) {
  return (
    <p className={cn('font-medium text-body text-sm md:text-base', className)}>
      {children}
    </p>
  );
}

/** Secondary text: captions, counters, timestamps, field hints. */
export function Meta({ className, children }: Props) {
  return (
    <p className={cn('text-xs font-semibold text-muted', className)}>{children}</p>
  );
}
