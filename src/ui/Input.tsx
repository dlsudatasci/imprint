import React, { useId } from 'react';
import { cn } from './cn';

/**
 * Text field, with label, hint and error message built in.
 *
 * Used by every form on the platform — sign-up, login, password reset, profile.
 *
 * Passing `error` does four things at once: colours the border, shows the
 * message below the field, sets `aria-invalid`, and links the message to the
 * input so screen readers announce it. Prefer that over styling a failed field
 * at the call site, so validation looks and behaves the same everywhere.
 */
export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  /** Message shown below the field when validation fails. */
  error?: string | null;
  /** Persistent helper text. Hidden while an error is showing. */
  hint?: string;
  /** Element rendered inside the field on the right — e.g. a reveal toggle. */
  trailing?: React.ReactNode;
  className?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, trailing, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id || autoId;
  const msgId = `${inputId}-msg`;
  const invalid = Boolean(error);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-ink">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={invalid || undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={cn(
            'block w-full p-3 font-medium',
            'bg-surface-subtle text-ink placeholder-subtle',
            'rounded-control border outline-none',
            'transition-all duration-300 ease-in-out',
            trailing && 'pr-12',
            invalid
              ? 'border-danger-border focus:border-danger focus:ring-2 focus:ring-danger/20'
              : 'border-line focus:border-primary focus:ring-2 focus:ring-primary/20',
          )}
          {...rest}
        />
        {trailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            {trailing}
          </div>
        )}
      </div>

      {(error || hint) && (
        <p
          id={msgId}
          className={cn('text-xs font-medium', error ? 'text-danger' : 'text-muted')}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});

export default Input;
