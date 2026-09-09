/**
 * Layout for the public pages: navbar, page content, footer.
 *
 * The counterpart to contribute.jsx, which adds the sign-in requirement. Pages
 * choose between them through the `contribute` flag on <Page>.
 */
import Navbar from '@/features/navbarMain';
import Footer from '@/features/footerMain';
import Head from 'next/head';

export default function Layout({ children, title = "Imprint" }) {
  return (
    <div className="">
      <Head>
        <title>{title}</title>
      </Head>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
