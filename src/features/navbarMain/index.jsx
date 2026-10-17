import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import NavLink from "@/ui/navlink";
import Logo from "@/ui/logo";
import { Button, IconButton, cn } from "@/ui";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useScrolled } from "@/hooks/useScrolled";
import { useSession, signOut } from "next-auth/react";
import { LogOutIcon, MenuIcon, CloseIcon, AlertIcon, Container } from "@/ui";
import { clearSession, readTotalCount, readCurrentCount, readTutorialFlag } from "@/util/sessionCache";
import { NAV_COPY as COPY, PUBLIC_LINKS, annotateShortcut, notificationHistory, historyDate } from "./navCopy";

/**
 * The site navbar, used on both public and contributor pages.
 *
 * What it shows depends on who is looking. Signed out, it offers Volunteer.
 * Signed in, it swaps in the profile menu and notifications, and adds the
 * annotate shortcut only once the tutorial and profile are both complete. That
 * last condition matches the dashboard's, so the navbar can't be used to skip
 * onboarding (annotateShortcut in navCopy.js).
 *
 * Volunteer is hidden on /login and /register, where a prompt to sign up is
 * noise.
 *
 * Redesigned 16 Oct 2026 (apple-design, IMPRINT_public_redesign.md):
 * - A 64 px bar (`h-16`, was 70 px on a phone and 110 px from 768 px). On the
 *   public pages it is `sticky` and made of `.nav-material` (globals.scss):
 *   the page ground at 72% over a blur, with a scroll-edge line only once the
 *   page has scrolled under it. The contributor layout keeps it in the page
 *   (`sticky` false), so nothing floats over the annotation tool or the
 *   tutorial's tour.
 * - The current page is marked by weight and colour (NavLink), and Volunteer
 *   is the bar's one filled button.
 * - Menus open from their button (transform-origin at the trigger), close on
 *   Escape, on a click outside, and when the page changes. A closed menu is
 *   `inert`, so Tab never lands in it.
 * - The notification tray shows what is real: the profile reminder when the
 *   profile is unfinished, then under Earlier the user's last three entries
 *   of their own activity feed (notificationHistory), fetched from
 *   /api/extractUser the first time the tray opens. The greyed "Welcome to
 *   Imprint!" and "Profile Completed" entries it replaced were the same
 *   static text for everyone.
 * - On a phone the menu is a panel under the bar, full width, with rows at
 *   least 48 px tall.
 */
export default function Nav({ sticky = false }) {
  const router = useRouter();
  const isAuthPage = router.pathname === '/login' || router.pathname === '/register';
  const { status, data: session } = useSession();
  const [menuState, setMenuState] = useState(false);               // Phone menu
  const [profileMenuState, setProfileMenuState] = useState(false); // Account dropdown
  const [notificationMenuState, setNotificationMenuState] = useState(false); // Notifications dropdown
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isTutorialSession, setIsTutorialSession] = useState(false);
  const [history, setHistory] = useState(null); // null until the tray first opens
  const scrolled = useScrolled(0);

  const hasCompletedDemo = session?.user?.hasCompletedTutorial === true;
  const profileIncomplete = session?.user?.isProfileIncomplete === true;

  useEffect(() => {
    if (status !== "authenticated") return;

    if (readTotalCount() !== null && readCurrentCount() !== null) {
      if (readTutorialFlag()) {
        setIsTutorialSession(true);
        setHasActiveSession(false);
      } else {
        setHasActiveSession(true);
        setIsTutorialSession(false);
      }
      return;
    }

    let cancelled = false;

    fetch("/api/annotationGet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setHasActiveSession(!!data.isExistingSession);
      })
      .catch((err) => console.error("Failed to check session in navbar", err));

    return () => {
      cancelled = true;
    };
  }, [status]);

  // The history is read once, the first time the tray opens, not on every page.
  // A ref, not the state, marks it as asked for: setting state here would rerun
  // this effect and its cleanup would drop the answer.
  const historyAsked = useRef(false);
  useEffect(() => {
    if (!notificationMenuState || status !== "authenticated" || historyAsked.current) return;
    historyAsked.current = true;
    fetch("/api/extractUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHistory(notificationHistory(data?.userActivities)))
      .catch((err) => console.error("Failed to load notifications", err));
  }, [notificationMenuState, status]);

  const closeAll = useCallback(() => {
    setMenuState(false);
    setProfileMenuState(false);
    setNotificationMenuState(false);
  }, []);

  // Escape closes whichever menu is open
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeAll(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAll]);

  // A new page closes them too (Back, or a link that does not close its menu)
  useEffect(() => {
    const events = router.events;
    if (!events?.on) return undefined;
    events.on("routeChangeStart", closeAll);
    return () => events.off("routeChangeStart", closeAll);
  }, [router.events, closeAll]);

  const mobileNavRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const notificationDropdownRef = useRef(null);

  const closeMenu = useCallback(() => setMenuState(false), []);
  const closeProfile = useCallback(() => setProfileMenuState(false), []);
  const closeNotifications = useCallback(() => setNotificationMenuState(false), []);
  useOutsideClick(mobileNavRef, closeMenu);
  useOutsideClick(profileDropdownRef, closeProfile);
  useOutsideClick(notificationDropdownRef, closeNotifications);

  const logoutFunction = () => {
    clearSession();
    signOut();
  };

  const shortcut = status === "authenticated"
    ? annotateShortcut({
      pathname: router.pathname,
      profileIncomplete,
      hasCompletedDemo,
      isTutorialSession,
      hasActiveSession,
    })
    : null;

  // The dropdowns grow from their button and fade, over 200 ms. Reduced motion: fade only.
  const dropdown = (open) => cn(
    "absolute right-0 top-full mt-2 z-20 rounded-card border border-line bg-surface shadow-2xl overflow-hidden origin-top-right",
    "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-opacity",
    open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 motion-reduce:scale-100 pointer-events-none",
  );

  return (
    <header
      data-navbar-bar
      data-scrolled={sticky && scrolled ? "true" : "false"}
      className={cn("z-50", sticky ? "sticky top-0 nav-material" : "relative")}
    >
      <Container as="nav" aria-label={COPY.navLabel} className="flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label={COPY.homeLabel} className="rounded-control focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <Logo height={28} subTitle={"Imprint"} />
        </Link>

        {/* Laptop and up */}
        <div className="hidden md:flex flex-grow justify-end items-center gap-6">
          <ul className="flex m-0 p-0 list-none items-center gap-6">
            {PUBLIC_LINKS.map((l) => (
              <li key={l.href}><NavLink href={l.href}>{l.label}</NavLink></li>
            ))}
          </ul>

          {status === "unauthenticated" && !isAuthPage && (
            <Link href="/contribute" tabIndex={-1}>
              <Button size="sm">{COPY.volunteer}</Button>
            </Link>
          )}

          {status === "authenticated" && (
            <div className="flex items-center gap-3">
              {shortcut && (
                <Link href={shortcut.href} tabIndex={-1}>
                  <Button variant="secondary" size="sm" className="whitespace-nowrap">{shortcut.label}</Button>
                </Link>
              )}

              {/* Notifications */}
              <div className="relative flex items-center" ref={notificationDropdownRef}>
                <IconButton
                  onClick={() => { setNotificationMenuState((o) => !o); setProfileMenuState(false); }}
                  aria-label={COPY.notifications}
                  aria-expanded={notificationMenuState}
                  aria-controls="nav-notifications"
                  size="sm"
                  round
                  className="relative"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                  </svg>
                  {profileIncomplete && (
                    <span data-notification-dot className="absolute top-0.5 right-0.5 block h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />
                  )}
                </IconButton>

                <div id="nav-notifications" inert={!notificationMenuState} className={cn(dropdown(notificationMenuState), "w-72 p-2")}>
                  <p className="px-3 pt-2 pb-1 text-sm font-semibold text-ink">{COPY.notifications}</p>
                  {profileIncomplete && (
                    <Link
                      href="/complete-profile"
                      className="flex items-start gap-3 rounded-control px-3 py-3 hover:bg-warning-soft transition-colors duration-300"
                      onClick={closeNotifications}
                    >
                      <AlertIcon size={18} className="text-warning mt-0.5 shrink-0" />
                      <span>
                        <span className="block text-sm font-semibold text-ink">{COPY.profileTitle}</span>
                        <span className="block text-xs text-muted mt-0.5">{COPY.profileText}</span>
                      </span>
                    </Link>
                  )}
                  {!profileIncomplete && (
                    <p className="px-3 py-2 text-sm text-muted">{COPY.noNotifications}</p>
                  )}
                  {history?.length > 0 && (
                    <div data-notification-history className="mt-1 border-t border-line-card pt-2">
                      <p className="px-3 pb-1 text-xs font-semibold text-muted">{COPY.earlier}</p>
                      <ul>
                        {history.map((h) => (
                          <li key={`${h.time}-${h.title}`} className="flex items-start justify-between gap-3 px-3 py-2">
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-body">{h.title}</span>
                              {h.text && <span className="block text-xs text-muted mt-0.5">{h.text}</span>}
                            </span>
                            <span className="shrink-0 text-xs text-subtle tabular-nums">{historyDate(h.time)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Account */}
              <div className="relative flex items-center" ref={profileDropdownRef}>
                <IconButton
                  onClick={() => { setProfileMenuState((o) => !o); setNotificationMenuState(false); }}
                  aria-label={COPY.account}
                  aria-expanded={profileMenuState}
                  aria-controls="nav-account"
                  size="sm"
                  round
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                </IconButton>

                <div id="nav-account" inert={!profileMenuState} className={cn(dropdown(profileMenuState), "w-60 p-2")}>
                  <p className="px-3 pt-2 pb-2 mb-1 text-xs font-medium text-muted truncate border-b border-line-card">
                    {session?.user?.email || session?.user?.username || COPY.signedIn}
                  </p>
                  <Link
                    href="/contribute"
                    className="flex items-center w-full px-3 py-2.5 text-sm font-medium text-ink rounded-control hover:bg-surface-subtle transition-colors duration-300"
                    onClick={closeProfile}
                  >
                    {COPY.dashboard}
                  </Link>
                  {/* eslint-disable-next-line react/forbid-elements -- dropdown menu item, not a standalone button */}
                  <button
                    type="button"
                    className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-sm font-medium text-danger rounded-control hover:bg-danger-soft transition-colors duration-300"
                    onClick={logoutFunction}
                  >
                    <LogOutIcon size={16} />
                    <span>{COPY.logout}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Phones and small tablets */}
        <div ref={mobileNavRef} className="md:hidden flex items-center">
          {/* Neutral, not danger: red is reserved for logout and delete, and a
              menu toggle destroys nothing. */}
          <IconButton
            onClick={() => setMenuState((o) => !o)}
            aria-label={menuState ? COPY.closeMenu : COPY.openMenu}
            aria-expanded={menuState}
            aria-controls="nav-mobile"
            size="sm"
            className="relative"
          >
            {menuState ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
            {!menuState && profileIncomplete && (
              <span className="absolute -top-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />
            )}
          </IconButton>

          <div
            id="nav-mobile"
            inert={!menuState}
            className={cn(
              "absolute left-0 right-0 top-full border-y border-line bg-surface shadow-2xl origin-top",
              "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-opacity",
              menuState ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 motion-reduce:translate-y-0 pointer-events-none",
            )}
          >
            <Container as="ul" className="m-0 list-none py-2">
              {PUBLIC_LINKS.map((l) => (
                <li key={l.href}>
                  <NavLink href={l.href} onClick={closeMenu} className="flex min-h-[48px] items-center text-base border-b border-line-card">
                    {l.label}
                  </NavLink>
                </li>
              ))}

              {status === "unauthenticated" && !isAuthPage && (
                <li className="pt-4 pb-2">
                  <Link href="/contribute" onClick={closeMenu} tabIndex={-1}>
                    <Button fullWidth>{COPY.volunteer}</Button>
                  </Link>
                </li>
              )}

              {status === "authenticated" && (
                <>
                  {shortcut && (
                    <li>
                      <Link href={shortcut.href} onClick={closeMenu} className="flex min-h-[48px] items-center text-base font-semibold text-primary border-b border-line-card">
                        {shortcut.label}
                      </Link>
                    </li>
                  )}
                  <li>
                    <Link href="/contribute" onClick={closeMenu} className="flex min-h-[48px] items-center text-base font-medium text-ink border-b border-line-card">
                      {COPY.dashboard}
                    </Link>
                  </li>
                  {profileIncomplete && (
                    <li>
                      <Link href="/complete-profile" onClick={closeMenu} className="flex min-h-[48px] items-center gap-2 text-base font-medium text-warning border-b border-line-card">
                        <AlertIcon size={16} className="shrink-0" />
                        {COPY.profileTitle}
                      </Link>
                    </li>
                  )}
                  <li>
                    {/* eslint-disable-next-line react/forbid-elements -- menu row, not a standalone button */}
                    <button type="button" className="flex min-h-[48px] w-full items-center gap-2 text-left text-base font-medium text-danger" onClick={logoutFunction}>
                      <LogOutIcon size={16} />
                      {COPY.logout}
                    </button>
                  </li>
                </>
              )}
            </Container>
          </div>
        </div>
      </Container>
    </header>
  );
}
