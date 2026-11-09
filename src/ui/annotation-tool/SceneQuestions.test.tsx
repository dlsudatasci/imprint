// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import SceneQuestions, { type SceneLevel } from "./SceneQuestions";
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

function mount(sceneLevel: SceneLevel, { pathOnly = false, onAnswer = vi.fn() } = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<SceneQuestions sceneLevel={sceneLevel} variant="desktop" pathOnly={pathOnly} onAnswer={onAnswer} />));
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

  it("has 3, 5, 3, 4, 3 and 2 answers, stored as the validators expect, worst to best", () => {
    const keys = optionKeys(html());
    expect(keys).toEqual([
      "sidewalkWidth:one_person", "sidewalkWidth:two_people", "sidewalkWidth:three_or_more",
      "overallAccessibility:1", "overallAccessibility:2", "overallAccessibility:3", "overallAccessibility:4", "overallAccessibility:5",
      "surfaceEvenness:1", "surfaceEvenness:2", "surfaceEvenness:3",
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
    act(() => option("surfaceEvenness:1").click());
    expect(onAnswer).toHaveBeenLastCalledWith({ surfaceEvenness: 1 });
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
    expect(host!.querySelectorAll("[data-scene-option] svg").length).toBe(20);
  });
});
