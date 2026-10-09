import { describe, it, expect } from "vitest";
import { TRAYS, TRAY_COPY, trayOf, buildTrays, ghostSlotCount } from "./objectTrays";

// Contributor Step 1: lists of answers under the photo (7 Oct 2026)
const mark = { x: 0, y: 0, width: 50, height: 50, type: "RECT" };
const suggestion = (id, extra = {}) => ({ id, mark, comment: "tree", editable: false, selected: false, initialState: { comment: "tree", mark }, ...extra });
const drawn = (id, extra = {}) => ({ id, mark, comment: "bollard", editable: true, selected: false, ...extra });

describe("trayOf", () => {
  it("places suggestions by their answer", () => {
    expect(trayOf(suggestion("a"))).toBe(TRAYS.toDecide);
    expect(trayOf(suggestion("a", { selected: true, obstructs: true }))).toBe(TRAYS.obstructions);
    expect(trayOf(suggestion("a", { isRejected: true, obstructs: false }))).toBe(TRAYS.notObstructions);
    expect(trayOf(suggestion("a", { comment: "not_an_object", isRejected: true, obstructs: false }))).toBe(TRAYS.removed);
  });

  it("puts a legacy suggestion with selected true and no obstructs answer in Obstructions", () => {
    expect(trayOf(suggestion("a", { selected: true }))).toBe(TRAYS.obstructions);
  });

  it("places drawn boxes by their Yes or No", () => {
    expect(trayOf(drawn("d", { obstructs: true }))).toBe(TRAYS.obstructions);
    expect(trayOf(drawn("d", { obstructs: false }))).toBe(TRAYS.notObstructions);
    expect(trayOf(drawn("d", { obstructs: null }))).toBe(TRAYS.toDecide);
    expect(trayOf(drawn("d"))).toBe(TRAYS.toDecide);
  });

  it("returns null for anything that is not a box", () => {
    expect(trayOf(null)).toBeNull();
    expect(trayOf(undefined)).toBeNull();
    expect(trayOf("box")).toBeNull();
  });
});

describe("buildTrays", () => {
  const boxes = [
    suggestion("a", { selected: true, obstructs: true, severity: 4 }),
    suggestion("b"),
    suggestion("c", { isRejected: true, obstructs: false }),
    suggestion("d", { comment: "not_an_object", isRejected: true, obstructs: false, initialState: { comment: "car", mark } }),
    drawn("e", { obstructs: true, severity: null }),
    drawn("f", { obstructs: false, comment: "---" }),
    drawn("g", { comment: "" }),
    suggestion("h", { selected: true, obstructs: true }),
  ];
  const labels = new Map([["a", "Tree #1"], ["b", "Tree #2"], ["c", "Tree #3"], ["d", "Not an object"], ["e", "Bollard"], ["f", null], ["g", null]]);

  it("keeps the given order in each list and counts total without Not an object boxes", () => {
    const t = buildTrays(boxes, { labels });
    expect(t.toDecide.map((i) => i.id)).toEqual(["b", "g"]);
    expect(t.notObstructions.map((i) => i.id)).toEqual(["c", "f"]);
    expect(t.obstructions.map((i) => i.id)).toEqual(["a", "e", "h"]);
    expect(t.removed.map((i) => i.id)).toEqual(["d"]);
    expect(t.answered).toBe(5);
    expect(t.total).toBe(7);
  });

  it("labels from the map, then the category, then the fallback", () => {
    const t = buildTrays(boxes, { labels });
    expect(t.obstructions[0].label).toBe("Tree #1");
    expect(t.obstructions[2].label).toBe("Tree"); // h is not in the map
    expect(t.notObstructions[1].label).toBe(TRAY_COPY.fallbackLabel); // "---"
    expect(t.toDecide[1].label).toBe("Select a category"); // ""
    expect(buildTrays([suggestion("x")]).toDecide[0].label).toBe("Tree"); // no map at all
  });

  it("names a box marked Not an object by the model's own category", () => {
    const t = buildTrays(boxes, { labels });
    expect(t.removed[0].label).toBe("Car");
    // With no original category it keeps its label
    const bare = buildTrays([{ id: "z", mark, comment: "not_an_object", editable: false, isRejected: true }]);
    expect(bare.removed[0].label).toBe("Not an object");
  });

  it("marks drawn boxes, and gives each item only its id, label and drawn flag", () => {
    const t = buildTrays(boxes, { labels });
    expect(t.obstructions.map((i) => i.drawn)).toEqual([false, true, false]);
    expect(Object.keys(t.obstructions[0]).sort()).toEqual(["drawn", "id", "label"]);
  });

  it("does not mutate the boxes", () => {
    const copy = JSON.parse(JSON.stringify(boxes));
    buildTrays(boxes, { labels });
    expect(boxes).toEqual(copy);
  });

  it("gives empty lists for no boxes", () => {
    expect(buildTrays([])).toEqual({ toDecide: [], notObstructions: [], obstructions: [], removed: [], total: 0, answered: 0 });
    expect(buildTrays(null).total).toBe(0);
  });
});

describe("ghostSlotCount", () => {
  it.each([
    [0, 0, 0],
    [4, 0, 0],
    [0, 2, 3],
    [1, 2, 1],
    [5, 1, 1],
  ])("%i chips with %i still to decide gives %i empty slots", (items, toDecide, expected) => {
    expect(ghostSlotCount(items, toDecide)).toBe(expected);
  });
});

describe("TRAY_COPY", () => {
  it("has no em dash or semicolon, and never speaks of sorting", () => {
    const strings = Object.values(TRAY_COPY).filter((v) => typeof v === "string");
    expect(strings.length).toBeGreaterThan(8);
    for (const s of strings) {
      expect(s).not.toMatch(/—/);
      expect(s).not.toContain(";");
      expect(s.toLowerCase()).not.toContain("sort");
    }
    expect(TRAY_COPY.notObstructions).toBe("Not obstructions");
    expect(TRAY_COPY.obstructions).toBe("Obstructions");
  });
});
