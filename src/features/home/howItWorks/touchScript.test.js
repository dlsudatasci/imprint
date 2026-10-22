import { describe, it, expect } from "vitest";
import {
  ADD_BOX_MARK,
  FIT_TO,
  TOUCH_CHAPTERS,
  TOUCH_STEPS,
  touchFrame,
  touchTickOf,
} from "./touchScript";
import { CHAPTERS, DEMO_IMAGE_SIZE, DRAWN_ID, LAST_TICK, TICKS, demoFrame, tickOf } from "./demoScript";
import {
  ADD_BOX_MIN_SIDE_PX,
  TOUCH_MIN_SIDE_PX,
  addBoxPlacement,
  cssToImage,
  markCorners,
  moveCorner,
} from "@/ui/annotation-tool/touchGeometry";
import { buildPeekChips } from "@/features/annotate/objectTrays";
import { buildDisplayLabelsInOrder, orderOfAppearance } from "@/util/buildDisplayLabels";

/**
 * The phone and tablet preview's script (22 Oct 2026): the laptop preview's
 * task, played the way the tool takes it from a finger.
 */
const at = (tick) => touchFrame(tick / TICKS);
const answers = (frame) =>
  frame.boxes.map((b) => ({ id: b.id, comment: b.comment, selected: b.selected, isRejected: b.isRejected, obstructs: b.obstructs, severity: b.severity }));
// The narrowest the preview ever draws the photo (TouchStage: MIN_SCREEN_W) and a wide tablet
const PHOTO_WIDTHS = [320, 348, 390, 430, 770, 1180, 1400];

describe("touchScript", () => {
  it("gives exactly the laptop preview's answers, to every object and to Step 2", () => {
    const phone = at(touchTickOf("next"));
    const laptop = demoFrame(tickOf("next") / TICKS);
    expect(answers(phone)).toEqual(answers(laptop));
    expect(phone.scene).toEqual(laptop.scene);
    expect(phone.scene).toEqual({ sidewalkWidth: "two_people", surfaceCondition: 3, walkability: 3, overallAccessibility: 5 });
  });

  it("taps Tree #1 on the photo, then opens the rest with Next in the tool's order: Lamp Post #1, Car #1, Motorcycle #1", () => {
    expect(TOUCH_STEPS.find((s) => s.name === "to-tree").to).toEqual({ kind: "box", id: "tut1-box2" });
    const opened = ["lamp", "car", "moto"].map((key) => {
      const before = at(touchTickOf(`${key}-open`));
      // What the tool's Next opens (openNextToDecide): the first chip still to decide
      const { nextId } = buildPeekChips(orderOfAppearance(before.boxes), { labels: buildDisplayLabelsInOrder(before.boxes) });
      const after = at(touchTickOf(`${key}-open`, "end"));
      expect(after.selectedId).toBe(nextId);
      return after.selectedId;
    });
    expect(opened).toEqual(["tut1-box1", "tut1-box3", "tut1-box4"]);
    for (const key of ["lamp", "car", "moto"]) expect(TOUCH_STEPS.find((s) => s.name === `${key}-to-next`).to).toEqual({ kind: "ui", name: "peek-next" });
  });

  it("adds the box where the tool's Add box puts it on the whole photo, at every width the preview draws the photo", () => {
    const whole = { x: 0, y: 0, width: DEMO_IMAGE_SIZE.width, height: DEMO_IMAGE_SIZE.height };
    for (const width of PHOTO_WIDTHS) {
      const minSide = cssToImage(ADD_BOX_MIN_SIDE_PX, width / DEMO_IMAGE_SIZE.width, 1);
      expect(addBoxPlacement(whole, DEMO_IMAGE_SIZE, minSide)).toEqual({ ...ADD_BOX_MARK });
    }
    const added = at(touchTickOf("add", "end"));
    const box = added.boxes.find((b) => b.id === DRAWN_ID);
    expect(box.mark).toEqual({ ...ADD_BOX_MARK });
    expect(box.editable).toBe(true);
    expect(added.selectedId).toBe(DRAWN_ID);
  });

  it("drags two corners onto the white post, and no screen's smallest box size would stop them short", () => {
    const fitted = at(touchTickOf("fit-2", "end")).boxes.find((b) => b.id === DRAWN_ID).mark;
    expect(fitted).toEqual({ ...FIT_TO, type: "RECT" });
    // The tool stops a corner TOUCH_MIN_SIDE_PX (CSS px) short of the opposite side
    for (const width of PHOTO_WIDTHS) {
      const minSide = cssToImage(TOUCH_MIN_SIDE_PX, width / DEMO_IMAGE_SIZE.width, 1);
      const first = moveCorner(ADD_BOX_MARK, 1, { x: FIT_TO.x + FIT_TO.width, y: FIT_TO.y }, { x: 0, y: 0 }, minSide, 640, 360);
      const second = moveCorner(first, 3, { x: FIT_TO.x, y: FIT_TO.y + FIT_TO.height }, { x: 0, y: 0 }, minSide, 640, 360);
      expect(second).toEqual({ ...FIT_TO, type: "RECT" });
    }
    // Each drag starts on a corner of the box as it is
    const drag1 = TOUCH_STEPS.find((s) => s.name === "to-corner-1").to;
    expect(markCorners(ADD_BOX_MARK)).toContainEqual({ x: drag1.x, y: drag1.y });
  });

  it("shows Add box's hint until the first corner is dragged, and the magnifier only while a corner is", () => {
    expect(at(touchTickOf("add", "end")).hint).toBe(true);
    expect(at(touchTickOf("to-corner-1", "end") - 0.1).hint).toBe(true);
    const dragging = at((touchTickOf("fit-1") + touchTickOf("fit-1", "end")) / 2);
    expect(dragging.hint).toBe(false);
    expect(dragging.corner).not.toBeNull();
    expect(dragging.cursor.pressed).toBe(true);
    expect(at(touchTickOf("fit-1", "end")).corner).toBeNull();
    expect(at(touchTickOf("fit-2", "end")).corner).toBeNull();
    expect(at(0).hint).toBe(false);
  });

  it("rests the sheet where the tool does: the panel while a box is open, full for Step 2, down otherwise", () => {
    expect(at(0).snap).toBe("collapsed");
    expect(at(touchTickOf("tree-open", "end")).snap).toBe("panel");
    expect(at(touchTickOf("tree-confirm", "end")).snap).toBe("collapsed");
    expect(at(touchTickOf("add", "end")).snap).toBe("panel");
    expect(at(touchTickOf("scene-open")).snap).toBe("collapsed");
    expect(at(touchTickOf("scene-open", "end")).snap).toBe("full");
    expect(at(touchTickOf("next", "end")).snap).toBe("full");
    expect(at(TICKS).snap).toBe("collapsed");
    expect(at(TICKS).imageIndex).toBe(1);
  });

  it("scrolls Step 2 to the answer the finger is going to", () => {
    expect(at(touchTickOf("scene-open", "end")).sceneFocus).toBeNull();
    expect(at(touchTickOf("to-walkability") + 1).sceneFocus).toEqual({ field: "walkability", value: 3 });
    expect(TOUCH_STEPS.find((s) => s.name === "to-scene").to).toEqual({ kind: "ui", name: "scene-line" });
  });

  it("has the laptop preview's five chapters, in order, over the same scroll", () => {
    expect(TOUCH_CHAPTERS.map((c) => c.id)).toEqual(CHAPTERS.map((c) => c.id));
    expect(TOUCH_CHAPTERS[0].start).toBe(0);
    const ends = TOUCH_STEPS.map((s) => s.end);
    expect(Math.max(...ends)).toBeCloseTo(LAST_TICK, 5);
    for (let i = 1; i < TOUCH_STEPS.length; i++) expect(TOUCH_STEPS[i].at).toBeGreaterThanOrEqual(TOUCH_STEPS[i - 1].end - 1e-9);
  });

  it("is pure: the same tick always gives the same screen, whatever was shown before", () => {
    const tick = touchTickOf("drawn-severity") + 3;
    const first = JSON.stringify(at(tick));
    at(TICKS);
    at(0);
    expect(JSON.stringify(at(tick))).toBe(first);
    expect(touchFrame(NaN).tick).toBe(0);
    expect(touchFrame(2).tick).toBe(TICKS);
  });
});
