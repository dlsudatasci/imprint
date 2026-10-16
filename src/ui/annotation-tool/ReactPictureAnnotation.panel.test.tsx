// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation from "./ReactPictureAnnotation";
import { writeSession } from "@/util/sessionCache";
import { PANEL_ROOM_BELOW } from "./panelPosition";

/**
 * The floating panel on the desktop photo stays inside the photo (16 Oct
 * 2026). panelPosition keeps PANEL_ROOM_BELOW px above the photo's bottom for
 * it, but a suggestion answered Yes, with its severity row, is 245 px tall
 * (measured in Chromium), and the photo's frame (overflow-hidden) cut off its
 * foot, Not an object included, on a box low on the photo.
 *
 * jsdom lays nothing out, so the panel is given a height here. Same stand-in
 * canvas as ReactPictureAnnotation.labels.test.tsx.
 */
type Shape = { getAnnotationData(): { id: string; mark: { y: number } } };
type Tool = {
  shapes: Shape[];
  selectBoxById(id: string): void;
  state: { inputPosition: { top: number }; showInput: boolean };
};

const mark = (x: number, y: number) => ({ x, y, width: 30, height: 60, type: "RECT" });
const boxes = [
  { id: "pred-0", comment: "tree", mark: mark(100, 40), editable: false, selected: false, isRejected: false },
  { id: "pred-1", comment: "car", mark: mark(300, 520), editable: false, selected: false, isRejected: false },
];
const STAGE_HEIGHT = 600;

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean; ResizeObserver: unknown };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
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
let panelHeight = 0;
let heightSpy: ReturnType<typeof vi.spyOn> | null = null;

function mount({ isAnnotator = false } = {}): Tool {
  window.localStorage.clear();
  writeSession({ total: 1, current: 1, data: { imgRecords: [{ imageID: "IMG", url: "/p.jpg", annotationList: boxes }], isAnnotator } });
  // The floating panel's wrapper has the height under test, every other element none
  heightSpy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("rp-selected-input") ? panelHeight : 0;
  });
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
        height={STAGE_HEIGHT}
        annotationData={JSON.parse(JSON.stringify(boxes))}
        imageID="IMG"
        city="manila"
        currentAnnotationCount={1}
        totalAnnotationCount={1}
        username="test"
        isAnnotator={isAnnotator}
      />
    );
  });
  return ref.current as unknown as Tool;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  heightSpy?.mockRestore();
  heightSpy = null;
  panelHeight = 0;
});

describe("the floating panel on the desktop photo", () => {
  it("moves up to end at the photo's bottom when it is taller than the room kept for it, and only then", () => {
    const tool = mount();
    // Fits: where panelPosition opens it, PANEL_ROOM_BELOW px above the bottom
    panelHeight = 200;
    act(() => tool.selectBoxById("pred-1"));
    expect(tool.state.showInput).toBe(true);
    expect(tool.state.inputPosition.top).toBe(STAGE_HEIGHT - PANEL_ROOM_BELOW);
    // A suggestion answered Yes, 245 px tall: moved up to end at the bottom
    panelHeight = 245;
    act(() => tool.selectBoxById("pred-0"));
    // High on the photo it already fits, level with its box
    expect(tool.state.inputPosition.top).toBe(40);
    act(() => tool.selectBoxById("pred-1"));
    expect(tool.state.inputPosition.top).toBe(STAGE_HEIGHT - 245);
  });

  it("does the same for an annotator's panel", () => {
    const tool = mount({ isAnnotator: true });
    panelHeight = 240;
    act(() => tool.selectBoxById("pred-1"));
    expect(tool.state.inputPosition.top).toBe(STAGE_HEIGHT - 240);
  });
});
