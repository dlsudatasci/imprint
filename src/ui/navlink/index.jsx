import NextLink from 'next/link';
import { useRouter } from 'next/router';

import styles from './styles.module.css';

/**
 * Navigation link that highlights itself when it points at the current page.
 *
 * Matches on the full path including any query string or hash, so a link to
 * /about#team will not highlight while you are on /about. That is fine for the
 * top-level nav, where links are plain paths.
 */
export default function Link({ href, children }) {
  const router = useRouter();

  return (
    <NextLink href={href}>
      <p className={router.asPath === href ? styles.active : styles.link}><span>{children}</span></p>
    </NextLink>
  );
}
