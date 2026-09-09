import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import Navbar from "@/features/navbarMain";
import Footer from "@/features/footerMain";
import ContentSkeleton from "./contentSkeleton";

/**
 * Layout for every signed-in page, used by any page that passes `contribute`
 * to <Page>.
 *
 * Shows a skeleton while the session loads, then sends anyone without one to
 * /login.
 *
 * That redirect is a convenience, not a security boundary — it runs in the
 * browser and can be bypassed. Real enforcement is server-side: every endpoint
 * these pages call checks the session itself.
 */
export default function Layout({ children }) {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.push("/login");
    }
  }, [session, loading, router]);

  // Plain <div>, not <main>: _app.jsx already wraps every page in a <main>,
  // and nesting them is invalid HTML. It also matters functionally — the
  // annotate modals portal into document.querySelector('main'), which would
  // otherwise resolve to whichever one happened to come first.
  const shell = (content) => (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex-grow">{content}</div>
      <Footer />
    </div>
  );

  // The chrome renders either way, so the page doesn't flash in from blank once
  // the session lands. `!session` is a redirect already in flight.
  if (loading) return shell(<ContentSkeleton />);
  if (!session) return shell(null);

  return shell(children);
}
