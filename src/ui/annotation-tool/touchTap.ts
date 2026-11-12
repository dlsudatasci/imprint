import type React from "react";
import { useRef } from "react";

/** A finger or pen let go within this many CSS px of where it went down is a tap, about the browsers' own allowance (Chrome took 12 px as a tap, 16 as a scroll) */
export const TAP_SLOP_PX = 15;
/** A click this soon after a tap was answered on release is that tap's own click, ms */
export const TAP_CLICK_WINDOW_MS = 800;

type Press = { pointerId: number; key: string; x: number; y: number };

export interface TapHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onClick: () => void;
}

/**
 * Answers a finger's tap when it is let go, not when the browser's click
 * comes (Step 3 on phones, 12 Nov 2026). A phone can let a light tap go
 * without a click: a tap that only stops the sheet gliding after a flick, or
 * one it takes for a hover. The answer was then left untouched while the
 * button kept its hover colour, which looked half chosen. Here a finger or
 * pen that goes down and comes up on the same answer, within TAP_SLOP_PX, with
 * no pointercancel (the browser sends one when the touch becomes a scroll),
 * answers at once, and the click that follows it is not counted again. A mouse
 * and the keyboard answer on click, as before.
 *
 * `tap(key, onTap)` gives one button's handlers. `key` names the answer, so a
 * press that starts on one answer and ends on another answers neither.
 */
export function useTouchTap() {
  const press = useRef<Press | null>(null);
  const tapped = useRef<{ key: string; at: number } | null>(null);

  return function tap(key: string, onTap: () => void): TapHandlers {
    return {
      onPointerDown: (event) => {
        if (event.pointerType === "mouse" || !event.isPrimary) return;
        press.current = { pointerId: event.pointerId, key, x: event.clientX, y: event.clientY };
      },
      onPointerUp: (event) => {
        const down = press.current;
        if (!down || down.pointerId !== event.pointerId) return;
        press.current = null;
        if (down.key !== key || Math.hypot(event.clientX - down.x, event.clientY - down.y) > TAP_SLOP_PX) return;
        tapped.current = { key, at: performance.now() };
        onTap();
      },
      onPointerCancel: () => {
        press.current = null;
      },
      onClick: () => {
        const last = tapped.current;
        tapped.current = null;
        if (last && last.key === key && performance.now() - last.at < TAP_CLICK_WINDOW_MS) return;
        onTap();
      },
    };
  };
}
