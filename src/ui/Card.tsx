import React from 'react';
import { cn } from './cn';

/**
 * Content surface — the bordered panel most sections of content sit on.
 *
 * `elevation` covers the three cases the platform uses: a resting card, one
 * that responds to hover because it is clickable, and an overlay such as a
 * modal, dropdown or popover.
 */
export type CardElevation = 'rest' | 'interactive' | 'overlay';
export type CardPadding = 'sm' | 'md' | 'lg' | 'none';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: CardElevation;
  padding?: CardPadding;
  /** Renders at modal radius — for overlays and full-width hero panels. */
  large?: boolean;
  className?: string;
  children: React.ReactNode;
}

// Cards are separated by their border, not by a shadow. A resting card is
// distinguished by its edge; only a true overlay gets a shadow.
const elevations: Record<CardElevation, string> = {
  rest: '',
  interactive: 'hover:border-subtle transition-colors duration-300 cursor-pointer',
  overlay: 'shadow-2xl',
};

const paddings: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export default function Card({
  elevation = 'rest',
  padding = 'md',
  large,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-line',
        large ? 'rounded-modal' : 'rounded-card',
        elevations[elevation],
        paddings[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
