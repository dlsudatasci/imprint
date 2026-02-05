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
