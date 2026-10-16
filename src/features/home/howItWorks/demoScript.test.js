import { describe, it, expect } from "vitest";
import {
  TICKS,
  STEPS,
  CAMERA,
  CHAPTERS,
  DEMO_IMAGES,
  demoFrame,
  chapterAt,
  cameraAt,
  easeInOut,
  tickOf,
  ENTRANCE_END,
  HOLD_END,
  cardFadedAt,
} from "./demoScript";
import { buildTrays } from "@/features/annotate/objectTrays";
import { buildDisplayLabels } from "@/util/buildDisplayLabels";
import { getSuggestionPanelMode } from "@/util/suggestionJudgment";
import { isTaxonomyCategory } from "@/util/taxonomy";

const at = (tick) => demoFrame(tick / TICKS);
/** Halfway through a named step */
const mid = (name) => (tickOf(name) + tickOf(name, "end")) / 2;
const trayIds = (frame) => {
  const trays = buildTrays(frame.boxes, { labels: buildDisplayLabels(frame.boxes) });
  const ids = (list) => list.map((item) => item.id);
  return {
    toDecide: ids(trays.toDecide),
    notObstructions: ids(trays.notObstructions),
    obstructions: ids(trays.obstructions),
  };
};

describe("the preview script", () => {
  it("lists its steps in order, each ending after it starts and before the next one starts", () => {
    for (let i = 0; i < STEPS.length; i += 1) {
      expect(STEPS[i].end).toBeGreaterThan(STEPS[i].at);
      if (i > 0) expect(STEPS[i].at).toBeGreaterThanOrEqual(STEPS[i - 1].end);
    }
    expect(STEPS[STEPS.length - 1].end).toBeLessThanOrEqual(TICKS);
  });

  it("starts its chapters and camera moves in order, from tick 0", () => {
    expect(CHAPTERS[0].start).toBe(0);
    expect(CAMERA[0].at).toBe(0);
    CHAPTERS.forEach((c, i) => i > 0 && expect(c.start).toBeGreaterThan(CHAPTERS[i - 1].start));
    CAMERA.forEach((c, i) => i > 0 && expect(c.at).toBeGreaterThan(CAMERA[i - 1].at));
  });

  it("starts on the first tutorial photo with every suggestion still to decide and nothing open", () => {
    const f = demoFrame(0);
    expect(f.imageIndex).toBe(0);
    expect(f.boxes).toHaveLength(DEMO_IMAGES[0].annotationList.length);
    expect(trayIds(f).toDecide).toHaveLength(f.boxes.length);
    expect(f.selectedId).toBeNull();
    expect(f.cursor.visible).toBe(false);
    expect(f.camera).toBe("overview");
    expect(f.chapter).toBe(0);
  });

  it("shows the whole page, still, while it slides in and pins, then goes close in a short scroll later", () => {
    // About a twelfth of a screen after it pins (250 ticks a screen)
    expect(HOLD_END).toBeGreaterThan(ENTRANCE_END);
    expect(HOLD_END - ENTRANCE_END).toBeLessThanOrEqual(25);
    for (const tick of [0, ENTRANCE_END, HOLD_END - 1]) {
      expect(cameraAt(tick)).toBe("overview");
      expect(at(tick).cursor.visible).toBe(false);
    }
    expect(cameraAt(HOLD_END)).toBe("photo");
    expect(tickOf("to-tree")).toBeGreaterThan(HOLD_END);
    expect(at(tickOf("to-tree") + 1).cursor.visible).toBe(true);
  });

  it("stays close in on the photo from Tree #1 to Lamp Post #2's severity, with no zoom out between", () => {
    for (let tick = HOLD_END; tick <= tickOf("drawn-confirm", "end"); tick += 1) expect(cameraAt(tick)).toBe("photo");
    expect(CAMERA.map((c) => c.region)).toEqual(["overview", "photo", "overview"]);
  });

  it("fades the step card as Lamp Post #2's panel opens, and keeps it faded through its steps", () => {
    // Never for the suggestions: Car #1's panel is faded for by DemoStage, at
    // the screen sizes where it overlaps, and Motorcycle #1's does not overlap
    for (const name of ["tree-open", "tree-severity", "tree-confirm", "car-open", "car-no", "moto-open", "moto-no", "lamp-open", "lamp-no"]) {
      expect(cardFadedAt(tickOf(name, "end") - 0.1)).toBe(false);
    }
    // Lamp Post #2: full strength while the box is drawn, faded from the moment its panel appears through its severity
    for (let tick = tickOf("draw"); tick < tickOf("draw", "end"); tick += 1) expect(cardFadedAt(tick)).toBe(false);
    expect(at(tickOf("draw", "end")).selectedId).toBe("demo-drawn-1");
    for (let tick = tickOf("draw", "end"); tick < tickOf("drawn-confirm", "end"); tick += 1) expect(cardFadedAt(tick)).toBe(true);
    expect(cardFadedAt(tickOf("to-sidewalkWidth"))).toBe(false);
    expect(at(tickOf("drawn-severity")).cardFaded).toBe(true);
  });

  it("goes Tree #1, then Car, Motorcycle and Lamp Post #1 (Rans, 15 Oct 2026)", () => {
    const opens = STEPS.filter((s) => s.name.endsWith("-open") && s.name !== "category-open").map((s) => s.name);
    expect(opens).toEqual(["tree-open", "car-open", "moto-open", "lamp-open"]);
  });

  it("opens Tree #1, answers Yes, shows the severity picker from 3, drags it to 1 and confirms", () => {
    expect(at(mid("tree-to-yes")).selectedId).toBe("tut1-box2");
    const yes = at(tickOf("tree-yes", "end"));
    const tree = yes.boxes.find((b) => b.id === "tut1-box2");
    expect(tree).toMatchObject({ selected: true, obstructs: true });
    expect(getSuggestionPanelMode({ ...tree, comment: tree.comment })).toBe("severity");
    expect(yes.picker).toBe(3);
    expect(at(mid("tree-severity")).picker).toBe(2);
    expect(at(tickOf("tree-severity", "end") - 0.5).picker).toBe(1);
    expect(at(mid("tree-severity")).cursor.pressed).toBe(true);
    const done = at(tickOf("tree-confirm", "end"));
    expect(done.boxes.find((b) => b.id === "tut1-box2").severity).toBe(1);
    expect(done.selectedId).toBeNull();
    expect(trayIds(done).obstructions).toEqual(["tut1-box2"]);
  });

  it("answers Car, Motorcycle and Lamp Post #1 No, each closing its panel and landing under Not obstructions", () => {
    expect(at(mid("car-to-no")).selectedId).toBe("tut1-box3");
    const f = at(tickOf("car-no", "end"));
    expect(f.selectedId).toBeNull();
    expect(f.boxes.find((b) => b.id === "tut1-box3")).toMatchObject({ selected: false, isRejected: true, obstructs: false, severity: null });
    expect(trayIds(f).notObstructions).toEqual(["tut1-box3"]);
    const all = at(tickOf("to-draw"));
    expect(trayIds(all).toDecide).toEqual([]);
    expect(trayIds(all).obstructions).toEqual(["tut1-box2"]);
    expect(trayIds(all).notObstructions).toEqual(["tut1-box1", "tut1-box3", "tut1-box4"]);
  });

  it("draws a box, which is a dashed draft while dragged and a drawn box with no category when released", () => {
    const dragging = at(mid("draw"));
    expect(dragging.draft).not.toBeNull();
    expect(dragging.draft.width).toBeGreaterThan(0);
    const drawn = at(tickOf("draw", "end"));
    const box = drawn.boxes.find((b) => b.editable);
    expect(drawn.draft).toBeNull();
    expect(drawn.selectedId).toBe(box.id);
    expect(box.comment).toBeUndefined();
    expect(box.mark.width).toBeGreaterThan(0);
    expect(box.mark.height).toBeGreaterThan(0);
  });

  it("opens the category list, highlights Lamp Post, and picks it", () => {
    expect(at(tickOf("to-option") + 0.5).dropdown).toEqual({ highlighted: null });
    expect(at(tickOf("to-option", "end") - 0.5).dropdown).toEqual({ highlighted: "lamp_post" });
    const picked = at(tickOf("category-pick", "end"));
    expect(picked.dropdown).toBeNull();
    const box = picked.boxes.find((b) => b.editable);
    expect(box.comment).toBe("lamp_post");
    expect(isTaxonomyCategory(box.comment)).toBe(true);
  });

  it("answers the drawn box Yes with severity 4, listing it under Obstructions with Tree #1", () => {
    expect(at(tickOf("drawn-yes", "end")).picker).toBe(3);
    expect(at(tickOf("drawn-severity", "end") - 0.5).picker).toBe(4);
    const f = at(tickOf("drawn-confirm", "end"));
    const box = f.boxes.find((b) => b.editable);
    expect(box).toMatchObject({ obstructs: true, severity: 4 });
    expect(trayIds(f).obstructions).toEqual(["tut1-box2", box.id]);
    expect(trayIds(f).toDecide).toEqual([]);
  });

  it("answers the four Step 2 questions in order", () => {
    expect(at(tickOf("sidewalkWidth", "end")).scene).toMatchObject({ sidewalkWidth: "two_people", surfaceCondition: null });
    expect(at(tickOf("overallAccessibility", "end")).scene).toEqual({ sidewalkWidth: "two_people", surfaceCondition: 1, walkability: 1, overallAccessibility: 1 });
  });

  it("saves, then shows the second photo, fresh", () => {
    expect(at(mid("saving")).saving).toBe(true);
    const f = demoFrame(1);
    expect(f.saving).toBe(false);
    expect(f.imageIndex).toBe(1);
    expect(f.boxes).toHaveLength(DEMO_IMAGES[1].annotationList.length);
    expect(trayIds(f).toDecide).toHaveLength(f.boxes.length);
    expect(f.scene.sidewalkWidth).toBeNull();
  });

  it("gives the same frame for the same progress, whatever was asked before (scrolling back)", () => {
    const forward = JSON.stringify(at(700));
    at(1000);
    at(100);
    expect(JSON.stringify(at(700))).toBe(forward);
  });

  it("only opens a box that exists, and only shows the severity picker's value while it is shown", () => {
    for (let tick = 0; tick <= TICKS; tick += 5) {
      const f = at(tick);
      if (f.selectedId) expect(f.boxes.some((b) => b.id === f.selectedId)).toBe(true);
      if (f.picker != null) {
        const open = f.boxes.find((b) => b.id === f.selectedId);
        expect(getSuggestionPanelMode({ ...open, comment: open.comment || "" })).toBe("severity");
      }
      if (f.dropdown) expect(f.selectedId).not.toBeNull();
    }
  });

  it("treats progress outside 0 to 1, and anything not a number, as the nearest end", () => {
    expect(demoFrame(-1).tick).toBe(0);
    expect(demoFrame(2).tick).toBe(TICKS);
    expect(demoFrame(NaN).tick).toBe(0);
    expect(demoFrame(undefined).tick).toBe(0);
  });

  it("knows the chapter and the camera's region at any tick", () => {
    expect(chapterAt(0)).toBe(0);
    expect(chapterAt(CHAPTERS[2].start)).toBe(2);
    expect(chapterAt(TICKS)).toBe(CHAPTERS.length - 1);
    expect(cameraAt(0)).toBe("overview");
    expect(cameraAt(tickOf("to-draw"))).toBe("photo");
    // Step 2 and Next Image play in the whole-page shot, never a close shot of Step 2
    expect(cameraAt(tickOf("to-sidewalkWidth"))).toBe("overview");
    expect(cameraAt(TICKS)).toBe("overview");
    expect(CAMERA.map((c) => c.region)).not.toContain("scene");
  });

  it("eases from 0 to 1, through the middle, never overshooting", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(1)).toBe(1);
    for (let t = 0; t <= 1; t += 0.05) {
      expect(easeInOut(t)).toBeGreaterThanOrEqual(0);
      expect(easeInOut(t)).toBeLessThanOrEqual(1);
    }
  });

  it("finds a step by name, and says so when there is none", () => {
    expect(tickOf("tree-open", "end")).toBeGreaterThan(tickOf("tree-open"));
    expect(() => tickOf("no-such-step")).toThrow("No step named no-such-step");
  });

  it("never changes the tutorial data it starts from", () => {
    const before = JSON.stringify(DEMO_IMAGES);
    demoFrame(1);
    expect(JSON.stringify(DEMO_IMAGES)).toBe(before);
  });
});
