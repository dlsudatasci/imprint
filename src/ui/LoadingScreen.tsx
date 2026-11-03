import React, { useEffect, useState } from 'react';
import SidewalkLoader from './SidewalkLoader';
import { cn } from './cn';

/**
 * Full-screen loading state.
 *
 * Wraps SidewalkLoader in its page layout: the street runs the full width of
 * the viewport with the caption centred underneath. The background is the app's
 * own page colour, so lifting the overlay doesn't change the shade of the
 * screen behind it.
 *
 * The caller owns the exit. Set `exiting` to fade the overlay out, then unmount
 * once the transition has run — SidewalkLoader hands over at the greeting
 * rather than after a fade of its own, so this is the only exit anyone sees.
 */
export interface LoadingScreenProps {
  /** Fires when the walk reaches its greeting and the loader may be dismissed. */
  onLoopComplete?: () => void;
  /** Fires when the user clicks "skip". Falls back to onLoopComplete. */
  onSkip?: () => void;
  /** Cover the viewport rather than filling the parent. */
  fullscreen?: boolean;
  /** Fade out. Keep mounted for the transition duration, then unmount. */
  exiting?: boolean;
  className?: string;
}

export default function LoadingScreen({
  onLoopComplete,
  onSkip,
  fullscreen,
  exiting,
  className,
}: LoadingScreenProps) {
  // The server-rendered overlay arrives before the scene can size itself, so
  // until the client takes over it is an empty street. Offering "skip" over
  // that reads as a broken page; hold it back until the walk is running.
  const [started, setStarted] = useState(false);
  useEffect(() => setStarted(true), []);

  return (
    <div
      className={cn(
        'flex items-center justify-center bg-ground',
        'transition-opacity duration-300 ease-out motion-reduce:transition-none',
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100',
        fullscreen ? 'fixed inset-0 z-50' : 'min-h-screen w-full',
        className,
      )}
    >
      {started && (onSkip || onLoopComplete) && (
        <button
          type="button"
          onClick={onSkip || onLoopComplete}
          className="absolute top-4 right-4 z-10 font-sans text-sm font-medium tracking-wide"
          style={{ color: '#8a7a5c', animation: 'imprint-linein .35s ease-out' }}
        >
          skip &gt;&gt;&gt;
        </button>
      )}
      <SidewalkLoader onLoopComplete={onLoopComplete} className="w-full" />
    </div>
  );
}
