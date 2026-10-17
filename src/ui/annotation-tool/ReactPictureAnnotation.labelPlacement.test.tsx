// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation from "./ReactPictureAnnotation";
import { placeLabel } from "./Shape";
import { writeSession } from "@/util/sessionCache";

/**
 * Box names on the photo do not cover each other (17 Oct 2026, apple-design
 * check). Each name was painted at its box's top-left corner as the box was
 * drawn, so boxes side by side painted their names over each other ("Car #1"
 * read "r #1" on a phone). Names are now placed first, in the lists' order,
 * and a name that would cover an earlier one moves down below it, inside its
 * own box.
 */
type Shape = { getAnnotationData(): { id: string }; paint: (...args: unknown[]) => unknown };
type Tool = { shapes: Shape[]; selectBoxById(id: string): void; onShapeChange(): void };

const mark = (x: number) => ({ x, y: 40, width: 30, height: 120, type: "RECT" });
// Three suggestions 20 px apart, each name about 64 px wide
const boxes = [
  { id: "m1", comment: "motorcycle", mark: mark(100), editable: false, selected: false, isRejected: false },
  { id: "m2", comment: "motorcycle", mark: mark(120), editable: false, selected: false, isRejected: false },
  { id: "m3", comment: "motorcycle", mark: mark(140), editable: false, selected: false, isRejected: false },
  { id: "far", comment: "tree", mark: mark(600), editable: false, selected: false, isRejected: false },
];

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean; ResizeObserver: unknown };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  // Every drawing call does nothing, text measures 40px wide
  const store: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(store, {
    get: (target, prop) => (prop in target ? target[prop] : prop === "measureText" ? () => ({ width: 40 }) : () => undefined),
    set: (target, prop, value) => {
      target[prop] = value;
      return true;
    },
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
});


let root: Root | null = null;
let host: HTMLDivElement;

function mount(): Tool {
  window.localStorage.clear();
  writeSession({ total: 1, current: 1, data: { imgRecords: [{ imageID: "IMG", url: "/p.jpg", annotationList: boxes }], isAnnotator: false } });
  const ref = React.createRef<ReactPictureAnnotation>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ReactPictureAnnotation
        ref={ref}
        image="/p.jpg"
        onSelect={() => undefined}
        onChange={() => undefined}
        width={960}
        height={600}
        annotationData={JSON.parse(JSON.stringify(boxes))}
        imageID="IMG"
        city="manila"
        currentAnnotationCount={1}
        totalAnnotationCount={1}
        username="test"
        isAnnotator={false}
        askSidewalk={false}
      />
    );
  });
  return ref.current as unknown as Tool;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

/** Where each box's name is painted, by id */
function nameSpots(tool: Tool) {
  const seen = new Map<string, { x: number; y: number } | undefined>();
  const spies = tool.shapes.map((shape) => {
    const id = shape.getAnnotationData().id;
    return vi.spyOn(shape, "paint").mockImplementation((...args: unknown[]) => {
      seen.set(id, args[5] as { x: number; y: number } | undefined);
      return { x: 0, y: 0, width: 0, height: 0 };
    });
  });
  act(() => tool.onShapeChange());
  spies.forEach((spy) => spy.mockRestore());
  return seen;
}

const SIZE = { width: 40 + 24, height: 12 + 8 }; // measureText is 40 px, plus the label's padding
const overlap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x < b.x + SIZE.width && b.x < a.x + SIZE.width && a.y < b.y + SIZE.height && b.y < a.y + SIZE.height;

describe("placeLabel", () => {
  const box = { x: 100, y: 40, width: 30, height: 120 };
  it("keeps a free name at its box's corner", () => {
    expect(placeLabel(box, SIZE, [])).toEqual({ x: 100, y: 40, ...SIZE });
    expect(placeLabel(box, SIZE, [{ x: 300, y: 40, ...SIZE }])).toEqual({ x: 100, y: 40, ...SIZE });
  });

  it("moves a name just above its box when an earlier name has the corner", () => {
    expect(placeLabel(box, SIZE, [{ x: 80, y: 40, ...SIZE }])).toEqual({ x: 100, y: 40 - SIZE.height - 2, ...SIZE });
  });

  it("moves a name below the earlier names when the corner and the spot above are both taken", () => {
    const first = { x: 80, y: 40, ...SIZE };
    const second = { x: 90, y: 40 - SIZE.height - 2, ...SIZE };
    expect(placeLabel(box, SIZE, [first, second])).toEqual({ x: 100, y: 40 + SIZE.height + 2, ...SIZE });
  });

  it("never goes above the top of the canvas", () => {
    const top = { ...box, y: 5 };
    expect(placeLabel(top, SIZE, [{ x: 80, y: 5, ...SIZE }]).y).toBe(5 + SIZE.height + 2);
  });
});

describe("names on the photo", () => {
  it("never cover each other when boxes sit side by side", () => {
    const spots = nameSpots(mount());
    const placed = ["m1", "m2", "m3", "far"].map((id) => spots.get(id)!);
    for (const p of placed) expect(p).toBeDefined();
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(overlap(placed[i], placed[j])).toBe(false);
  });

  it("stay where they are when a box is clicked, though the drawing order changes", () => {
    const tool = mount();
    const before = nameSpots(tool);
    act(() => tool.selectBoxById("m1"));
    const after = nameSpots(tool);
    for (const id of ["m1", "m2", "m3", "far"]) expect(after.get(id)).toEqual(before.get(id));
  });
});
