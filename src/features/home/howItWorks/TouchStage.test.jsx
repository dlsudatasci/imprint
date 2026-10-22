// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import TouchStage, { MIN_SCREEN_H, MIN_SCREEN_W, TOOL_COPY, findTouchTarget, listScroll, screenScale } from "./TouchStage";
import { TOUCH_STEPS, touchFrame, touchTickOf } from "./touchScript";
import { TICKS } from "./demoScript";
import BottomSheet from "@/ui/BottomSheet";
import { ADD_BOX_COPY, FOCUS_COPY } from "@/ui/annotation-tool/ReactPictureAnnotation";

/**
 * The phone and tablet preview's drawing (22 Oct 2026), at chosen moments of
 * touchScript.js. jsdom does no layout, so these check what is on screen,
 * not where: the sheet's resting points, the photo's place and the finger
 * were checked against the tool in a browser (IMPRINT_landing_touch_preview.md).
 */
let root = null;
let host = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function show(tick, { coarse = false } = {}) {
  act(() => root?.unmount());
  host?.remove();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<TouchStage frame={touchFrame(tick / TICKS)} instant coarse={coarse} />));
  return host;
}

const sheet = (el) => el.querySelector("[data-touch-sheet]");
const photoBoxes = (el) => el.querySelectorAll("[data-demo-photo] svg > g");

describe("TouchStage", () => {
  it("draws the tool's phone screen at rest: the photo, Add box, the top of the sheet and Next Image, without the top bar", () => {
    const el = show(0);
    expect(el.querySelector('img[src="/images/tutorial/tutorial-1.jpg"]')).not.toBeNull();
    expect(photoBoxes(el)).toHaveLength(4);
    expect(el.textContent).toContain(TOOL_COPY.addBox);
    expect(sheet(el).querySelector("#box-review-section-peek")).not.toBeNull();
    expect(sheet(el).textContent).toContain("Still to decide");
    expect(sheet(el).textContent).toContain("Step 2: Rate the Sidewalk, 0 of 4 answered");
    expect(el.textContent).toContain("Next Image");
    expect(el.textContent).not.toContain("Previous");
    // The step card stands in for the tool's top bar, as on a laptop for the progress strip
    expect(el.textContent).not.toContain("Sidewalk 1 of");
    expect(el.querySelector("[data-demo-panel]")).toBeNull();
  });

  it("shows the full-screen button only where the tool does, with a finger as the primary pointer", () => {
    expect(show(0).querySelector(`[title="${TOOL_COPY.fullScreen}"]`)).toBeNull();
    expect(show(0, { coarse: true }).querySelector(`[title="${TOOL_COPY.fullScreen}"]`)).not.toBeNull();
  });

  it("opens Tree #1's panel in the sheet, under its name and Hide on photo, with only Tree #1 on the photo", () => {
    const el = show(touchTickOf("tree-open", "end"));
    const panel = sheet(el).querySelector("[data-demo-panel]");
    expect(panel.textContent).toContain("Does Tree obstruct the sidewalk?");
    expect(panel.textContent).toContain("Not an object");
    expect(sheet(el).textContent).toContain("Tree #1");
    expect(sheet(el).textContent).toContain("Hide on photo");
    // The open box is the only one drawn (focusedBoxId), with its four round handles, and no names
    expect(photoBoxes(el)).toHaveLength(1);
    expect(el.querySelectorAll("[data-demo-photo] circle")).toHaveLength(4);
    expect(el.querySelectorAll("[data-label]")).toHaveLength(0);
  });

  it("shows the sheet's severity picker at the dragged value: 1 for Tree #1, 4 for the drawn box", () => {
    const tree = show(touchTickOf("tree-severity", "end") - 0.5).querySelector("[data-demo-panel]");
    expect(tree.textContent).toContain("How severe is this obstruction?");
    expect(tree.querySelector('input[aria-label="Severity"]').value).toBe("1");
    expect(tree.querySelector('[data-control="confirm"]').className).toContain("min-h-[44px]");
    const drawn = show(touchTickOf("drawn-severity", "end") - 0.5).querySelector("[data-demo-panel]");
    expect(drawn.querySelector('input[aria-label="Severity"]').value).toBe("4");
  });

  it("adds a box with Add box's hint, fits it, and picks Lamp Post from the open list", () => {
    const added = show(touchTickOf("add", "end"));
    expect(added.textContent).toContain(TOOL_COPY.hint);
    expect(sheet(added).textContent).toContain("Select a category");
    const fitting = show((touchTickOf("fit-1") + touchTickOf("fit-1", "end")) / 2);
    expect(fitting.textContent).not.toContain(TOOL_COPY.hint);
    const open = show(touchTickOf("to-option", "end") - 0.5);
    expect(open.querySelectorAll("[data-demo-option]")).toHaveLength(18);
    const picked = show(touchTickOf("category-pick", "end"));
    expect(picked.querySelector("[data-demo-list]")).toBeNull();
    expect(picked.querySelector('[data-demo-panel] select[aria-label="Category"]').value).toBe("lamp_post");
    expect(sheet(picked).textContent).toContain("Lamp Post #2");
  });

  it("names every box on the photo again once the panel closes, the drawn one too", () => {
    const el = show(touchTickOf("drawn-confirm", "end"));
    const names = Array.from(el.querySelectorAll("[data-label]")).map((s) => s.textContent);
    expect(names).toEqual(["Lamp Post #1", "Tree #1", "Car #1", "Motorcycle #1", "Lamp Post #2"]);
    expect(sheet(el).textContent).toContain("Every object is answered.");
  });

  it("answers Step 2 in the sheet, then shows the second photo with Previous", () => {
    const el = show(touchTickOf("overallAccessibility", "end"));
    const scene = sheet(el).querySelector("#scene-level-section");
    for (const option of ["sidewalkWidth:two_people", "surfaceCondition:3", "walkability:3", "overallAccessibility:5"]) {
      expect(scene.querySelector(`[data-scene-option="${option}"]`).className).toContain("border-primary");
    }
    // The sheet's variant: 44 px answers
    expect(scene.querySelector('[data-scene-option="sidewalkWidth:none"], [data-scene-option="sidewalkWidth:no_sidewalk"]').className).toContain("min-h-[44px]");
    const next = show(TICKS);
    expect(next.querySelector('img[src="/images/tutorial/tutorial-2.jpg"]')).not.toBeNull();
    expect(next.textContent).toContain("Previous");
    expect(findTouchTarget(next, { kind: "ui", name: "next" }).textContent).toBe("Next Image");
  });

  it("has no links", () => {
    expect(show(touchTickOf("lamp-to-no", "end")).querySelector("a[href]")).toBeNull();
  });
});

describe("keeping in step with the annotation tool", () => {
  // Every button, list item, box and photo point the script sends the finger
  // to must be on screen when the finger gets there, and every one it presses
  // while it presses it, found by the tags the tool's components carry
  it("finds every target the finger goes to, when it arrives and while it presses", () => {
    const missing = [];
    let at = null;
    for (const step of TOUCH_STEPS) {
      const checks = [];
      if (step.type === "move" || step.type === "drag") checks.push([step.to, step.end - 0.5]);
      if (step.type === "press" && at) checks.push([at, step.at + 0.5]);
      for (const [target, tick] of checks) {
        if (target.kind === "off") continue;
        const el = show(tick);
        if (!findTouchTarget(el, target, touchFrame(tick / TICKS).boxes)) missing.push(`${step.name}: ${JSON.stringify(target)} at tick ${tick}`);
      }
      if (step.type === "move" || step.type === "drag") at = step.to;
    }
    expect(missing).toEqual([]);
  });

  it("says what the tool says over the photo", () => {
    expect(TOOL_COPY.addBox).toBe(ADD_BOX_COPY.button);
    expect(TOOL_COPY.hint).toBe(ADD_BOX_COPY.hint);
    expect(TOOL_COPY.fullScreen).toBe(FOCUS_COPY.enter);
  });

  it("draws the sheet's frame as BottomSheet does: the panel, its handle and the footer", () => {
    const real = document.createElement("div");
    document.body.appendChild(real);
    const realRoot = createRoot(real);
    act(() => realRoot.render(<BottomSheet snap="collapsed" onSnapChange={() => {}} header={null} footer={null}>{null}</BottomSheet>));
    const el = show(0);
    const realSection = real.querySelector("section");
    const demoSection = sheet(el);
    for (const cls of realSection.className.split(" ").filter((c) => c && c !== "pointer-events-auto" && c !== "will-change-transform")) {
      expect(demoSection.className.split(" ")).toContain(cls);
    }
    expect(demoSection.querySelector("span[aria-hidden]").className).toBe(realSection.querySelector("button span").className);
    const realFooter = real.querySelector(".bottom-0.z-20");
    const demoFooter = demoSection.parentElement.querySelector(".bottom-0.z-20");
    for (const cls of ["bg-surface", "border-t", "border-line", "px-4", "pt-3"]) {
      expect(realFooter.className).toContain(cls);
      expect(demoFooter.className).toContain(cls);
    }
    act(() => realRoot.unmount());
    real.remove();
  });
});

describe("screenScale", () => {
  it("lays the screen out at the space's own size when there is room", () => {
    expect(screenScale({ w: 348, h: 633 })).toEqual({ s: 1, w: 348, h: 633 });
    expect(screenScale({ w: 770, h: 969 })).toEqual({ s: 1, w: 770, h: 969 });
  });

  it("scales a screen laid out at the smallest size into a smaller space, filling it", () => {
    const short = screenScale({ w: 326, h: 390 });
    expect(short.s).toBeCloseTo(390 / MIN_SCREEN_H);
    expect(short.h).toBeCloseTo(MIN_SCREEN_H);
    expect(short.w * short.s).toBeCloseTo(326);
    const narrow = screenScale({ w: 286, h: 600 });
    expect(narrow.w).toBeCloseTo(MIN_SCREEN_W);
  });
});

describe("listScroll", () => {
  it("puts Step 2 at the top of the list, as the tool's Step 2 line does", () => {
    expect(listScroll("section", { top: 375, view: 300, max: 900 })).toBe(375);
    expect(listScroll("section", { top: 375, view: 300, max: 200 })).toBe(200);
  });

  it("scrolls only as far as an answer needs, from Step 2's top", () => {
    expect(listScroll("answer", { top: 420, bottom: 500, view: 300, max: 900, from: 375 })).toBe(375);
    expect(listScroll("answer", { top: 820, bottom: 900, view: 300, max: 2000, from: 375 })).toBe(616);
  });

  it("leaves a panel alone unless a short screen cuts off the button the finger goes to", () => {
    expect(listScroll("control", { top: 80, bottom: 124, view: 200, max: 100 })).toBe(0);
    expect(listScroll("control", { top: 200, bottom: 244, view: 200, max: 100 })).toBe(60);
  });
});
