import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import Navbar from "@/features/navbarMain";
import Footer from "@/features/footerMain";
import ContentSkeleton from "./contentSkeleton";
import { SiteChromeContext } from "./siteChrome";

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
 *
 * A page can take the navbar and footer away (useHideSiteChrome, 12 Oct 2026):
 * the annotation screen on phones and tablets covers the page, and the navbar
 * used to paint over its top bar.
 */
export default function Layout({ children }) {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const chrome = useMemo(() => ({ hidden, setHidden }), [hidden]);

  useEffect(() => {
    if (!loading && !session) {
      router.push("/login");
    }
  }, [session, loading, router]);

  // Plain <div>, not <main>: _app.jsx already wraps every page in a <main>,
  // and nesting them is invalid HTML. It also matters functionally — the
  // annotate modals portal into document.querySelector('main'), which would
  // otherwise resolve to whichever one happened to come first.
  //
  // With the chrome hidden only the page is rendered: no navbar, no footer and
  // no min-height. The page keeps its place in the tree either way (the same
  // two divs around it), so hiding the chrome never rebuilds the page, which
  // would throw away the annotation tool's unsaved state.
  const shell = (content) => (
    <SiteChromeContext.Provider value={chrome}>
      <div className={hidden ? undefined : "flex flex-col min-h-screen"}>
        {!hidden && <Navbar />}
        <div className={hidden ? undefined : "flex-grow"}>{content}</div>
        {!hidden && <Footer />}
      </div>
    </SiteChromeContext.Provider>
  );

  // The chrome renders either way, so the page doesn't flash in from blank once
  // the session lands. `!session` is a redirect already in flight.
  if (loading) return shell(<ContentSkeleton />);
  if (!session) return shell(null);

  return shell(children);
}
