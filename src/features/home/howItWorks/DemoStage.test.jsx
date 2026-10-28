// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import DemoStage, { cameraFor, cardCovers, keepBelow, captionPlace, findTarget, workShot, showsBelow, showsAbove } from "./DemoStage";
import { demoFrame, DEMO_IMAGES, STEPS, TICKS, tickOf } from "./demoScript";
import { defaultShapeStyle } from "@/ui/annotation-tool/Shape";

/**
 * The preview's drawing, at chosen moments of the script. jsdom does no
 * layout, so these check what is on screen, not where: the cursor and camera
 * maths is covered by cameraFor below and by checking in a browser.
 */
let root = null;
let host = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function show(tick) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<DemoStage frame={demoFrame(tick / TICKS)} instant />));
  return host;
}

describe("DemoStage", () => {
  it("draws the first photo, its suggestions in the lists, Step 2 and Next Image", () => {
    const el = show(0);
    expect(el.querySelector('img[src="/images/tutorial/tutorial-1.jpg"]')).not.toBeNull();
    expect(el.querySelector("#box-review-section")).not.toBeNull();
    expect(el.querySelector("#scene-level-section")).not.toBeNull();
    // No session thumbnails or "Sidewalk #n" title (Rans, 15 Oct 2026)
    expect(el.textContent).not.toContain("Sidewalk #");
    expect(el.textContent).toContain("Still to decide");
    expect(el.textContent).toContain("Next Image");
    expect(el.querySelector("[data-demo-panel]")).toBeNull();
  });

  it("opens the real question panel on the selected suggestion, Lamp Post #1", () => {
    const el = show(tickOf("lamp-to-no", "end"));
    const panel = el.querySelector("[data-demo-panel]");
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain("Does Lamp Post obstruct the sidewalk?");
    expect(panel.textContent).toContain("Not an object");
  });

  it("shows the severity picker at the dragged value: 1 for Tree #1, 4 for the drawn box", () => {
    const tree = show(tickOf("tree-severity", "end") - 0.5).querySelector("[data-demo-panel]");
    expect(tree.textContent).toContain("How severe is this obstruction?");
    expect(tree.querySelector('input[aria-label="Severity"]').value).toBe("1");
    expect(tree.textContent).toContain("Minor inconvenience");
    act(() => root.unmount());
    host.remove();
    const drawn = show(tickOf("drawn-severity", "end") - 0.5).querySelector("[data-demo-panel]");
    expect(drawn.querySelector('input[aria-label="Severity"]').value).toBe("4");
    expect(drawn.textContent).toContain("Difficult to pass");
  });

  it("shows the category list open, with all 18 categories, then the chosen one", () => {
    const open = show(tickOf("to-option", "end") - 0.5);
    expect(open.querySelectorAll("[data-demo-option]")).toHaveLength(18);
    act(() => root.unmount());
    host.remove();
    const picked = show(tickOf("category-pick", "end"));
    expect(picked.querySelector("[data-demo-list]")).toBeNull();
    expect(picked.querySelector('[data-demo-panel] select[aria-label="Category"]').value).toBe("lamp_post");
  });

  it("lists the answered objects under the photo, with the drawn one marked as drawn", () => {
    const el = show(tickOf("drawn-confirm", "end"));
    const obstructions = el.querySelector("#object-tray-obstructions");
    expect(obstructions.textContent).toContain("Tree #1");
    expect(obstructions.textContent).not.toContain("Car #1");
    expect(obstructions.textContent).toContain("Lamp Post #2");
    expect(obstructions.querySelector("[data-drawn]")).not.toBeNull();
    expect(el.textContent).toContain("Every object is answered.");
  });

  it("marks the Step 2 answers and then moves to the second photo", () => {
    const answered = show(tickOf("overallAccessibility", "end"));
    for (const option of ["sidewalkWidth:two_people", "surfaceCondition:3", "walkability:3", "overallAccessibility:5"]) {
      expect(answered.querySelector(`[data-scene-option="${option}"]`).className).toContain("border-primary");
    }
    act(() => root.unmount());
    host.remove();
    const next = show(TICKS);
    expect(next.querySelector('img[src="/images/tutorial/tutorial-2.jpg"]')).not.toBeNull();
  });

  it("puts each box's label tag on the box's top line, sized from the canvas's style", () => {
    const el = show(0);
    const lamp = DEMO_IMAGES[0].annotationList.find((b) => b.id === "tut1-box1");
    const scale = 715 / 640;
    const tags = Array.from(el.querySelectorAll("[data-demo-photo] foreignObject"));
    expect(tags).toHaveLength(DEMO_IMAGES[0].annotationList.length);
    const tag = tags.find((t) => t.textContent === "Lamp Post #1");
    expect(Number(tag.getAttribute("y"))).toBeCloseTo(lamp.mark.y * scale);
    // Shape.paintLabel's tag: the font size plus paddingY above and below, 20 px today
    const height = defaultShapeStyle.fontSize + defaultShapeStyle.paddingY * 2;
    expect(tag.getAttribute("height")).toBe(String(height));
    // A block of fixed height: an inline tag sat a few px under the line
    const label = tag.firstElementChild;
    expect(label.className).toMatch(/(^|\s)block(\s|$)/);
    expect(label.style.height).toBe(`${height}px`);
    expect(label.style.lineHeight).toBe(`${height}px`);
    expect(label.style.padding).toBe(`0px ${defaultShapeStyle.paddingX}px`);
  });

  it("fades the step card where the script says, to 0.3, not hiding it", () => {
    const card = document.createElement("div");
    const captionRef = { current: card };
    const faded = (tick) => {
      host = document.createElement("div");
      document.body.appendChild(host);
      host.appendChild(card);
      root = createRoot(host);
      act(() => root.render(<DemoStage frame={demoFrame(tick / TICKS)} instant captionRef={captionRef} />));
      const opacity = card.style.opacity;
      act(() => root.unmount());
      host.remove();
      root = null;
      host = null;
      return opacity;
    };
    expect(faded(tickOf("drawn-severity"))).toBe("0.3");
    expect(faded(tickOf("tree-severity"))).toBe("");
  });

  it("has no links, and no buttons of its own beyond the real components' (it is shown inert)", () => {
    const el = show(tickOf("lamp-to-no", "end"));
    expect(el.querySelector("a[href]")).toBeNull();
  });
});

describe("keeping in step with the annotation tool", () => {
  // Every button, list item, box and photo point the script sends the cursor
  // to must be on screen when the cursor gets there, and every one it presses
  // while it is pressed. Found by the tags the tool's components carry, so
  // this fails when a change to the tool removes or renames one (15 Oct 2026)
  it("finds every target the cursor goes to, when it arrives and while it presses", () => {
    const missing = [];
    let at = null;
    for (const step of STEPS) {
      const checks = [];
      if (step.type === "move" || step.type === "drag") checks.push([step.to, step.end - 0.5]);
      if (step.type === "press" && at) checks.push([at, step.at + 0.5]);
      for (const [target, tick] of checks) {
        if (target.kind === "off") continue;
        const frame = demoFrame(tick / TICKS);
        const el = show(tick);
        if (!findTarget(el, target, frame.boxes)) missing.push(`${JSON.stringify(target)} at tick ${tick}`);
        act(() => root.unmount());
        host.remove();
      }
      if (step.type === "move" || step.type === "drag") at = step.to;
    }
    expect(missing).toEqual([]);
  });

  it("draws Step 1 with the tool's own card, the photo in its grey well", () => {
    const el = show(0);
    const card = el.querySelector("[data-step1-card]");
    expect(card.querySelector("h2").textContent).toBe("Step 1: Identify Objects and Obstructions");
    expect(card.querySelector("[data-step1-well] [data-demo-photo]")).not.toBeNull();
    expect(card.querySelector("#box-review-section")).not.toBeNull();
  });
});

describe("cameraFor", () => {
  const stage = { w: 1200, h: 900 };

  it("fits the whole stage, centred, in the screen", () => {
    const c = cameraFor({ x: 0, y: 0, w: 1200, h: 900 }, { w: 600, h: 600 }, stage);
    expect(c.z).toBeCloseTo(0.5);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo((600 - 450) / 2);
  });

  it("goes close in on a region, never past twice the design size, and centres it", () => {
    const view = { w: 1920, h: 1080 };
    const c = cameraFor({ x: 500, y: 400, w: 50, h: 50 }, view, stage);
    expect(c.z).toBeCloseTo(2);
    expect(c.x + 525 * c.z).toBeCloseTo(960);
    expect(c.y + 425 * c.z).toBeCloseTo(540);
  });

  it("fills a laptop screen with the photo", () => {
    // The photo is about 715 by 402 design px
    const c = cameraFor({ x: 33, y: 150, w: 715, h: 402 }, { w: 1440, h: 900 }, stage);
    expect(715 * c.z).toBeGreaterThan(1300);
  });

  it("never zooms out further than the whole stage needs", () => {
    const c = cameraFor({ x: 0, y: 0, w: 5000, h: 5000 }, { w: 600, h: 600 }, stage);
    expect(c.z).toBeCloseTo(0.5);
  });
});

describe("cardCovers", () => {
  // The step card in the bottom-left corner of a laptop-sized frame
  const card = { x: 24, y: 520, w: 340, h: 150 };

  it("is in the way when the cursor comes near it", () => {
    expect(cardCovers(card, { pointer: { x: 300, y: 600, w: 26, h: 30 } })).toBe(true);
    expect(cardCovers(card, { pointer: { x: 368, y: 500, w: 26, h: 30 } })).toBe(true);
    expect(cardCovers(card, { pointer: { x: 600, y: 300, w: 26, h: 30 } })).toBe(false);
  });

  it("is in the way when more than a twentieth of a panel or list goes under it, not when a corner brushes it", () => {
    // A panel whose bottom-left corner touches the card's top-right corner, as Tree #1's did
    expect(cardCovers(card, { areas: [{ x: 362, y: 230, w: 440, h: 296 }] })).toBe(false);
    // A third of a panel under the card
    expect(cardCovers(card, { areas: [{ x: 200, y: 450, w: 290, h: 200 }] })).toBe(true);
    // The category list's left edge, 8% of it, as the drawn box's did
    expect(cardCovers(card, { areas: [{ x: 300, y: 300, w: 330, h: 400 }] })).toBe(true);
    expect(cardCovers(card, { areas: [null, { x: 600, y: 200, w: 300, h: 200 }] })).toBe(false);
    expect(cardCovers(null, { pointer: { x: 30, y: 530, w: 10, h: 10 } })).toBe(false);
  });
});

describe("workShot", () => {
  // Measured on a 1440 by 900 laptop (28 Oct 2026): the Step 1 card 733 design px wide from x 24,
  // the photo's well from y 157, the answer lists' foot at their fullest 761, Next Image from 828
  const work = { x: 24, y: 157, w: 733, h: 761 - 157 };
  const laptop = { w: 840, h: 760 };

  it("centres the photo and its lists in the frame across their full width: as much room above as below, nothing cropped", () => {
    const shot = workShot(work, laptop);
    const above = work.y * shot.z + shot.y;
    const below = laptop.h - ((work.y + work.h) * shot.z + shot.y);
    expect(above).toBeGreaterThan(0);
    expect(above).toBeCloseTo(below);
    expect(work.x * shot.z + shot.x).toBeGreaterThanOrEqual(-0.5);
    expect((work.x + work.w) * shot.z + shot.x).toBeLessThanOrEqual(laptop.w + 0.5);
    expect((work.x + work.w / 2) * shot.z + shot.x).toBeCloseTo(laptop.w / 2);
  });

  it("fills a short frame's height instead, when the full width would run past it", () => {
    const view = { w: 1200, h: 500 };
    const shot = workShot(work, view);
    expect(work.y * shot.z + shot.y).toBeCloseTo(0);
    expect((work.y + work.h) * shot.z + shot.y).toBeCloseTo(view.h);
    expect(work.w * shot.z).toBeLessThan(view.w);
  });

  it("never zooms past twice the design size, still centred", () => {
    const shot = workShot({ x: 0, y: 100, w: 100, h: 100 }, { w: 800, h: 800 });
    expect(shot.z).toBe(2);
    expect(150 * shot.z + shot.y).toBeCloseTo(400);
  });

  it("says when the instructions show above the photo, to blur them, and when Next Image would peek in, to fade it", () => {
    const shot = workShot(work, laptop);
    expect(showsAbove(work.y, shot)).toBe(true);
    expect(showsAbove(work.y, workShot(work, { w: 1200, h: 500 }))).toBe(false);
    // On the laptop the room below stops short of Next Image, on a 1024 px one it reaches it
    expect(showsBelow(828, shot, laptop)).toBe(false);
    const narrow = { w: 632, h: 656 };
    expect(showsBelow(828, workShot(work, narrow), narrow)).toBe(true);
  });
});

describe("keepBelow", () => {
  const view = { w: 1198, h: 710 };
  const stage = { w: 1200, h: 960 };
  // The photo at its design size, and the top of its grey well (Step 1's heading and instructions are above it)
  const photo = { x: 33, y: 154, w: 715, h: 402 };
  const wellTop = 146;

  it("pans the close shot of the photo down until nothing above the well shows, at the same zoom", () => {
    const fitted = cameraFor(photo, view, stage);
    expect(wellTop * fitted.z + fitted.y).toBeGreaterThan(0);
    const shot = keepBelow(fitted, wellTop, photo);
    expect(shot.z).toBe(fitted.z);
    expect(shot.x).toBe(fitted.x);
    expect(wellTop * shot.z + shot.y).toBeCloseTo(0);
    expect((photo.y + photo.h) * shot.z + shot.y).toBeLessThanOrEqual(view.h);
  });

  it("leaves a shot alone when nothing above the well shows", () => {
    const low = { z: 1.5, x: 0, y: -400 };
    expect(keepBelow(low, wellTop, photo)).toEqual(low);
  });
});

describe("captionPlace", () => {
  const stage = { w: 1200, h: 960 };
  const photo = { x: 33, y: 154, w: 715, h: 402 };
  const wellTop = 146;
  const card = { w: 340, h: 150 };

  it("puts the step card 16 px inside the photo's bottom-left corner as the close shot shows it", () => {
    const view = { w: 1198, h: 710 };
    const shot = keepBelow(cameraFor(photo, view, stage), wellTop, photo);
    const place = captionPlace(photo, wellTop, view, stage, card);
    expect(place.left).toBeCloseTo(photo.x * shot.z + shot.x + 16, 0);
    expect(view.h - place.bottom).toBeCloseTo((photo.y + photo.h) * shot.z + shot.y - 16, 0);
  });

  it("never puts the card off the frame's edges", () => {
    const place = captionPlace(photo, wellTop, { w: 700, h: 260 }, stage, card);
    expect(place.left).toBeGreaterThanOrEqual(24);
    expect(place.left + card.w).toBeLessThanOrEqual(700 - 24);
    expect(260 - place.bottom - card.h).toBeGreaterThanOrEqual(24);
  });
});
