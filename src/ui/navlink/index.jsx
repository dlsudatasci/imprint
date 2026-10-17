import NextLink from 'next/link';
import { useRouter } from 'next/router';

import { cn } from '../cn';

/**
 * Navigation link that marks itself when it points at the current page.
 *
 * Redesigned 16 Oct 2026 (apple-design: wayfinding by weight and colour, not
 * decoration): the current page is ink and semibold with `aria-current`, the
 * others muted until hovered. The underline that grew on hover is gone, and
 * so is the <p> that used to sit inside the link.
 *
 * Matches on the pathname, so /about?x=1 and /about#team still mark About.
 */
export function isCurrentPath(pathname, href) {
  return pathname === href;
}

export default function Link({ href, children, className, onClick }) {
  const router = useRouter();
  const current = isCurrentPath(router?.pathname, href);

  return (
    <NextLink
      href={href}
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'text-sm transition-colors duration-300 ease-in-out',
        'rounded-control focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        current ? 'font-semibold text-ink' : 'font-medium text-muted hover:text-ink',
        className,
      )}
    >
      {children}
    </NextLink>
  );
}
