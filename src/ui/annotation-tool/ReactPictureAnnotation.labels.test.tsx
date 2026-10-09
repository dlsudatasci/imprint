// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation from "./ReactPictureAnnotation";
import { writeSession } from "@/util/sessionCache";

/**
 * The labels drawn on the photo match the list under it, however the boxes are
 * clicked (8 Oct 2026). The canvas draws its boxes in an order that changes on
 * every click (the clicked box moves to the end, to be drawn on top), and the
 * photo used to number same-category boxes in that order: clicking "Lamp Post
 * #1" relabelled it "#4" on the photo while the list kept "#1".
 *
 * A stand-in canvas context lets the boxes draw, so the label each box is
 * drawn with can be read.
 */
type Shape = { getAnnotationData(): { id: string }; paint: (...args: unknown[]) => unknown };
type Gesture = { onMouseDown(x: number, y: number): void; onMouseMove(x: number, y: number): void; onMouseUp(): void };
type Tool = {
  shapes: Shape[];
  selectedId: string | null;
  selectBoxById(id: string): void;
  onShapeChange(): void;
  onInputCommentChange(comment: string): void;
  currentAnnotationState: Gesture;
};

const mark = (x: number) => ({ x, y: 40, width: 30, height: 120, type: "RECT" });
// Data order is not appearance order, so drawing order and list order differ
// from the start. The two drawn lamp posts were drawn zz first, then aa.
const boxes = [
  { id: "aa", comment: "lamp_post", mark: mark(700), editable: true, selected: false, isRejected: false, obstructs: false, drawnOrder: 2000 },
  { id: "lp-c", comment: "lamp_post", mark: mark(300), editable: false, selected: false, isRejected: false },
  { id: "lp-a", comment: "lamp_post", mark: mark(100), editable: false, selected: false, isRejected: false },
  { id: "tr-1", comment: "tree", mark: mark(500), editable: false, selected: false, isRejected: false },
  { id: "lp-d", comment: "lamp_post", mark: mark(400), editable: false, selected: false, isRejected: false },
  { id: "lp-b", comment: "lamp_post", mark: mark(200), editable: false, selected: false, isRejected: false },
  { id: "zz", comment: "lamp_post", mark: mark(600), editable: true, selected: false, isRejected: false, obstructs: false, drawnOrder: 1000 },
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

/** The label each box is drawn with on the photo, by id. */
function photoLabels(tool: Tool) {
  const seen = new Map<string, unknown>();
  const spies = tool.shapes.map((shape) => {
    const id = shape.getAnnotationData().id;
    return vi.spyOn(shape, "paint").mockImplementation((...args: unknown[]) => {
      seen.set(id, args[3]);
      return { x: 0, y: 0, width: 0, height: 0 };
    });
  });
  act(() => tool.onShapeChange());
  spies.forEach((spy) => spy.mockRestore());
  return Object.fromEntries(Array.from(seen.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

/** The chips under the photo, in list order. */
const listLabels = () => Array.from(document.querySelectorAll("[data-tray]")).map((b) => b.textContent);

describe("labels on the photo", () => {
  it("number suggestions first in the model's order, then drawn boxes in the order drawn", () => {
    const tool = mount();
    expect(photoLabels(tool)).toEqual({
      "aa": "Lamp Post #6",
      "lp-a": "Lamp Post #1",
      "lp-b": "Lamp Post #2",
      "lp-c": "Lamp Post #3",
      "lp-d": "Lamp Post #4",
      "tr-1": "Tree",
      "zz": "Lamp Post #5",
    });
    // The lists show the same numbers, in that order
    expect(listLabels().filter((t) => t?.startsWith("Lamp Post"))).toEqual([
      "Lamp Post #1", "Lamp Post #2", "Lamp Post #3", "Lamp Post #4",
      "Lamp Post #5, drawn by you", "Lamp Post #6, drawn by you",
    ]);
  });

  it("give a newly drawn lamp post the next number without renumbering the others", () => {
    const tool = mount();
    const before = photoLabels(tool);
    act(() => {
      tool.currentAnnotationState.onMouseDown(850, 300);
      tool.currentAnnotationState.onMouseMove(900, 450);
      tool.currentAnnotationState.onMouseUp();
    });
    const newId = tool.selectedId as string;
    expect(Object.keys(before)).not.toContain(newId);
    act(() => tool.onInputCommentChange("lamp_post"));
    const after = photoLabels(tool);
    for (const [id, label] of Object.entries(before)) expect(after[id]).toBe(label);
    expect(after[newId]).toBe("Lamp Post #7");
  });

  it("keep each box's number however the boxes are clicked", () => {
    const tool = mount();
    const before = photoLabels(tool);
    for (const order of [["lp-a", "lp-b"], ["lp-d", "aa", "lp-a", "lp-c"], ["zz", "lp-b", "tr-1", "lp-a", "lp-d"]]) {
      for (const id of order) {
        act(() => tool.selectBoxById(id));
        // The clicked box is drawn last, on top
        expect(tool.shapes[tool.shapes.length - 1].getAnnotationData().id).toBe(id);
        expect(photoLabels(tool)).toEqual(before);
      }
    }
    expect(listLabels().filter((t) => t?.startsWith("Lamp Post"))).toHaveLength(6);
  });
});
