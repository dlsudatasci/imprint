import React from 'react';
import Card from './Card';
import { cn } from './cn';

/**
 * The shell every sign-in and onboarding screen sits in.
 *
 * Covers all six auth screens: login, register, forgot password, reset
 * password, choose username, and complete profile. Route new ones through it
 * too — a new contributor meets several of these back to back, and they should
 * feel like one flow rather than separate pages.
 *
 * Uses the same surface as the modal, so dialogs and auth share a look.
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
      <Card elevation="overlay" padding="none" large className="p-8 sm:p-10">
        <div className="flex flex-col items-center text-center mb-8">
          {masthead && <div className="mb-4">{masthead}</div>}
          <h1 className="font-display text-3xl font-extrabold text-ink tracking-tight">
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
