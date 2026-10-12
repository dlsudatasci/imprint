import { useEffect, useState } from "react";

/**
 * Which layout the annotation tool uses (9 Oct 2026,
 * IMPRINT_contributor_mobile.md section 4.1), for both roles (annotators from
 * 12 Oct 2026). The sheet layout (the photo fills the screen and the answers
 * sit in a bottom sheet) under 1024 CSS px wide, and on every phone and tablet
 * whatever its width. The desktop layout from 1024 px with a mouse or trackpad
 * as the primary pointer.
 *
 * Before 12 Oct 2026 the layout went by width alone, so an iPad was the sheet
 * layout upright and the desktop layout sideways, with touch added to it: two
 * tools on one device, and a tutorial with its beacons over a touch screen.
 * Now a device with a finger as its primary pointer is the sheet layout either
 * way up. A laptop with a touch screen has a mouse or trackpad as its primary
 * pointer and keeps the desktop layout, where a finger on the photo still
 * works.
 */

/** The widest the sheet layout goes with a mouse, CSS px */
export const SHEET_MAX_WIDTH_PX = 1023.98;
export const SHEET_LAYOUT_QUERY = `(max-width: ${SHEET_MAX_WIDTH_PX}px)`;
/** A finger is the primary pointer: a phone or a tablet */
export const TOUCH_DEVICE_QUERY = "(pointer: coarse)";

/** The layout for a viewport this many CSS px wide, on a touch device or not. */
export function layoutFor(width, coarsePointer = false) {
  return coarsePointer === true || width <= SHEET_MAX_WIDTH_PX ? "sheet" : "desktop";
}

/**
 * `null` until it runs in the browser (render the skeleton until then), then
 * "sheet" or "desktop". Live: it follows a resize or a rotation.
 */
export function useAnnotateLayout() {
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    const narrow = window.matchMedia?.(SHEET_LAYOUT_QUERY);
    const touch = window.matchMedia?.(TOUCH_DEVICE_QUERY);
    if (!narrow) {
      setLayout(layoutFor(window.innerWidth));
      return undefined;
    }
    const evaluate = () => setLayout(narrow.matches || touch?.matches === true ? "sheet" : "desktop");
    evaluate();
    if (!narrow.addEventListener) return undefined;
    narrow.addEventListener("change", evaluate);
    touch?.addEventListener?.("change", evaluate);
    return () => {
      narrow.removeEventListener("change", evaluate);
      touch?.removeEventListener?.("change", evaluate);
    };
  }, []);

  return layout;
}
