import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import NavLink from "@/ui/navlink";
import Logo from "@/ui/logo";
import { Button, IconButton } from "@/ui";
import styles from "@/ui/styles/navMenu.module.css";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useSession, signOut } from "next-auth/react";
import { LogOutIcon, MenuIcon, AlertIcon, Container } from "@/ui";
import { clearSession, readTotalCount, readCurrentCount } from "@/util/sessionCache";

/**
 * The site navbar, used on both public and contributor pages.
 *
 * What it shows depends on who is looking. Signed out, it offers Volunteer.
 * Signed in, it swaps in the profile menu and notifications, and adds the
 * annotate shortcut only once the tutorial and profile are both complete. That
 * last condition matches the dashboard's, so the navbar can't be used to skip
 * onboarding.
 *
 * Hidden entirely on /login and /register, where a prompt to sign up is noise.
 */
export default function Nav() {
  const router = useRouter();
  const isAuthPage = router.pathname === '/login' || router.pathname === '/register';
  const { status, data: session } = useSession();
  const [menuState, setMenuState] = useState(false);               // Mobile hamburger menu state
  const [profileMenuState, setProfileMenuState] = useState(false); // Desktop profile dropdown state
  const [notificationMenuState, setNotificationMenuState] = useState(false); // Notifications dropdown state
  const [hasActiveSession, setHasActiveSession] = useState(false);

  // Read straight from the session on every render, rather than inside the
  // effect below. The effect only re-runs when sign-in status changes, so
  // finishing the tutorial would not reveal the annotate link until a reload.
  const hasCompletedDemo = session?.user?.hasCompletedTutorial === true;

  useEffect(() => {
    if (status !== "authenticated") return;

    if (readTotalCount() !== null && readCurrentCount() !== null) {
      setHasActiveSession(true);
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

  const menuToggle = () => {
    setMenuState(!menuState);
  };

  const profileToggle = () => {
    setProfileMenuState(!profileMenuState);
  };

  const notificationToggle = () => {
    setNotificationMenuState(!notificationMenuState);
  };

  const mobileNavRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const notificationDropdownRef = useRef(null);

  useOutsideClick(mobileNavRef, () => {
    setMenuState(false);
  });

  useOutsideClick(profileDropdownRef, () => {
    setProfileMenuState(false);
  });

  useOutsideClick(notificationDropdownRef, () => {
    setNotificationMenuState(false);
  });

  const logoutFunction = () => {
    clearSession();
    signOut();
  };

  return (
    <Container as="nav" className="flex items-center justify-between py-5 md:py-10 z-50 relative">
      <div>
        <Link href="/">
          <Logo height={30} subTitle={"Imprint"} />
        </Link>
      </div>
      <div className="hidden md:flex flex-grow justify-end items-center gap-2 md:gap-5">
        <ul className="flex align-bottom m-0 p-0 list-none items-center gap-2 md:gap-5">
          <li><NavLink href="/">Home</NavLink></li>
          <li><NavLink href="/about">About</NavLink></li>
          {/* <li><NavLink href="/demo">Demo</NavLink></li> */}

          {/* Conditional Contribute Link */}
          {status === "unauthenticated" && !isAuthPage && (
            <li>
              <Link href="/contribute">
                <Button variant="secondary" size="sm">Volunteer</Button>
              </Link>
            </li>
          )}
        </ul>

        {/* Conditional Profile Icon Dropdown */}
        {status === "authenticated" && (
          <div className="flex items-center gap-2 md:gap-5">
            {/* Notification Bell */}
            <div className="relative flex items-center" ref={notificationDropdownRef}>
              <IconButton
                onClick={notificationToggle}
                aria-label="Notifications"
                round
                className="relative"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                {/* The notification tray has no real backend — the only live
                    item is the profile-completion nudge, and the rest are
                    static placeholders. The dot tracks that one item. */}
                {session?.user?.isProfileIncomplete && (
                  <span className="absolute top-0.5 right-0.5 block h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface"></span>
                )}
              </IconButton>

              <div
                className={`absolute right-0 top-full mt-2 w-72 z-20 rounded-card shadow-2xl bg-surface border border-line transition-all duration-300 ease-in-out origin-top-right overflow-hidden p-2 ${notificationMenuState
                  ? "opacity-100 scale-100 pointer-events-auto"
                  : "opacity-0 scale-95 pointer-events-none"
                  }`}
              >
                <div className="px-3 py-2 mb-1">
                  <p className="text-sm font-extrabold text-ink tracking-tight">Notifications</p>
                </div>
                <ul className="flex flex-col m-0 list-none">
                  {!session?.user?.isProfileIncomplete && (
                    <li className="px-3 py-2 mb-2 border-b border-line-card">
                      <p className="text-xs text-muted text-center italic">No new notifications for now</p>
                    </li>
                  )}

                  {session?.user?.isProfileIncomplete && (
                    <li>
                      <Link 
                        href="/complete-profile" 
                        className="block px-3 py-3 rounded-control hover:bg-warning-soft transition-colors duration-300 border border-transparent hover:border-warning-border"
                        onClick={() => setNotificationMenuState(false)}
                      >
                        <div className="flex items-start">
                          <AlertIcon size={18} className="text-warning mr-3 mt-0.5" />
                          <div>
                            <p className="text-sm font-bold text-ink">Pending Tasks</p>
                            <p className="text-xs text-muted mt-0.5">Complete your profile to unlock all mapping features.</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  )}

                  {/* Past greyed-out notifications (Earliest at the bottom) */}
                  {(!session?.user?.isProfileIncomplete) && (
                    <li className="opacity-50 grayscale pointer-events-none">
                      <div className="block px-3 py-3 rounded-control transition-all">
                        <div>
                          <p className="text-sm font-bold text-body">Profile Completed</p>
                          <p className="text-xs text-muted mt-0.5">You&apos;re all set to start mapping.</p>
                        </div>
                      </div>
                    </li>
                  )}
                  
                  <li className="opacity-50 grayscale pointer-events-none">
                    <div className="block px-3 py-3 rounded-control transition-all">
                      <div>
                        <p className="text-sm font-bold text-body">Welcome to Imprint!</p>
                        <p className="text-xs text-muted mt-0.5">Thanks for joining our community.</p>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            {/* Let's Annotate Button */}
            {(router.pathname !== '/contribute' && router.pathname !== '/contribute/annotate' && !session?.user?.isProfileIncomplete && hasCompletedDemo) && (
              <div className="hidden md:block">
                <Link href="/contribute/annotate">
                  <Button variant="secondary" size="sm" className="whitespace-nowrap">
                    {hasActiveSession ? "Resume Session" : "Let's Annotate!"}
                  </Button>
                </Link>
              </div>
            )}

            <div className="relative flex items-center" ref={profileDropdownRef}>
              <IconButton onClick={profileToggle} aria-label="Account menu" round>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </IconButton>

              <div
                className={`absolute right-0 top-full mt-2 w-56 z-20 rounded-card shadow-2xl bg-surface border border-line transition-all duration-300 ease-in-out origin-top-right overflow-hidden ${profileMenuState
                  ? "opacity-100 scale-100 pointer-events-auto translate-y-0"
                  : "opacity-0 scale-95 pointer-events-none -translate-y-2"
                  }`}
              >
                <div className="p-2 flex flex-col m-0 list-none gap-1">
                  <div className="px-3 py-2 border-b border-line-card mb-1">
                    <p className="text-sm font-semibold text-ink truncate">
                      {session?.user?.email || session?.user?.name || "Signed In"}
                    </p>
                  </div>
                  <Link
                    href="/contribute"
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-body font-medium hover:bg-surface-subtle rounded-control transition-colors duration-300 group"
                    onClick={() => setProfileMenuState(false)}
                  >
                    <span className="group-hover:text-primary transition-colors">Dashboard</span>
                  </Link>
                  {/* eslint-disable-next-line react/forbid-elements -- dropdown menu item, not a standalone button */}
                  <button
                    type="button"
                    className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-danger font-medium hover:bg-danger-soft rounded-control transition-colors duration-300"
                    onClick={logoutFunction}
                  >
                    <LogOutIcon size={18} />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Nav */}
      <div
        ref={mobileNavRef}
        className="flex flex-grow align-middle justify-end md:hidden"
      >
        {/* Neutral, not danger: red is reserved for logout and delete, and a
            menu toggle destroys nothing. */}
        <IconButton
          onClick={() => menuToggle()}
          aria-label={menuState ? "Close menu" : "Open menu"}
          aria-expanded={menuState}
          className="mr-2 z-10"
        >
          <MenuIcon size={20} />
        </IconButton>
        <div
          className={
            menuState
              ? "transition-all duration-300 ease-in-out absolute mt-16 mr-5 cursor-default z-20 rounded-control bg-surface border border-line focus:outline-none"
              : "absolute opacity-0 left-0 h-0 w-0 cursor-default z-0"
          }
        >
          <ul className={`${styles.ul} ${menuState ? "block" : "hidden"}`}>
            <li><Link href="/" onClick={() => setMenuState(false)}>Home</Link></li>
            <li><Link href="/about" onClick={() => setMenuState(false)}>About</Link></li>
            {/* <li><Link href="/demo" onClick={() => setMenuState(false)}>Demo</Link></li> */}
            {status === "unauthenticated" && !isAuthPage && (
              <li>
                <Link href="/contribute" onClick={() => setMenuState(false)} className="font-bold text-primary">Volunteer</Link>
              </li>
            )}
            {status === "authenticated" && (
              <>
                <hr className="my-1 border-line" />
                {(!session?.user?.isProfileIncomplete && hasCompletedDemo) && (
                  <li>
                    <Link href="/contribute/annotate" onClick={() => setMenuState(false)} className="text-primary font-bold">
                      {hasActiveSession ? "Resume Session" : "Let's Annotate!"}
                    </Link>
                  </li>
                )}
                <li>
                  <Link href="/contribute" onClick={() => setMenuState(false)} className="text-body">Dashboard</Link>
                </li>
                {session?.user?.isProfileIncomplete && (
                  <li>
                    <Link href="/complete-profile" onClick={() => setMenuState(false)} className="flex items-center text-warning font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-1">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Pending Tasks
                    </Link>
                  </li>
                )}
                <li>
                  {/* eslint-disable-next-line react/forbid-elements -- dropdown menu item, not a standalone button */}
                  <button type="button" className="w-full text-left text-red-600 font-medium" onClick={logoutFunction}>
                    Logout
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </Container>
  );
}
