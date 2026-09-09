import Head from 'next/head';

import MainLayout from '@/features/layout/main';
import ContributeLayout from '@/features/layout/contribute';

/**
 * Page shell: sets the browser tab title and description, and picks a layout.
 *
 * The `contribute` flag chooses between the public layout and the contributor
 * one. It does more than change the navbar: the contributor layout requires a
 * signed-in session and redirects to /login without one. Setting `contribute`
 * is therefore how a page declares itself sign-in only.
 */
export default function Page({
  children, title, description, contribute,
}) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="icon" href="images/logo/browser.jpg" />
      </Head>

      {!contribute ? (
        <MainLayout>{children}</MainLayout>
      ) : (
        <ContributeLayout>{children}</ContributeLayout>
      )}
    </>
  );
}
