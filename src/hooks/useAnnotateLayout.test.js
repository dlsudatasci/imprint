import { describe, it, expect } from "vitest";
import { layoutFor, SHEET_LAYOUT_QUERY } from "./useAnnotateLayout";

/** The annotation layout by width (9 Oct 2026): the sheet under 1024 CSS px. */
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
});
