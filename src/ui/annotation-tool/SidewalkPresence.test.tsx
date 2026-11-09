// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import SidewalkPresence from "./SidewalkPresence";

/**
 * Contributors' Step 1 (S15, 9 Nov 2026): is there a sidewalk raised on a
 * curb, or only a path? Two plain buttons, no pictures.
 */
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(value: boolean | null, { onAnswer = vi.fn(), allowed = null as boolean | null, variant = "desktop" as "desktop" | "sheet" } = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<SidewalkPresence value={value} variant={variant} onAnswer={onAnswer} allowed={allowed} />));
  const option = (v: boolean) => host!.querySelector<HTMLButtonElement>(`[data-presence-option="${v}"]`)!;
  return { onAnswer, option };
}

describe("SidewalkPresence", () => {
  it("asks Step 1 with its two answers under the id the tour points at, and no pictures", () => {
    const markup = renderToStaticMarkup(<SidewalkPresence value={null} variant="desktop" onAnswer={() => undefined} />);
    expect(markup).toContain('id="sidewalk-presence-section"');
    expect(markup).toContain("Step 1: Is There a Sidewalk?");
    expect(markup).toContain("Check if the photo has a sidewalk that is raised above the road on a curb.");
    expect(markup).toContain("Yes, there is a sidewalk.");
    expect(markup).toContain("No, there is only a path for people to walk on.");
    expect(markup).not.toContain("<svg");
    expect(markup).not.toContain("<img");
    expect(markup).not.toMatch(/[—;]/);
  });

  it("calls onAnswer with true or false", () => {
    const { onAnswer, option } = mount(null);
    act(() => option(true).click());
    expect(onAnswer).toHaveBeenLastCalledWith(true);
    act(() => option(false).click());
    expect(onAnswer).toHaveBeenLastCalledWith(false);
  });

  it("marks the chosen answer with aria-pressed, and neither before it is answered", () => {
    let { option } = mount(null);
    expect(option(true).getAttribute("aria-pressed")).toBe("false");
    expect(option(false).getAttribute("aria-pressed")).toBe("false");
    act(() => root?.unmount());
    host?.remove();
    ({ option } = mount(false));
    expect(option(false).getAttribute("aria-pressed")).toBe("true");
    expect(option(true).getAttribute("aria-pressed")).toBe("false");
  });

  it("sits side by side on a laptop and one under the other in the sheet", () => {
    const desktop = renderToStaticMarkup(<SidewalkPresence value={null} variant="desktop" onAnswer={() => undefined} />);
    const sheet = renderToStaticMarkup(<SidewalkPresence value={null} variant="sheet" onAnswer={() => undefined} />);
    expect(desktop).toContain("flex flex-wrap gap-2");
    expect(sheet).toContain("grid grid-cols-1 gap-2");
  });

  it("disables the answer the practice does not allow", () => {
    const { onAnswer, option } = mount(null, { allowed: true });
    expect(option(false).disabled).toBe(true);
    expect(option(true).disabled).toBe(false);
    act(() => option(false).click());
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
