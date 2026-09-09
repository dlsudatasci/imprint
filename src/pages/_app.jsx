import { Plus_Jakarta_Sans, Ysabeau } from 'next/font/google';
import './_app/globals.scss';
import "@/ui/annotation-tool/Toolstyles.css";
import { SessionProvider } from 'next-auth/react';

// Body and UI face. Variable weight 200-800.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

// Display face, headings only. Loaded at the weights the type scale uses
// rather than the full 1-1000 axis, to keep the payload down.
const ysabeau = Ysabeau({
  subsets: ['latin'],
  variable: '--font-ysabeau',
  display: 'swap',
  weight: ['500', '600', '700', '800'],
});

/**
 * Root wrapper for every page on the platform.
 *
 * Pulls `session` out of the page's props and passes it to SessionProvider, so
 * pages that load the session on the server render signed-in on first paint
 * rather than flashing a signed-out state.
 *
 * The <main> element here is the only one on the page — layouts use plain divs
 * — and modals find it by query to render into.
 */
export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <main className={`${jakarta.variable} ${ysabeau.variable} font-sans min-h-screen flex flex-col`}>
        <Component {...pageProps} />
      </main>
    </SessionProvider>
  );
}