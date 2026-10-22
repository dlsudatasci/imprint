// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation from "./ReactPictureAnnotation";
import { writeSession } from "@/util/sessionCache";
import { applyView, fitImage, IDENTITY_VIEW, type Fit, type View } from "./viewTransform";

/**
 * Where the photo goes when a box opens on a phone or tablet (22 Oct 2026,
 * IMPRINT_landing_touch_preview.md section 7). Opening a box changes, one
 * after another, where the sheet rests, its reported panel height and the
 * photo area's size (the top of the sheet gets shorter, so the area grows).
 * Before, the photo was re-centred lower and moved for whichever of those
 * had arrived: it jumped when it did not need to, and with reduced motion the
 * move was thrown away, leaving the box under the sheet. A tablet's sheet
 * also reports its panel height late (the lists' height first). Now the photo stays where it was and moves only as far as the
 * box needs, whatever order the sizes arrive in, motion or not.
 *
 * jsdom lays nothing out, so the sheet's reports and the photo area's size
 * are given here, with the numbers measured in Chromium on a 348 by 682 phone
 * (a 640 by 360 photo, the sheet's top 283 px at rest and 163 px with a panel).
 */
type Tool = {
  shapes: { getAnnotationData(): { id: string } }[];
  selectBoxById(id: string): void;
  setState(s: object, cb?: () => void): void;
  onSheetPoints(points: { collapsed: number; half: number; full: number; panel: number }): void;
  currentImageElement: { width: number; height: number } | null;
  fit: Fit | null;
  view: View;
  scaleState: Fit;
  state: { showInput: boolean; sheetSnap: string };
};

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h, type: "RECT" });
// Tree #1 and the car from the tutorial photo, and a box low on the photo
const boxes = [
  { id: "tut1-box2", comment: "tree", mark: rect(471, 71, 60, 159), editable: false, selected: false, isRejected: false },
  { id: "low", comment: "car", mark: rect(300, 290, 80, 60), editable: false, selected: false, isRejected: false },
];
const IMAGE = { width: 640, height: 360 };
const WIDTH = 348;
const CONTAINER = 633;
const REST = { collapsed: 283, half: 317, full: 625, panel: 380 };
const OPEN = { collapsed: 163, half: 317, full: 397, panel: 380 };
// What a tablet's sheet reports first: the new top, but the lists' height for the panel
const OPEN_STALE = { ...OPEN, panel: 679 };

let reduced = false;
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
beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = ((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? reduced : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.useRealTimers();
});

/** The tool on a phone, the photo laid out at rest */
function mount(): Tool {
  window.localStorage.clear();
  writeSession({ total: 5, current: 1, data: { imgRecords: [{ imageID: "IMG", url: "/p.jpg", annotationList: boxes }], isAnnotator: false } });
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
        totalAnnotationCount={5}
        username="test"
        layout="sheet"
      />
    );
  });
  const tool = ref.current as unknown as Tool;
  tool.currentImageElement = { ...IMAGE };
  act(() => {
    tool.onSheetPoints(REST);
    tool.setState({ sheetStage: { width: WIDTH, height: CONTAINER - REST.collapsed } });
  });
  tool.fit = fitImage(IMAGE.width, IMAGE.height, WIDTH, CONTAINER - REST.collapsed);
  tool.view = IDENTITY_VIEW;
  tool.scaleState = applyView(tool.fit!, tool.view);
  return tool;
}

/** Where the photo's top is on the photo area, after every move has finished */
function photoTop(tool: Tool) {
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  return Math.round(tool.scaleState.originY);
}

/** A box opened, then the sheet's reports and the photo area's new size, in a given order */
function open(tool: Tool, id: string, order: Array<"stale" | "points" | "area">) {
  act(() => tool.selectBoxById(id));
  for (const step of order) {
    act(() => {
      if (step === "stale") tool.onSheetPoints(OPEN_STALE);
      if (step === "points") tool.onSheetPoints(OPEN);
      if (step === "area") tool.setState({ sheetStage: { width: WIDTH, height: CONTAINER - OPEN.collapsed } });
    });
  }
}

describe("a box opened on a phone or tablet", () => {
  for (const motion of [false, true]) {
    describe(motion ? "with reduced motion" : "with motion", () => {
      beforeEach(() => {
        reduced = motion;
      });

      it("leaves the photo where it was when the box is already clear of the sheet", () => {
        const tool = mount();
        expect(Math.round(tool.scaleState.originY)).toBe(77);
        open(tool, "tut1-box2", ["points", "area"]);
        expect(tool.state.sheetSnap).toBe("panel");
        expect(photoTop(tool)).toBe(77);
      });

      it("comes out the same whatever order the sheet and the photo area report in, a stale panel height included", () => {
        for (const order of [["points", "area"], ["area", "points"], ["stale", "area", "points"], ["stale", "points", "area"]] as const) {
          const tool = mount();
          open(tool, "tut1-box2", [...order]);
          expect(photoTop(tool)).toBe(77);
          act(() => root?.unmount());
          host.remove();
        }
      });

      it("moves a box low on the photo up only as far as keeps it 12 px clear of the sheet", () => {
        const tool = mount();
        open(tool, "low", ["stale", "area", "points"]);
        const top = photoTop(tool);
        const scale = tool.scaleState.scale;
        const boxBottom = top + (290 + 60) * scale;
        const sheetTop = CONTAINER - OPEN.panel;
        expect(boxBottom).toBeCloseTo(sheetTop - 12, 0);
        expect(top).toBeLessThan(77);
      });
    });
  }
});
