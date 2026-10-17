import Head from 'next/head';

import MainLayout from '@/features/layout/main';
import ContributeLayout from '@/features/layout/contribute';
import { tokens } from '../tokens';

/** Used when a page gives no description of its own (16 Oct 2026). */
export const DEFAULT_DESCRIPTION =
  "Imprint is a crowdsourcing platform for mapping what gets in the way on Metro Manila's sidewalks.";

/** The page ground, for the browser's own toolbar colour on phones. */
const THEME_COLOR = tokens.color.ground;

/**
 * Page shell: sets the browser tab title and description, and picks a layout.
 *
 * The `contribute` flag chooses between the public layout and the contributor
 * one. It does more than change the navbar: the contributor layout requires a
 * signed-in session and redirects to /login without one. Setting `contribute`
 * is therefore how a page declares itself sign-in only.
 *
 * The icon's path is absolute (16 Oct 2026). It was "images/logo/browser.jpg",
 * which a browser resolves against the page's own folder, so every page under
 * /contribute asked for /contribute/images/logo/browser.jpg and got no icon.
 */
export default function Page({
  children, title, description, contribute,
}) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description || DEFAULT_DESCRIPTION} />
        <meta name="theme-color" content={THEME_COLOR} />
        <link rel="icon" href="/images/logo/browser.jpg" />
      </Head>

      {!contribute ? (
        <MainLayout>{children}</MainLayout>
      ) : (
        <ContributeLayout>{children}</ContributeLayout>
      )}
    </>
  );
}
