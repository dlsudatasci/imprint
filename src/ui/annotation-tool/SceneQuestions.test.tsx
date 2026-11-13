// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import SceneQuestions, { type SceneLevel } from "./SceneQuestions";
import { TAP_SLOP_PX, TAP_CLICK_WINDOW_MS } from "./touchTap";
import { emptySceneLevel, SCENE_KEYS, SIDEWALK_ONLY_KEYS } from "@/util/validators/sceneQuestions.mjs";

/**
 * Step 3 (S15, 9 Nov 2026): six questions about the sidewalk, each one row of
 * picture buttons, with the four that need a built sidewalk off for a path
 * (pathOnly). The tutorial points at #scene-level-section, and the practice
 * lights each [data-scene-question] in turn (S19).
 */
const empty = emptySceneLevel() as SceneLevel;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

function mount(sceneLevel: SceneLevel, { pathOnly = false, onAnswer = vi.fn(), variant = "desktop" as "desktop" | "sheet" } = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<SceneQuestions sceneLevel={sceneLevel} variant={variant} pathOnly={pathOnly} onAnswer={onAnswer} />));
  return { onAnswer, option: (key: string) => host!.querySelector<HTMLButtonElement>(`[data-scene-option="${key}"]`)! };
}

const html = (props: { pathOnly?: boolean; variant?: "desktop" | "sheet"; sceneLevel?: SceneLevel } = {}) =>
  renderToStaticMarkup(<SceneQuestions sceneLevel={props.sceneLevel ?? empty} variant={props.variant ?? "desktop"} pathOnly={props.pathOnly} onAnswer={() => undefined} />);
const optionKeys = (markup: string) => Array.from(markup.matchAll(/data-scene-option="([^"]+)"/g), (m) => m[1]);
const label = (markup: string, key: string) =>
  markup.match(new RegExp(`data-scene-option="${key}"[\\s\\S]*?<span[^>]*>([^<]+)</span>`))![1].replace(/­/g, "");

describe("SceneQuestions", () => {
  it("renders Step 3's six questions in order under the id the tutorial points at", () => {
    const markup = html();
    expect(markup).toContain('id="scene-level-section"');
    expect(markup).toContain("Step 3: Rate the Sidewalk");
    const titles = ["Sidewalk Width", "Ease of Navigation", "Evenness", "Surface Type", "Surface Condition", "Road Barrier"];
    const at = titles.map((t) => markup.indexOf(`>${t}<`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const questions = Array.from(markup.matchAll(/data-scene-question="([^"]+)"/g), (m) => m[1]);
    expect(questions).toEqual([...SCENE_KEYS]);
  });

  it("has 3, 5, 2, 4, 3 and 2 answers, stored as the validators expect, worst to best", () => {
    const keys = optionKeys(html());
    expect(keys).toEqual([
      "sidewalkWidth:one_person", "sidewalkWidth:two_people", "sidewalkWidth:three_or_more",
      "overallAccessibility:1", "overallAccessibility:2", "overallAccessibility:3", "overallAccessibility:4", "overallAccessibility:5",
      "surfaceEvenness:2", "surfaceEvenness:3",
      "surfaceType:concrete", "surfaceType:tiles", "surfaceType:pavers", "surfaceType:unpaved",
      "surfaceCondition:1", "surfaceCondition:2", "surfaceCondition:3",
      "roadBarrier:false", "roadBarrier:true",
    ]);
    const markup = html();
    expect(label(markup, "overallAccessibility:1")).toBe("Fully obstructed");
    expect(label(markup, "overallAccessibility:5")).toBe("Unobstructed");
    expect(label(markup, "surfaceCondition:1")).toBe("Broken");
    expect(label(markup, "surfaceCondition:3")).toBe("Intact");
    expect(label(markup, "roadBarrier:false")).toBe("No barrier");
    expect(label(markup, "sidewalkWidth:one_person")).toBe("Narrow");
  });

  // S27 (13 Nov 2026): "Bricks", since paver blocks confused people (S23 C had "Bricks or paver blocks"). Stored value unchanged.
  it("labels the pavers answer Bricks, still stored as pavers", () => {
    const markup = html();
    expect(label(markup, "surfaceType:pavers")).toBe("Bricks");
    expect(label(markup, "surfaceType:tiles")).toBe("Tiles");
  });

  it("has no option label with paver in it", () => {
    const markup = html();
    for (const key of optionKeys(markup)) expect(label(markup, key), key).not.toMatch(/paver/i);
  });

  // S27 (13 Nov 2026): Evenness asks about a sideways tilt, Sloped or Flat. Uneven (1) is no longer offered.
  it("asks whether the walking surface tilts sideways, with Sloped then Flat, two across like Road Barrier", () => {
    const markup = html();
    const keys = optionKeys(markup).filter((k) => k.startsWith("surfaceEvenness:"));
    expect(keys).toEqual(["surfaceEvenness:2", "surfaceEvenness:3"]);
    expect(keys.map((k) => label(markup, k))).toEqual(["Sloped", "Flat"]);
    expect(markup).not.toContain(">Uneven<");
    const card = (key: string) => markup.match(new RegExp(`data-scene-question="${key}"[\\s\\S]*?<p[^>]*>[^<]*</p><p[^>]*>([^<]+)</p><div class="grid ([^"]+)"`))!;
    expect(card("surfaceEvenness")[1]).toBe("Does the walking surface tilt sideways?");
    expect(card("surfaceEvenness")[2]).toBe(card("roadBarrier")[2]);
    expect(markup).not.toContain("How even is the walking surface?");
  });

  it("shows neither Evenness answer chosen for a stored 1, and the chosen one for 2 or 3", () => {
    const { option } = mount({ ...empty, surfaceEvenness: 1 });
    expect(option("surfaceEvenness:2").getAttribute("aria-pressed")).toBe("false");
    expect(option("surfaceEvenness:3").getAttribute("aria-pressed")).toBe("false");
    expect(host!.querySelector('[data-scene-question="surfaceEvenness"] [aria-pressed="true"]')).toBeNull();
    act(() => root!.unmount());
    host!.remove();
    const again = mount({ ...empty, surfaceEvenness: 2 });
    expect(again.option("surfaceEvenness:2").getAttribute("aria-pressed")).toBe("true");
    expect(again.option("surfaceEvenness:3").getAttribute("aria-pressed")).toBe("false");
  });

  // S27 (13 Nov 2026): the Road Barrier pictures fill their option, as the other rows' do
  it("draws Road Barrier at the same picture size as Evenness, with no small wrapper", () => {
    const markup = html();
    const box = (key: string) => markup.match(new RegExp(`data-scene-option="${key}"[\\s\\S]*?<div class="([^"]+)"><svg`))![1];
    expect(box("roadBarrier:true")).toBe(box("surfaceEvenness:2"));
    expect(markup).not.toContain("w-11 h-11");
  });

  it("shows no em dash or semicolon in any text", () => {
    for (const markup of [html(), html({ variant: "sheet" }), html({ pathOnly: true })]) {
      const text = markup.replace(/<[^>]+>/g, " ");
      expect(text).not.toMatch(/[—;]/);
    }
  });

  it("passes one answer at a time, the booleans as booleans", () => {
    const { onAnswer, option } = mount(empty);
    act(() => option("surfaceCondition:2").click());
    expect(onAnswer).toHaveBeenLastCalledWith({ surfaceCondition: 2 });
    act(() => option("sidewalkWidth:two_people").click());
    expect(onAnswer).toHaveBeenLastCalledWith({ sidewalkWidth: "two_people" });
    act(() => option("roadBarrier:false").click());
    expect(onAnswer).toHaveBeenLastCalledWith({ roadBarrier: false });
    act(() => option("surfaceType:pavers").click());
    expect(onAnswer).toHaveBeenLastCalledWith({ surfaceType: "pavers" });
  });

  it("marks the chosen answer, roadBarrier false included", () => {
    const { option } = mount({ ...empty, overallAccessibility: 2, roadBarrier: false });
    expect(option("overallAccessibility:2").getAttribute("aria-pressed")).toBe("true");
    expect(option("overallAccessibility:1").getAttribute("aria-pressed")).toBe("false");
    expect(option("roadBarrier:false").getAttribute("aria-pressed")).toBe("true");
    expect(option("roadBarrier:true").getAttribute("aria-pressed")).toBe("false");
  });

  it("turns the four sidewalk-only questions off for a path, and leaves Ease of Navigation and Evenness on", () => {
    const { onAnswer, option } = mount(empty, { pathOnly: true });
    for (const key of SIDEWALK_ONLY_KEYS) {
      const card = host!.querySelector(`[data-scene-question="${key}"]`)!;
      expect(card.getAttribute("aria-disabled")).toBe("true");
      expect(card.textContent).toContain("Not asked for a path.");
      for (const button of Array.from(card.querySelectorAll("button"))) expect(button.disabled).toBe(true);
    }
    act(() => option("roadBarrier:true").click());
    expect(onAnswer).not.toHaveBeenCalled();
    for (const key of ["overallAccessibility", "surfaceEvenness"]) {
      const card = host!.querySelector(`[data-scene-question="${key}"]`)!;
      expect(card.hasAttribute("aria-disabled")).toBe(false);
      expect(card.textContent).not.toContain("Not asked for a path.");
    }
    act(() => option("surfaceEvenness:2").click());
    expect(onAnswer).toHaveBeenLastCalledWith({ surfaceEvenness: 2 });
  });

  it("has no card off for a sidewalk", () => {
    expect(html()).not.toContain("aria-disabled");
    expect(html()).not.toContain("Not asked for a path.");
  });
});

// apple-design check, 17 Oct 2026: the answers were 9 and 10 px on a laptop
describe("answer labels", () => {
  it("are 11 px at the least on a laptop, 12 px in the sheet", () => {
    const desktop = html();
    expect(desktop).not.toMatch(/text-\[(9|10)px\]/);
    for (const name of ["Wide", "Slightly obstructed", "Flat", "Tiles", "Intact", "Barrier"]) {
      expect(desktop).toMatch(new RegExp(`text-\\[11px\\][^"]*">${name}<`));
    }
    const sheet = html({ variant: "sheet" });
    expect(sheet).not.toMatch(/text-\[(9|10|11)px\]/);
  });

  it("puts Ease of Navigation five across on a laptop and three and two in the sheet", () => {
    const grid = (markup: string) => markup.match(/data-scene-question="overallAccessibility"[\s\S]*?<div class="grid ([^"]+)"/)![1];
    expect(grid(html())).toContain("grid-cols-5");
    expect(grid(html({ variant: "sheet" }))).toContain("grid-cols-3");
  });
});

// The width and ease pictures are animated, with still frames under reduced motion (S15)
describe("reduced motion", () => {
  const stubMotion = (reduce: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));

  it("animates the width and ease pictures without it", () => {
    stubMotion(false);
    mount(empty);
    expect(host!.querySelectorAll("animateTransform").length).toBeGreaterThan(0);
  });

  it("draws still frames, with no animateTransform, when the system asks for reduced motion", () => {
    stubMotion(true);
    mount(empty);
    expect(host!.querySelectorAll("animateTransform")).toHaveLength(0);
    expect(host!.querySelectorAll("animate")).toHaveLength(0);
    // Every answer still has its picture
    expect(host!.querySelectorAll("[data-scene-option] svg").length).toBe(19);
  });
});

/**
 * A soft tap on a phone (12 Nov 2026, a contributor's report): a phone can let
 * a tap go without a click, after a flick of the sheet or when it takes the
 * tap for a hover. The answer stayed empty while the button kept its hover
 * tint, which looked chosen. A finger's tap now answers when it is let go, and
 * the tint is only where something hovers.
 */
describe("a finger's tap on an answer (12 Nov 2026)", () => {
  function press(el: Element, type: string, { x = 50, y = 50, pointerType = "touch", pointerId = 1 } = {}) {
    act(() => {
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType, isPrimary: true, clientX: x, clientY: y }));
    });
  }
  function click(el: HTMLElement) {
    act(() => el.click());
  }

  it("answers when the finger is let go, with no click from the browser", () => {
    const { onAnswer, option } = mount(empty, { variant: "sheet" });
    press(option("roadBarrier:true"), "pointerdown");
    press(option("roadBarrier:true"), "pointerup");
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ roadBarrier: true });
  });

  it("answers once for a whole tap, the click that follows it not counted again", () => {
    const { onAnswer, option } = mount(empty, { variant: "sheet" });
    const no = option("roadBarrier:false");
    press(no, "pointerdown");
    press(no, "pointerup");
    click(no);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ roadBarrier: false });
  });

  it("answers a finger that moved a little, up to the allowance, on every question", () => {
    const { onAnswer, option } = mount(empty, { variant: "sheet" });
    for (const key of ["sidewalkWidth:two_people", "overallAccessibility:4", "surfaceEvenness:2", "surfaceType:tiles", "surfaceCondition:1", "roadBarrier:true"]) {
      press(option(key), "pointerdown", { x: 40, y: 40 });
      press(option(key), "pointerup", { x: 40 + TAP_SLOP_PX * 0.6, y: 40 + TAP_SLOP_PX * 0.6 });
    }
    expect(onAnswer).toHaveBeenCalledTimes(6);
    expect(onAnswer).toHaveBeenLastCalledWith({ roadBarrier: true });
  });

  it("does not answer a finger that moved past the allowance, or a touch the browser turned into a scroll", () => {
    const { onAnswer, option } = mount(empty, { variant: "sheet" });
    const barrier = option("roadBarrier:true");
    press(barrier, "pointerdown", { y: 40 });
    press(barrier, "pointerup", { y: 40 + TAP_SLOP_PX + 1 });
    press(barrier, "pointerdown");
    press(barrier, "pointercancel");
    press(barrier, "pointerup");
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("does not answer a press that starts on one answer and ends on another", () => {
    const { onAnswer, option } = mount(empty, { variant: "sheet" });
    press(option("roadBarrier:false"), "pointerdown", { pointerType: "pen" });
    press(option("roadBarrier:true"), "pointerup", { pointerType: "pen" });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("answers a mouse on its click only, and the keyboard's click as before", () => {
    const { onAnswer, option } = mount(empty);
    const tiles = option("surfaceType:tiles");
    press(tiles, "pointerdown", { pointerType: "mouse" });
    press(tiles, "pointerup", { pointerType: "mouse" });
    expect(onAnswer).not.toHaveBeenCalled();
    click(tiles);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    click(option("surfaceType:unpaved"));
    expect(onAnswer).toHaveBeenLastCalledWith({ surfaceType: "unpaved" });
  });

  it("counts a later click on the same answer, and a tap on another answer straight after", () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { onAnswer, option } = mount(empty, { variant: "sheet" });
    const broken = option("surfaceCondition:1");
    press(broken, "pointerdown");
    press(broken, "pointerup");
    press(option("surfaceCondition:3"), "pointerdown");
    press(option("surfaceCondition:3"), "pointerup");
    expect(onAnswer.mock.calls.map((c) => c[0])).toEqual([{ surfaceCondition: 1 }, { surfaceCondition: 3 }]);
    now += TAP_CLICK_WINDOW_MS + 1;
    click(broken);
    expect(onAnswer).toHaveBeenLastCalledWith({ surfaceCondition: 1 });
    expect(onAnswer).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
  });

  it("does not answer a tap on a question that is off for a path", () => {
    const { onAnswer, option } = mount(empty, { variant: "sheet", pathOnly: true });
    press(option("roadBarrier:true"), "pointerdown");
    press(option("roadBarrier:true"), "pointerup");
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("tints an answer on hover only where something hovers, and lets a quick tap through", () => {
    for (const variant of ["sheet", "desktop"] as const) {
      const { option } = mount(empty, { variant });
      for (const key of ["roadBarrier:true", "surfaceType:tiles", "overallAccessibility:3"]) {
        const classes = option(key).className.split(/\s+/);
        expect(classes).toContain("[@media(hover:hover)]:hover:bg-primary/5");
        expect(classes).toContain("[@media(hover:hover)]:hover:border-primary/30");
        expect(classes.filter((c) => c.startsWith("hover:"))).toEqual([]);
        expect(classes).toContain("touch-manipulation");
      }
      act(() => root?.unmount());
      host?.remove();
      root = null;
    }
  });
});
