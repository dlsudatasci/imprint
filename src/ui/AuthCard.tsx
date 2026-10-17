import React from 'react';
import Card from './Card';
import { cn } from './cn';
import { containerClass } from './Container';

/**
 * The shell every sign-in and onboarding screen sits in.
 *
 * Covers all six auth screens: login, register, forgot password, reset
 * password, choose username, and complete profile. Route new ones through it
 * too — a new contributor meets several of these back to back, and they should
 * feel like one flow rather than separate pages.
 *
 * Modal radius, but no shadow since 16 Oct 2026 (apple-design: a shadow says
 * a surface floats over something, and this card sits on the page). It is
 * separated by its border like every resting card (design system D6). Each
 * screen sits in an AuthScreen, which gives them one top margin and width.
 */
export interface AuthCardProps {
  title: string;
  /** Sits under the title. Accepts nodes so it can carry a link. */
  subtitle?: React.ReactNode;
  /** Logo or icon above the title. */
  masthead?: React.ReactNode;
  /** Rendered below the card, outside its border — e.g. "Back to home". */
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export default function AuthCard({
  title,
  subtitle,
  masthead,
  footer,
  className,
  children,
}: AuthCardProps) {
  return (
    <div className={cn('w-full max-w-md flex flex-col', className)}>
      <Card padding="none" large className="p-6 sm:p-10">
        <div className="flex flex-col items-center text-center mb-8">
          {masthead && <div className="mb-4">{masthead}</div>}
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-[-0.02em] text-ink text-balance">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 text-sm font-medium text-muted">{subtitle}</p>
          )}
        </div>
        {children}
      </Card>
      {footer && (
        <div className="mt-6 text-center text-sm font-medium text-muted">{footer}</div>
      )}
    </div>
  );
}

/**
 * The page around an AuthCard (16 Oct 2026): centred, one top margin for every
 * auth screen, and room below so the footer never crowds the card. Register,
 * forgot password, reset password, choose username and complete profile use
 * it. Login lays out its scene beside the card instead.
 */
export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className={containerClass('page', 'flex flex-col items-center pt-8 pb-20 sm:pt-12 lg:pb-28')}>
      {children}
    </div>
  );
}
