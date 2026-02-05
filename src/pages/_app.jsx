import { Inter } from 'next/font/google';
import './_app/globals.scss';
import "@/ui/annotation-tool/Toolstyles.css";
import { SessionProvider } from 'next-auth/react';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <main className={`${inter.variable} font-sans min-h-screen flex flex-col`}>
        <Component {...pageProps} />
      </main>
    </SessionProvider>
  );
}