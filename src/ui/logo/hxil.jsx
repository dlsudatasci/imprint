/* eslint-disable @next/next/no-img-element */
import { cn } from '../cn';

/**
 * The Human-X Interactions Lab logo, shown in the footer as the research group
 * behind Imprint.
 *
 * The file is drawn in cream for the footer's dark ground. Its name is its alt
 * text, so it is announced.
 */
export default function HXIL({ height = 32, className }) {
  return (
    <img
      src="/images/logo/hxil.png"
      alt="Human-X Interactions Lab"
      style={{ height: `${height}px`, width: 'auto', objectFit: 'contain' }}
      className={cn(className)}
    />
  );
}
