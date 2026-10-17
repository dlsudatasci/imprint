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

/**
 * The display sizes (16 Oct 2026, apple-design typography): tracking tightens
 * and leading closes up as the type grows, so the size, tracking and leading
 * are set together here rather than at each call site. `cn` does not merge
 * Tailwind classes, so a page passing `text-6xl` to H1 could lose to H1's own
 * `lg:text-5xl`. Use these instead of resizing H1 and H2.
 *
 * Display: the one big heading at the top of a public page (h1 by default).
 * Headline: a section's statement heading on a long-form page (h2 by default).
 */
type DisplayProps = Props & { as?: 'h1' | 'h2' | 'h3'; id?: string };

export function Display({ as: Tag = 'h1', id, className, children }: DisplayProps) {
  return (
    <Tag
      id={id}
      className={cn(
        'font-display font-extrabold text-ink text-balance',
        'text-5xl leading-[1.04] tracking-[-0.03em] sm:text-6xl xl:text-7xl',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Headline({ as: Tag = 'h2', id, className, children }: DisplayProps) {
  return (
    <Tag
      id={id}
      className={cn(
        'font-display font-extrabold text-ink text-balance',
        'text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl lg:text-5xl lg:leading-[1.06] lg:tracking-[-0.025em]',
        className,
      )}
    >
      {children}
    </Tag>
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
