// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import PracticeGuide, { targetsInUse } from "./PracticeGuide";
import SceneQuestions from "@/ui/annotation-tool/SceneQuestions";
import { PRACTICE_SELECTORS } from "./practiceSteps";
import { SCENE_KEYS, emptySceneLevel } from "@/util/validators/sceneQuestions.mjs";

/**
 * The practice's guide (S19), from Rans's review on 8 Nov 2026: the screen
 * dimmed but for the lit part, as the tour does, the page held still on a
 * laptop while it runs, and the card with its check mark. jsdom lays nothing
 * out, so where things go is checked in practiceCard.test.js and in the
 * browser.
 */
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

let host;
let root;
async function show(props = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const all = {
    step: 4, total: 11, line: "Does the object obstruct your way? You decide. The model can be wrong.",
    targets: { highlight: null, rings: [], spotlight: ["[data-photo-area]"], fallback: null, avoid: [] },
    onSkip: () => {}, layout: "desktop", ...props,
  };
  await act(async () => root.render(<PracticeGuide {...all} />));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  return all;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
});
const layer = () => document.querySelector("[data-practice-layer]");

describe("the practice's guide", () => {
  it("is on the body, over the page, with the card's counter and line", async () => {
    await show();
    expect(layer().parentElement).toBe(document.body);
    expect(host.contains(layer())).toBe(false);
    expect(layer().className).toMatch(/z-\[70\]/);
    const card = layer().querySelector("[data-practice-card]");
    expect(card.textContent).toMatch(/Practice 4 of 11/);
    expect(card.textContent).toMatch(/You decide\. The model can be wrong\./);
  });

  it("dims the page with an overlay that takes presses outside its cut-outs", async () => {
    await show();
    const path = layer().querySelector("svg path");
    expect(path.getAttribute("fill-rule")).toBe("evenodd");
    expect(path.getAttribute("fill")).toBe("rgba(0, 0, 0, 0.5)");
    expect(path.style.pointerEvents).toBe("auto");
    expect(layer().querySelector("svg").getAttribute("aria-hidden")).toBe("true");
    // Nothing is laid out in jsdom, so nothing is lit: nothing dimmed (the cut-outs are in practiceCard.test.js)
    expect(path.getAttribute("d")).toBe("");
  });

  it("shows a step's note grey under its line, as the tour's notes are", async () => {
    await show({ line: "Pick its category, then answer both questions.", note: "Hint: this is a lamp post." });
    const note = layer().querySelector("[data-practice-note]");
    expect(note.textContent).toBe("Hint: this is a lamp post.");
    expect(note.className).toMatch(/text-muted/);
    expect(note.previousElementSibling.textContent).toBe("Pick its category, then answer both questions.");
    act(() => root.unmount());
    host.remove();
    await show();
    expect(layer().querySelector("[data-practice-note]")).toBeNull();
  });

  it("holds the page still on a laptop while it runs, and lets it go after", async () => {
    document.documentElement.style.overflow = "auto";
    await show();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.scrollbarGutter).toBe("stable");
    act(() => root.unmount());
    root = null;
    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.body.style.overflow).toBe("");
  });

  it("leaves the phone screen to the annotation form, which already holds it", async () => {
    await show({ layout: "sheet" });
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("shows the check mark only when a step was just done, and never with reduced motion", async () => {
    await show();
    expect(layer().querySelector("[data-practice-done]")).toBeNull();
    act(() => root.unmount());
    host.remove();
    await show({ done: true });
    expect(layer().querySelector("[data-practice-done]").getAttribute("aria-label")).toBe("Done");
    act(() => root.unmount());
    host.remove();
    await show({ done: true, reducedMotion: true });
    expect(layer().querySelector("[data-practice-done]")).toBeNull();
  });

  it("has Skip practice and nothing else to press", async () => {
    const onSkip = vi.fn();
    await show({ onSkip });
    const buttons = Array.from(layer().querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["Skip practice"]);
    await act(async () => buttons[0].click());
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("is gone with the practice", async () => {
    await show();
    act(() => root.unmount());
    root = null;
    expect(layer()).toBeNull();
  });
});

describe("the line with a fallback", () => {
  it("says to tap the Step 3 line until the answers sheet is up, then the plain line", async () => {
    const targets = {
      highlight: null, rings: [], spotlight: ["[data-scene-question='sidewalkWidth']"], avoid: [],
      fallback: { unless: PRACTICE_SELECTORS.sheetUp, rings: [PRACTICE_SELECTORS.sceneLine], spotlight: [PRACTICE_SELECTORS.sceneLine] },
    };
    await show({ layout: "sheet", targets, line: "Next is Step 3: questions about the sidewalk itself.", fallbackLine: "Next is Step 3: questions about the sidewalk itself. Tap the Step 3 line." });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(layer().textContent).toMatch(/Tap the Step 3 line\./);
    const sheet = document.createElement("section");
    sheet.id = "answer-sheet";
    sheet.innerHTML = '<button aria-expanded="true"></button>';
    document.body.appendChild(sheet);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(layer().textContent).not.toMatch(/Tap the Step 3 line/);
    expect(layer().textContent).toMatch(/questions about the sidewalk itself\./);
    sheet.remove();
  });
});

describe("targetsInUse", () => {
  const touchScene = {
    rings: [], spotlight: ["[data-scene-question='sidewalkWidth']"],
    fallback: { unless: PRACTICE_SELECTORS.sheetUp, rings: [PRACTICE_SELECTORS.sceneLine], spotlight: [PRACTICE_SELECTORS.sceneLine] },
  };

  it("uses the Step 3 line until the answers sheet is pulled up, then the question", () => {
    expect(targetsInUse(touchScene)).toMatchObject({ rings: [PRACTICE_SELECTORS.sceneLine], spotlight: [PRACTICE_SELECTORS.sceneLine] });
    const sheet = document.createElement("section");
    sheet.id = "answer-sheet";
    sheet.innerHTML = '<button aria-expanded="true"></button>';
    document.body.appendChild(sheet);
    expect(targetsInUse(touchScene)).toMatchObject({ rings: [], spotlight: ["[data-scene-question='sidewalkWidth']"] });
    sheet.querySelector("button").setAttribute("aria-expanded", "false");
    expect(targetsInUse(touchScene).spotlight).toEqual([PRACTICE_SELECTORS.sceneLine]);
    sheet.remove();
  });

  it("passes targets with no fallback as they are", () => {
    const t = { rings: ["a"], spotlight: ["b"], fallback: null };
    expect(targetsInUse(t)).toBe(t);
  });
});

describe("Step 3's questions", () => {
  it("each carry the name the practice lights them up by", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const scene = emptySceneLevel();
    await act(async () => root.render(<SceneQuestions sceneLevel={scene} variant="desktop" onAnswer={() => {}} />));
    const marked = Array.from(host.querySelectorAll("[data-scene-question]"));
    expect(marked.map((e) => e.getAttribute("data-scene-question"))).toEqual([...SCENE_KEYS]);
    // Each holds its own options
    for (const key of SCENE_KEYS) {
      expect(host.querySelector(`[data-scene-question='${key}'] [data-scene-option^='${key}:']`), key).toBeTruthy();
    }
  });
});
