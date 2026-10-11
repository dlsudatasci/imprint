import { describe, it, expect } from "vitest";
import { canAnnotateOn } from "./canAnnotate";

/** Who can annotate on which device (9 Oct 2026). */
describe("canAnnotateOn", () => {
  it("lets contributors annotate on phones, tablets and desktops", () => {
    expect(canAnnotateOn({ isAnnotator: false, finePointer: false, isMobileUA: true })).toBe(true);
    expect(canAnnotateOn({ isAnnotator: false, finePointer: false, isMobileUA: false })).toBe(true);
    expect(canAnnotateOn({ isAnnotator: false, finePointer: true, isMobileUA: false })).toBe(true);
  });

  it("keeps annotators to a fine pointer on a desktop browser, as before", () => {
    expect(canAnnotateOn({ isAnnotator: true, finePointer: true, isMobileUA: false })).toBe(true);
    expect(canAnnotateOn({ isAnnotator: true, finePointer: false, isMobileUA: false })).toBe(false);
    expect(canAnnotateOn({ isAnnotator: true, finePointer: true, isMobileUA: true })).toBe(false);
    expect(canAnnotateOn({ isAnnotator: true, finePointer: false, isMobileUA: true })).toBe(false);
  });
});
