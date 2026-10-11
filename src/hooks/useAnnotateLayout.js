import { useEffect, useState } from "react";

/**
 * Which layout the annotation tool uses (9 Oct 2026,
 * IMPRINT_contributor_mobile.md section 4.1). Chosen by width alone: under
 * 1024 CSS px contributors get the sheet layout (the photo fills the screen and
 * the answers sit in a bottom sheet), at 1024 and wider the desktop layout.
 * How a press on the photo behaves is decided separately, by the input (a
 * finger or pen uses the touch interaction in either layout).
 *
 * Annotators always get the desktop layout. AnnotateForm applies that.
 */

/** The widest the sheet layout goes, CSS px */
export const SHEET_MAX_WIDTH_PX = 1023.98;
export const SHEET_LAYOUT_QUERY = `(max-width: ${SHEET_MAX_WIDTH_PX}px)`;

/** The layout for a viewport this many CSS px wide. */
export function layoutFor(width) {
  return width <= SHEET_MAX_WIDTH_PX ? "sheet" : "desktop";
}

/**
 * `null` until it runs in the browser (render the skeleton until then, as for
 * useCanAnnotate), then "sheet" or "desktop". Live: it follows a resize or a
 * rotation.
 */
export function useAnnotateLayout() {
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    const query = window.matchMedia?.(SHEET_LAYOUT_QUERY);
    if (!query) {
      setLayout(layoutFor(window.innerWidth));
      return undefined;
    }
    const evaluate = (matches) => setLayout(matches ? "sheet" : "desktop");
    evaluate(query.matches);
    if (!query.addEventListener) return undefined;
    const onChange = (event) => evaluate(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return layout;
}
