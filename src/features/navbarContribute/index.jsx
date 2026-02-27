import { useState, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import Link from "next/link";
import NavLink from "@/ui/navlink";
import { signOut } from "next-auth/react";

import Logo from "@/ui/logo";
import Button from "@/ui/buttons/Button";
import styles from "./styles.module.css";

export default function Nav() {
  const [menuState, setMenuState] = useState(false);

  const logoutFunction = () => {
    window.localStorage.setItem("annotationTotalCount", null);
    window.localStorage.setItem("annotationCurrentCount", null);
    window.localStorage.setItem("annotationSetData", null);
    signOut();
  };

  const menuToggle = () => {
    setMenuState(!menuState);
  };

  /* 
   * Replaced inline hook with shared implementation 
   */
  const wrapperRef = useRef(null);
  useOutsideClick(wrapperRef, () => {
    setMenuState(false);
  });

  return (
    <nav className="flex container mx-auto px-1 md:px-5 py-5 md:py-10 z-10 relative">
      <div>
        <Link href="/" className="flex items-center">
          <Logo height={30} subTitle="contribute" />
        </Link>
      </div>
      <div ref={wrapperRef} className="flex flex-grow justify-end items-center relative gap-6 pr-2 md:pr-5">

        <ul className="hidden md:flex align-bottom m-0 p-0 list-none">
          <li className="mr-2 md:mr-5 pt-4">
            <NavLink href="/about">About</NavLink>
          </li>
          <li className="mr-2 md:mr-5 pt-4">
            <NavLink href="/contribute/help">Help</NavLink>
          </li>
        </ul>

        {/* Profile Dropdown */}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={menuToggle}
            className="flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full bg-gray-200 hover:bg-gray-300 focus:outline-none transition-colors border border-gray-300 shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 md:w-7 md:h-7 text-gray-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </button>

          <div
            className={`absolute right-0 top-full mt-2 w-48 z-20 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 transition-all duration-300 ease-in-out origin-top-right overflow-hidden ${menuState
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-95 pointer-events-none"
              }`}
          >
            <ul className="py-2 flex flex-col m-0 list-none">
              {/* Show links in dropdown on mobile only */}
              <div className="md:hidden">
                <li>
                  <Link href="/about" onClick={() => setMenuState(false)} className="block px-4 py-2 text-gray-700 hover:bg-gray-100 hover:text-accent transition-colors">About</Link>
                </li>
                <li>
                  <Link href="/contribute/help" onClick={() => setMenuState(false)} className="block px-4 py-2 text-gray-700 hover:bg-gray-100 hover:text-accent transition-colors">Help</Link>
                </li>
                <hr className="my-1 border-gray-200" />
              </div>
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
    </nav>
  );
}
