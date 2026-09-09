import React from 'react';
import { cn } from '../cn';

/**
 * Imprint's icon set.
 *
 * Drawn by hand rather than taken from a library, so they match the crayon
 * style of the loading animation. A uniform geometric icon set would look
 * borrowed next to it.
 *
 * The wobble is built into the path geometry rather than applied by an SVG
 * filter, so each icon stands alone with nothing extra to mount on the page.
 * Strokes use `currentColor` and take their colour from surrounding text.
 *
 * Keep the set small. An icon should do work the label can't do on its own —
 * decoration beside a heading is not worth an icon.
 */

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  /** Rendered square, in px. */
  size?: number;
  className?: string;
  /**
   * Accessible name. Leave unset for icons that sit next to a text label —
   * they're decorative and get aria-hidden instead.
   */
  title?: string;
}

function Icon({ size = 24, className, title, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7.2C8 6.8 15 7.4 20 6.9" />
      <path d="M4 12.1C9 11.7 16 12.4 20 11.9" />
      <path d="M4 17C7 16.6 14 17.3 19.4 16.8" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.2 6C10 10 14 13.6 18.1 17.9" />
      <path d="M17.9 6.1C14 10 10 13.7 6.1 18" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.8 9.3C8.4 11.6 10.2 13.9 12.1 15.4C14 13.8 16 11.4 18.3 9.2" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.8 12.4C6.4 13.9 8 15.6 9.7 17.8C12.8 13 16.2 8.6 19.4 5.6" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.4 12.2C5.5 7.4 8.8 5.4 12.1 5.4C15.5 5.4 18.9 7.6 21.6 12.1C18.7 16.6 15.4 18.8 12 18.7C8.6 18.6 5.3 16.5 2.4 12.2Z" />
      <path d="M12.1 9.1C13.9 9.1 15.2 10.5 15.2 12.2C15.2 13.9 13.8 15.2 12 15.1C10.3 15.1 9 13.7 9.05 12C9.1 10.4 10.4 9.1 12.1 9.1Z" />
    </Icon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.4 12.2C5.5 7.4 8.8 5.4 12.1 5.4C15.5 5.4 18.9 7.6 21.6 12.1C18.7 16.6 15.4 18.8 12 18.7C8.6 18.6 5.3 16.5 2.4 12.2Z" />
      <path d="M12.1 9.1C13.9 9.1 15.2 10.5 15.2 12.2C15.2 13.9 13.8 15.2 12 15.1C10.3 15.1 9 13.7 9.05 12C9.1 10.4 10.4 9.1 12.1 9.1Z" />
      <path d="M3.6 3.9C8.5 8.6 14.2 14.4 20.3 20.2" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.6 4.2C11 4 8.4 4.1 6.1 4.3C5.9 9.4 5.8 14.8 6.05 19.7C8.5 19.9 11.1 19.9 13.7 19.7" />
      <path d="M10.4 12.1C13.6 11.9 17.4 12.2 20.8 12" />
      <path d="M17.6 8.6C18.7 9.8 19.8 11 20.9 12.05C19.7 13.2 18.6 14.3 17.5 15.5" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.1 3.9C12.9 4.6 13.6 6 14.4 7.5C16.6 11.4 19 15.6 21 19.2C15 19.6 8.8 19.6 3.1 19.2C5.2 15.5 7.7 11.2 9.9 7.3C10.6 6 11.4 4.6 12.1 3.9Z" />
      <path d="M12 9.6C12.05 11.2 12 12.9 11.95 14.4" />
      <path d="M11.98 16.9H12.02" />
    </Icon>
  );
}
