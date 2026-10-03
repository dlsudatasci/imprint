import React, { useId } from 'react';
import { cn } from './cn';

/**
 * Checkbox with its label, used for every checkbox on the platform.
 *
 * The box never shrinks (`shrink-0`) and never changes size. A raw checkbox in a
 * flex row is a flex item, and flex items shrink by default: when its label wraps
 * onto a second line, the browser takes width from the box, so two checkboxes
 * with the same classes render at different sizes. That is how the two consent
 * boxes on the sign-up form drifted apart (fixed 30 Sep 2026). ESLint rejects a
 * raw <input type="checkbox"> outside src/ui, so screens use this instead.
 */
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Text or inline content (for example a link) shown beside the box. */
  label: React.ReactNode;
  /** Extra classes for the wrapper, e.g. spacing. */
  className?: string;
  /** Classes for the label text, for the rare screen that needs a quieter tone. */
  labelClassName?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, labelClassName, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={cn(
          // Native control: no forms plugin, so size and accent colour are all it takes.
          'shrink-0 w-5 h-5 mt-0.5 cursor-pointer accent-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
        {...rest}
      />
      <label htmlFor={inputId} className={cn('text-sm font-medium text-body cursor-pointer', labelClassName)}>
        {label}
      </label>
    </div>
  );
});

export default Checkbox;
