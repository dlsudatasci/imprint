/**
 * Joins class names, dropping falsy entries.
 *
 * This is not a Tailwind-aware merge, and that is deliberate. Components in
 * this library own their appearance through props (`variant`, `size`, `tone`),
 * and `className` is reserved for layout the component can't know about, such
 * as margin, width, or grid placement.
 *
 * Passing a class that conflicts with a component's own styling is unsupported:
 * which one wins depends on stylesheet order, not call order. If you need an
 * appearance the props don't cover, add a variant to the component rather than
 * overriding it from the call site.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
