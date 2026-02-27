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
  const isContributePage = router.pathname.startsWith('/contribute');
  const isAuthPage = router.pathname === '/login' || router.pathname === '/register';
  const { data: session, status } = useSession();
  const [menuState, setMenuState] = useState(false);
  const [profileMenuState, setProfileMenuState] = useState(false);

  const menuToggle = () => {
    setMenuState(!menuState);
  };

  const profileToggle = () => {
    setProfileMenuState(!profileMenuState);
  };

  const mobileNavRef = useRef(null);
  const profileDropdownRef = useRef(null);

  useOutsideClick(mobileNavRef, () => {
    setMenuState(false);
  });

  useOutsideClick(profileDropdownRef, () => {
    setProfileMenuState(false);
  });

  const logoutFunction = () => {
    window.localStorage.setItem("annotationTotalCount", null);
    window.localStorage.setItem("annotationCurrentCount", null);
    window.localStorage.setItem("annotationSetData", null);
    signOut();
  };

  return (
    <nav className="flex items-center justify-between container mx-auto px-1 md:px-5 py-5 md:py-10 z-10 relative">
      <div>
        <Link href="/">
          <Logo height={30} subTitle={isContributePage ? "contribute" : "imprint"} />
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
                Contribute
              </Link>
            </li>
          )}
        </ul>

        {/* Conditional Profile Icon Dropdown */}
        {status === "authenticated" && (
          <div className="relative flex items-center ml-2" ref={profileDropdownRef}>
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
                <Link href="/contribute" onClick={() => setMenuState(false)} className="font-bold text-primary">Contribute</Link>
              </li>
            )}
            {status === "authenticated" && (
              <>
                <hr className="my-1 border-gray-200" />
                <li>
                  <Link href="/contribute" onClick={() => setMenuState(false)} className="text-gray-700">Dashboard</Link>
                </li>
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
