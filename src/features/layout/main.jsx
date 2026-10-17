/**
 * Layout for the public pages: navbar, page content, footer.
 *
 * The counterpart to contribute.jsx, which adds the sign-in requirement. Pages
 * choose between them through the `contribute` flag on <Page>.
 *
 * Since 16 Oct 2026 the navbar here is sticky (a translucent bar the page
 * scrolls under), and a "Skip to content" link is the first thing Tab reaches,
 * since a bar that is always there is also always first in the tab order.
 * The contributor layout keeps the bar in the page.
 *
 * It sets no <title> (16 Oct 2026). It used to set one, "Imprint" unless told
 * otherwise, and since next/head keeps the last title rendered and this one
 * came after <Page>'s, every public page's tab read "Imprint" whatever title
 * the page asked for. <Page> sets the title.
 */
import Navbar from '@/features/navbarMain';
import Footer from '@/features/footerMain';

export const SKIP_LINK_TEXT = "Skip to content";

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-2xl focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {SKIP_LINK_TEXT}
      </a>
      <Navbar sticky />
      <div id="content" tabIndex={-1} className="flex-grow focus:outline-none">
        {children}
      </div>
      <Footer />
    </div>
  );
}
