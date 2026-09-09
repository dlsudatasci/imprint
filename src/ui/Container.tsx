import React from 'react';
import { cn } from './cn';

/**
 * The page shell: how wide a page is and where its side edges sit.
 *
 * Every page in Imprint routes its width through this component. That is what
 * guarantees a shared left edge down the page — a header, a body panel and a
 * footer all line up because they all measure from here.
 *
 * Use it instead of Tailwind's `container` class. `container` snaps between
 * fixed max-widths at each breakpoint rather than shrinking smoothly, so one
 * pixel of window resize can shift content by up to 128px per side. These
 * widths are fluid and resize smoothly.
 *
 * Three widths are available, described on the `width` prop below.
 */

export type ContainerWidth = 'page' | 'reading' | 'form';

export interface ContainerProps extends React.HTMLAttributes<HTMLElement> {
  /** `page` (1280) is the default; `reading` (768) for prose; `form` (448). */
  width?: ContainerWidth;
  /** Rendered element — most call sites are section/nav/footer, not div. */
  as?: React.ElementType;
  /** Layout only: vertical padding, flex, margins. Not width or side padding. */
  className?: string;
  children: React.ReactNode;
}

/*
 * Side padding grows with the viewport.
 *
 * A flat px-5 was fine at phone widths and far too tight once the shell went
 * fluid: at ~1200 the content sat 20px off each edge, where the old stepped
 * `container` had been dropping to a 1024 max-width and leaving 88px of
 * accidental gutter. Same alignment, but room to breathe at the widths a
 * browser sidebar produces.
 */
const SHELL = 'w-full mx-auto px-5 sm:px-6 lg:px-10';

const widths: Record<ContainerWidth, string> = {
  page: 'max-w-7xl',
  reading: 'max-w-3xl',
  form: 'max-w-md',
};

/*
 * forwardRef is load-bearing, not boilerplate: ActionSection and CityStats both
 * hand this a ref that an IntersectionObserver watches to fade the section in.
 * Swallow the ref and the observer never fires and the section stays at
 * opacity-0 — invisible, with nothing in the console to say why.
 */
const Container = React.forwardRef<HTMLElement, ContainerProps>(function Container(
  { width = 'page', as: Component = 'div', className, children, ...rest },
  ref,
) {
  // The `as` union collapses `children` to `never` in JSX, and typing a
  // polymorphic forwardRef properly needs generic machinery that buys nothing
  // here. ContainerProps above is the surface callers actually see.
  const El = Component as 'div';
  const forwarded = ref as React.Ref<HTMLDivElement>;

  return (
    <El
      ref={forwarded}
      className={cn(SHELL, widths[width], className)}
      {...rest}
    >
      {children}
    </El>
  );
});

export default Container;
