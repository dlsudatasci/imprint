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

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* Two wobbly vertical bars — universal pause symbol */}
      <path d="M8.2 5.8C8.3 8.6 8.05 11.4 8.15 14.2C8.25 16.1 8.1 17.4 8.2 18.3" />
      <path d="M15.8 5.9C15.7 8.7 15.95 11.5 15.85 14.3C15.75 16.2 15.9 17.3 15.8 18.2" />
    </Icon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* A wobbly square — universal stop symbol */}
      <path d="M6.2 6.1C9.4 5.8 13.8 6.2 17.8 5.9C18.1 9.4 17.8 13.6 18.1 17.9C13.8 18.2 9.6 17.8 6.1 18.1C5.8 13.8 6.1 9.6 6.2 6.1Z" />
    </Icon>
  );
}

/* Phones and tablets (12 Oct 2026) */

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* A question mark in a wobbly circle: show the tour again */}
      <path d="M12.1 3.4C17 3.3 20.7 7 20.6 12C20.7 16.9 17 20.7 12 20.6C7.1 20.7 3.3 17 3.4 12.1C3.3 7.1 7.1 3.3 12.1 3.4Z" />
      <path d="M9.4 9.5C9.6 8.1 10.7 7.3 12.1 7.4C13.6 7.4 14.7 8.4 14.6 9.8C14.5 11.3 12.2 11.6 12.1 13.5" />
      <path d="M12.05 16.5H12.1" />
    </Icon>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* Four corners pointing out: the photo full screen */}
      <path d="M4.1 9.2C4 7.4 4.1 5.8 4.05 4.1C5.8 4 7.5 4.1 9.2 4.05" />
      <path d="M14.8 4.05C16.5 4.1 18.2 4 19.9 4.1C20 5.8 19.9 7.5 19.95 9.2" />
      <path d="M19.95 14.8C19.9 16.5 20 18.2 19.9 19.9C18.2 20 16.5 19.9 14.8 19.95" />
      <path d="M9.2 19.95C7.5 19.9 5.8 20 4.1 19.9C4 18.2 4.1 16.5 4.05 14.8" />
    </Icon>
  );
}

export function ShrinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* Four corners pointing in: leave full screen */}
      <path d="M4.1 9.1C5.8 9.2 7.5 9.1 9.15 9.15C9.2 7.5 9.1 5.8 9.15 4.1" />
      <path d="M14.85 4.1C14.9 5.8 14.8 7.5 14.85 9.15C16.5 9.1 18.2 9.2 19.9 9.1" />
      <path d="M19.9 14.9C18.2 14.8 16.5 14.9 14.85 14.85C14.8 16.5 14.9 18.2 14.85 19.9" />
      <path d="M9.15 19.9C9.1 18.2 9.2 16.5 9.15 14.85C7.5 14.9 5.8 14.8 4.1 14.9" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.6 7.1C9.4 6.8 14.8 7.2 19.4 6.9" />
      <path d="M9.4 6.9C9.5 5.9 9.4 5 9.6 4.2C11.2 4 12.9 4.1 14.4 4.2C14.6 5 14.5 5.9 14.6 6.9" />
      <path d="M6.4 7.2C6.6 11.4 6.9 15.8 7.3 19.8C10.4 20.1 13.7 20 16.7 19.8C17.1 15.7 17.4 11.3 17.6 7.1" />
      <path d="M10.2 10.6C10.25 12.6 10.3 14.6 10.4 16.4" />
      <path d="M13.8 10.6C13.75 12.6 13.7 14.6 13.6 16.4" />
    </Icon>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.3 5.4C6.9 6.9 5.5 8.3 4.2 9.6C5.6 11 7 12.3 8.4 13.8" />
      <path d="M4.4 9.6C8 9.4 11.6 9.5 15 9.6C18 9.8 20 11.8 19.9 14.4C19.8 17 17.8 18.7 15.1 18.6C12.9 18.5 10.8 18.6 8.7 18.55" />
    </Icon>
  );
}

export function PhotoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.1 5.6C9.3 5.3 14.8 5.7 19.9 5.4C20.2 9.6 19.9 14.3 20.1 18.5C14.8 18.8 9.4 18.4 4 18.6C3.8 14.3 4.1 9.8 4.1 5.6Z" />
      <path d="M4.3 15.9C6 14.2 7.6 12.6 9.1 11.3C11 13 12.8 14.8 14.6 16.6" />
      <path d="M13.2 14.9C14.3 13.9 15.3 13 16.3 12.2C17.6 13.3 18.8 14.5 19.9 15.7" />
      <path d="M15.4 8.6H15.5" />
    </Icon>
  );
}

export function PointMinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* A point with a minus: delete the selected point of an outline */}
      <path d="M12.1 5.1C16 5 19 8 18.9 12C19 15.9 16 19 12 18.9C8.1 19 5 16 5.1 12.1C5 8.1 8.1 5 12.1 5.1Z" />
      <path d="M8.9 12.05C11 11.95 13.1 12.1 15.1 12" />
    </Icon>
  );
}
