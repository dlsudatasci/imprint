import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import NavLink from "@/ui/navlink";
import Logo from "@/ui/logo";
import Button from "@/ui/buttons/Button";
import styles from "./styles.module.css";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useSession, signOut } from "next-auth/react";

export default function Nav() {
  const router = useRouter();
  const isAuthPage = router.pathname === '/login' || router.pathname === '/register';
  const { status, data: session } = useSession();
  const [menuState, setMenuState] = useState(false);               // Mobile hamburger menu state
  const [profileMenuState, setProfileMenuState] = useState(false); // Desktop profile dropdown state
  const [notificationMenuState, setNotificationMenuState] = useState(false); // Notifications dropdown state

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
    window.localStorage.setItem("annotationTotalCount", null);
    window.localStorage.setItem("annotationCurrentCount", null);
    window.localStorage.setItem("annotationSetData", null);
    signOut();
  };

  return (
    <nav className="flex items-center justify-between container mx-auto px-1 md:px-5 py-5 md:py-10 z-50 relative">
      <div>
        <Link href="/">
          <Logo height={30} subTitle={"Imprint"} />
        </Link>
      </div>
      <div className="hidden md:flex flex-grow justify-end items-center">
        <ul className="flex align-bottom m-0 p-0 list-none items-center">
          <li className="mr-2 md:mr-5"><NavLink href="/">Home</NavLink></li>
          <li className="mr-2 md:mr-5"><NavLink href="/about">About</NavLink></li>
          <li className="mr-2 md:mr-5"><NavLink href="/demo">Demo</NavLink></li>
          {status === "authenticated" && (
            <li className="mr-2 md:mr-5"><NavLink href="/contribute">Dashboard</NavLink></li>
          )}

          {/* Conditional Contribute Link */}
          {status === "unauthenticated" && !isAuthPage && (
            <li className="ml-2">
              <Link href="/contribute" className="font-bold text-primary hover:text-white border-2 border-primary hover:bg-primary px-6 py-2.5 rounded-full shadow-sm hover:shadow-md transition-all duration-300">
                Volunteer
              </Link>
            </li>
          )}
        </ul>

        {/* Conditional Profile Icon Dropdown */}
        {status === "authenticated" && (
          <div className="flex items-center gap-2 md:gap-5">
            {/* Notification Bell */}
            <div className="relative flex items-center" ref={notificationDropdownRef}>
              <button 
                onClick={notificationToggle}
                className="relative flex items-center justify-center h-10 w-10 md:h-12 md:w-12 text-gray-500 hover:text-gray-800 focus:outline-none transition-colors"
                title="Notifications"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6 text-gray-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                {session?.user?.isProfileIncomplete && (
                  <span className="absolute top-1 right-1 md:top-1.5 md:right-1.5 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"></span>
                )}
              </button>

              <div
                className={`absolute right-0 top-full mt-2 w-72 z-20 rounded-[1.5rem] shadow-[0_4px_40px_rgb(0,0,0,0.06)] bg-white border border-gray-100 transition-all duration-300 ease-in-out origin-top-right overflow-hidden p-2 ${notificationMenuState
                  ? "opacity-100 scale-100 pointer-events-auto"
                  : "opacity-0 scale-95 pointer-events-none"
                  }`}
              >
                <div className="px-3 py-2 mb-1">
                  <p className="text-sm font-extrabold text-gray-900 tracking-tight">Notifications</p>
                </div>
                <ul className="flex flex-col m-0 list-none">
                  {!session?.user?.isProfileIncomplete && (
                    <li className="px-3 py-2 mb-2 border-b border-gray-50">
                      <p className="text-xs text-gray-500 text-center italic">No new notifications for now</p>
                    </li>
                  )}

                  {session?.user?.isProfileIncomplete && (
                    <li>
                      <Link 
                        href="/complete-profile" 
                        className="block px-3 py-3 rounded-xl hover:bg-orange-50 transition-all border border-transparent hover:border-orange-100 hover:shadow-sm"
                        onClick={() => setNotificationMenuState(false)}
                      >
                        <div className="flex items-start">
                          <span className="text-orange-500 mr-3 mt-0.5">⚠️</span>
                          <div>
                            <p className="text-sm font-bold text-gray-800">Pending Tasks</p>
                            <p className="text-xs text-gray-500 mt-0.5">Complete your profile to unlock all mapping features.</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  )}

                  {/* Past greyed-out notifications (Earliest at the bottom) */}
                  {(!session?.user?.isProfileIncomplete) && (
                    <li className="opacity-50 grayscale pointer-events-none">
                      <div className="block px-3 py-3 rounded-xl transition-all">
                        <div>
                          <p className="text-sm font-bold text-gray-600">Profile Completed</p>
                          <p className="text-xs text-gray-500 mt-0.5">You&apos;re all set to start mapping.</p>
                        </div>
                      </div>
                    </li>
                  )}
                  
                  <li className="opacity-50 grayscale pointer-events-none">
                    <div className="block px-3 py-3 rounded-xl transition-all">
                      <div>
                        <p className="text-sm font-bold text-gray-600">Welcome to Imprint!</p>
                        <p className="text-xs text-gray-500 mt-0.5">Thanks for joining our community.</p>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <div className="relative flex items-center" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={profileToggle}
                className="flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full bg-gray-200 hover:bg-gray-300 focus:outline-none transition-colors border border-gray-300 shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 md:w-7 md:h-7 text-gray-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </button>

              <div
                className={`absolute right-0 top-full mt-2 w-48 z-20 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 transition-all duration-300 ease-in-out origin-top-right overflow-hidden ${profileMenuState
                  ? "opacity-100 scale-100 pointer-events-auto"
                  : "opacity-0 scale-95 pointer-events-none"
                  }`}
              >
                <ul className="py-2 flex flex-col m-0 list-none">
                  <li>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2 text-red-600 font-medium hover:bg-red-50 hover:text-red-700 transition-colors"
                      onClick={logoutFunction}
                    >
                      Logout
                    </button>
                  </li>
                </ul>
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
        <Button
          onClick={() => menuToggle()}
          className={`mr-2 md:mr-5 pt-4 z-10 hover:bg-red-500 hover:text-white border-red-500 ${menuState
            ? "bg-red-500 text-white"
            : "text-red-500 bg-transparent focus:outline-none"
            }`}
        >
          ☰
        </Button>
        <div
          className={
            menuState
              ? "transition-all duration-300 ease-in-out absolute mt-16 mr-5 cursor-default z-20 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none"
              : "absolute opacity-0 left-0 h-0 w-0 cursor-default z-0"
          }
        >
          <ul className={`${styles.ul} ${menuState ? "block" : "hidden"}`}>
            <li><Link href="/" onClick={() => setMenuState(false)}>Home</Link></li>
            <li><Link href="/about" onClick={() => setMenuState(false)}>About</Link></li>
            <li><Link href="/demo" onClick={() => setMenuState(false)}>Demo</Link></li>
            {status === "unauthenticated" && !isAuthPage && (
              <li>
                <Link href="/contribute" onClick={() => setMenuState(false)} className="font-bold text-primary">Volunteer</Link>
              </li>
            )}
            {status === "authenticated" && (
              <>
                <hr className="my-1 border-gray-200" />
                <li>
                  <Link href="/contribute" onClick={() => setMenuState(false)} className="text-gray-700">Dashboard</Link>
                </li>
                {session?.user?.isProfileIncomplete && (
                  <li>
                    <Link href="/complete-profile" onClick={() => setMenuState(false)} className="flex items-center text-orange-600 font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-1">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Pending Tasks
                    </Link>
                  </li>
                )}
                <li>
                  <button type="button" className="w-full text-left text-red-600 font-medium" onClick={logoutFunction}>
                    Logout
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
