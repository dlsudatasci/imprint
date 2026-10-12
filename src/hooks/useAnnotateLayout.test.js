import { describe, it, expect } from "vitest";
import { layoutFor, SHEET_LAYOUT_QUERY, TOUCH_DEVICE_QUERY } from "./useAnnotateLayout";

/** The annotation layout (9 Oct 2026): the sheet under 1024 CSS px, and on every phone and tablet (12 Oct 2026). */
describe("layoutFor", () => {
  it("gives the sheet layout under 1024 px and the desktop layout from 1024", () => {
    expect(layoutFor(1023)).toBe("sheet");
    expect(layoutFor(390)).toBe("sheet");
    expect(layoutFor(1024)).toBe("desktop");
    expect(layoutFor(1440)).toBe("desktop");
  });

  it("uses the same breakpoint as its media query", () => {
    expect(SHEET_LAYOUT_QUERY).toBe("(max-width: 1023.98px)");
  });

  // 12 Oct 2026: an iPad held sideways was the desktop layout with touch added
  it("gives a phone or tablet the sheet layout at any width, and goes by width with a mouse", () => {
    expect(TOUCH_DEVICE_QUERY).toBe("(pointer: coarse)");
    for (const width of [390, 820, 1024, 1180, 1366]) expect(layoutFor(width, true)).toBe("sheet");
    expect(layoutFor(1180, false)).toBe("desktop");
    expect(layoutFor(820, false)).toBe("sheet");
  });
});
