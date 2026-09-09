import { useState } from 'react';

import styles from './styles.module.css';

/**
 * One collapsible section of the help guide.
 *
 * Hidden content stays on the page and is collapsed with CSS rather than
 * removed. That lets the open and close animate, and stops the recordings
 * restarting from the first frame every time a section is reopened.
 */
export default function HelpItem({ children, heading }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="border border-line rounded-card mb-4 shadow-sm bg-surface overflow-hidden">
      <div className="border-l-2 border-transparent">
        {/* eslint-disable-next-line react/forbid-elements -- accordion disclosure trigger, not a button in the design-system sense */}
        <button type="button" onClick={() => { setOpen(!open); }} aria-expanded={open}
          className="transition-colors duration-300 ease-in-out flex w-full justify-between items-center p-5 px-8 cursor-pointer select-none relative z-10 hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <h2 className="font-display text-ink text-left font-bold text-xl">
            {heading}
          </h2>
          <div className={`rounded-full w-7 h-7 flex items-center justify-center shrink-0 transform transition-transform duration-300 ease-in-out bg-ink ${open ? 'rotate-180' : ''}`}>
            <svg aria-hidden="true" className="" data-reactid="266" fill="none" height="24" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>
        <div>
          <div className={`${styles.contentItem} ${open ? styles.contentItemOpen : styles.contentItemClose} `}>
            <div className="pl-4">
              {children}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
