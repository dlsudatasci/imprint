import React, { useId } from 'react';
import { cn } from './cn';

/**
 * Radio button with its label, used for every radio button on the platform.
 * Same rules as Checkbox: fixed size, never shrinks, label beside it. Group
 * radios with the same `name` inside a <fieldset> with a <legend>.
 */
export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: React.ReactNode;
  className?: string;
  labelClassName?: string;
}

const Radio = React.forwardRef<HTMLInputElement, RadioProps>(function Radio(
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
        type="radio"
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

export default Radio;
