// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation, { ZOOM_COPY, type PracticeLock } from "./ReactPictureAnnotation";
import { writeSession } from "@/util/sessionCache";
import { applyView, fitImage, panLimits, IDENTITY_VIEW, MAX_ZOOM, type Fit, type View } from "./viewTransform";

/**
 * Zoom on a laptop (S28, 13 Nov 2026). Zoom in and Zoom out at the photo's
 * top right, Fit beside them once zoomed in, the wheel moving a zoomed photo
 * (and the page scrolling at its edges), and Ctrl with the wheel or a trackpad
 * pinch zooming at the pointer. Never in the practice. Phones and tablets
 * keep pinch, and no buttons.
 *
 * jsdom lays nothing out: the desktop stage is 960 by 600 at a CSS scale of 1,
 * the canvas's rect is given, and a 640 by 360 photo fills the stage's width
 * (fit scale 1.5, 30 px down). Reduced motion, so each view change is at once.
 */
type Tool = {
  shapes: { getAnnotationData(): { id: string; editable?: boolean; mark: { x: number; y: number; width: number; height: number } } }[];
  selectBoxById(id: string): void;
  setState(s: object, cb?: () => void): void;
  currentImageElement: { width: number; height: number } | null;
  fit: Fit | null;
  view: View;
  scaleState: Fit;
  mouseDragCanvas: HTMLCanvasElement | null;
  state: { showInput: boolean; zoomed: boolean; inputPosition: { left: number; top: number } };
};

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h, type: "RECT" });
const boxes = [
  // Low on the right, to open and zoom about
  { id: "car", comment: "car", mark: rect(540, 260, 60, 60), editable: false, selected: false, isRejected: false },
  // Right at the top right corner, where the zoom controls are
  { id: "sign", comment: "sign", mark: rect(580, 4, 60, 40), editable: false, selected: false, isRejected: false },
];
const IMAGE = { width: 640, height: 360 };
const STAGE = { width: 960, height: 600 };

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
  // The canvas on screen at the stage's own size, at the page's top left
  HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 960, bottom: 600, width: 960, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
});

let root: Root | null = null;
let host: HTMLDivElement;
let ref: React.RefObject<ReactPictureAnnotation | null>;
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

function element(props: { image?: string; layout?: "desktop" | "sheet"; practiceLock?: PracticeLock | null }) {
  return (
    <ReactPictureAnnotation
      ref={ref}
      image={props.image ?? "/p.jpg"}
      onSelect={() => undefined}
      onChange={() => undefined}
      width={STAGE.width}
      height={STAGE.height}
      annotationData={JSON.parse(JSON.stringify(boxes))}
      imageID="IMG"
      city="manila"
      currentAnnotationCount={1}
      totalAnnotationCount={5}
      username="test"
      layout={props.layout ?? "desktop"}
      practiceLock={props.practiceLock ?? null}
    />
  );
}

/** The contributor tool on a laptop, the photo laid out at Fit */
function mount(props: { layout?: "desktop" | "sheet"; practiceLock?: PracticeLock | null } = {}): Tool {
  window.localStorage.clear();
  writeSession({ total: 5, current: 1, data: { imgRecords: [{ imageID: "IMG", url: "/p.jpg", annotationList: boxes, userHasSidewalk: true }], isAnnotator: false } });
  ref = React.createRef<ReactPictureAnnotation>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(element(props)));
  const tool = ref.current as unknown as Tool;
  tool.currentImageElement = { ...IMAGE };
  tool.fit = fitImage(IMAGE.width, IMAGE.height, STAGE.width, STAGE.height);
  tool.view = IDENTITY_VIEW;
  tool.scaleState = applyView(tool.fit!, tool.view);
  return tool;
}

const zoomIn = () => host.querySelector<HTMLButtonElement>("#zoom-in-button");
const zoomOut = () => host.querySelector<HTMLButtonElement>("#zoom-out-button");
const fitButton = () => host.querySelector<HTMLButtonElement>("#fit-button");
const click = (button: HTMLButtonElement | null) => act(() => button!.click());
const area = () => host.querySelector<HTMLElement>("[data-photo-area]")!;

/** A wheel over the photo, at a client point: whether the page's own scroll or zoom was stopped */
function wheel(init: WheelEventInit) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 480, clientY: 300, ...init });
  act(() => {
    area().dispatchEvent(event);
  });
  return event.defaultPrevented;
}

/** The image point under a stage point now */
const under = (tool: Tool, p: { x: number; y: number }) => ({ x: (p.x - tool.scaleState.originX) / tool.scaleState.scale, y: (p.y - tool.scaleState.originY) / tool.scaleState.scale });

describe("Zoom in and Zoom out on a laptop (S28)", () => {
  it("shows Zoom in and Zoom out at the photo's top right, with their names, and Fit only once zoomed in, beside them", () => {
    const tool = mount();
    const group = host.querySelector<HTMLElement>("[data-zoom-controls]")!;
    expect(group).not.toBeNull();
    expect(group.style.right).toBe("12px");
    expect(group.style.top).toBe("12px");
    expect(Array.from(group.querySelectorAll("button"), (b) => b.id)).toEqual(["zoom-in-button", "zoom-out-button"]);
    expect(zoomIn()!.getAttribute("aria-label")).toBe("Zoom in");
    expect(zoomIn()!.title).toBe("Zoom in");
    expect(zoomOut()!.getAttribute("aria-label")).toBe("Zoom out");
    expect(zoomOut()!.title).toBe("Zoom out");
    expect(ZOOM_COPY).toEqual({ in: "Zoom in", out: "Zoom out" });
    // Each 44 by 44, round
    for (const b of [zoomIn()!, zoomOut()!]) expect(b.className).toMatch(/\bh-11\b.*\bw-11\b|\bw-11\b.*\bh-11\b|h-11[\s\S]*w-11/);
    expect(fitButton()).toBeNull();
    click(zoomIn());
    expect(tool.view.zoom).toBeCloseTo(1.5);
    expect(tool.state.zoomed).toBe(true);
    // Beside the group (12 + 44 + 8 + 44 + 8), never on top of it
    expect(fitButton()!.style.right).toBe("116px");
    expect(fitButton()!.style.top).toBe("12px");
    click(fitButton());
    expect(tool.view).toEqual(IDENTITY_VIEW);
    expect(fitButton()).toBeNull();
  });

  it("steps by 1.5 about the middle, disables Zoom in at 5 and Zoom out at 1, and Zoom out to 1 is Fit", () => {
    const tool = mount();
    const middle = under(tool, { x: 480, y: 300 });
    expect(zoomOut()!.disabled).toBe(true);
    expect(zoomIn()!.disabled).toBe(false);
    const zooms: number[] = [];
    for (let i = 0; i < 4; i++) {
      click(zoomIn());
      zooms.push(tool.view.zoom);
      const now = under(tool, { x: 480, y: 300 });
      expect(now.x).toBeCloseTo(middle.x, 6);
      expect(now.y).toBeCloseTo(middle.y, 6);
    }
    expect(zooms.map((z) => Math.round(z * 1000) / 1000)).toEqual([1.5, 2.25, 3.375, MAX_ZOOM]);
    expect(zoomIn()!.disabled).toBe(true);
    expect(zoomOut()!.disabled).toBe(false);
    for (let i = 0; i < 4; i++) click(zoomOut());
    expect(tool.view).toEqual(IDENTITY_VIEW);
    expect(tool.state.zoomed).toBe(false);
    expect(zoomOut()!.disabled).toBe(true);
    expect(fitButton()).toBeNull();
  });

  it("keeps an open box in view, zooming about it", () => {
    const tool = mount();
    act(() => tool.selectBoxById("car"));
    expect(tool.state.showInput).toBe(true);
    const centre = { x: tool.scaleState.originX + 570 * tool.scaleState.scale, y: tool.scaleState.originY + 290 * tool.scaleState.scale };
    click(zoomIn());
    // About the box's centre: it has not moved
    const after = { x: tool.scaleState.originX + 570 * tool.scaleState.scale, y: tool.scaleState.originY + 290 * tool.scaleState.scale };
    expect(after.x).toBeCloseTo(centre.x, 4);
    expect(after.y).toBeCloseTo(centre.y, 4);
    for (let i = 0; i < 3; i++) click(zoomIn());
    expect(tool.view.zoom).toBe(MAX_ZOOM);
    // The whole box on the stage
    const { originX, originY, scale } = tool.scaleState;
    expect(originX + 540 * scale).toBeGreaterThanOrEqual(0);
    expect(originY + 260 * scale).toBeGreaterThanOrEqual(0);
    expect(originX + 600 * scale).toBeLessThanOrEqual(STAGE.width);
    expect(originY + 320 * scale).toBeLessThanOrEqual(STAGE.height);
  });

  it("keeps the panel of a box at the top right below the zoom controls", () => {
    const tool = mount();
    act(() => tool.selectBoxById("sign"));
    // The panel goes left of the box, level with its top (36 px), which is under the controls: it moves to below them
    expect(tool.state.inputPosition.top).toBe(12 + 44 + 8);
    act(() => tool.selectBoxById("car"));
    // A box lower down keeps its panel where it always went: level with it, but 220 px from the photo's bottom
    expect(tool.state.inputPosition.top).toBe(STAGE.height - 220);
  });

  it("has no zoom buttons in the practice, and the wheel and keys do nothing there", () => {
    const tool = mount({ practiceLock: { openable: "all", canDraw: true, allowAnswers: null } });
    expect(host.querySelector("[data-zoom-controls]")).toBeNull();
    expect(zoomIn()).toBeNull();
    expect(wheel({ deltaY: -100, ctrlKey: true })).toBe(false);
    act(() => {
      area().dispatchEvent(new Event("pointerenter"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true }));
    });
    expect(tool.view).toEqual(IDENTITY_VIEW);
  });

  it("goes back to Fit at once when the practice starts, with its buttons gone", () => {
    const tool = mount();
    click(zoomIn());
    click(zoomIn());
    expect(tool.view.zoom).toBeCloseTo(2.25);
    expect(tool.state.zoomed).toBe(true);
    act(() => root!.render(element({ practiceLock: { openable: "all", canDraw: true, allowAnswers: null } })));
    expect(tool.view).toEqual(IDENTITY_VIEW);
    expect(tool.scaleState).toEqual(tool.fit);
    expect(tool.state.zoomed).toBe(false);
    expect(fitButton()).toBeNull();
    expect(host.querySelector("[data-zoom-controls]")).toBeNull();
  });

  it("opens a new photo at Fit", () => {
    const tool = mount();
    click(zoomIn());
    click(zoomIn());
    expect(tool.view.zoom).toBeGreaterThan(2);
    act(() => root!.render(element({ image: "/q.jpg" })));
    expect(tool.view).toEqual(IDENTITY_VIEW);
    expect(tool.scaleState).toEqual(tool.fit);
    expect(tool.state.zoomed).toBe(false);
    expect(fitButton()).toBeNull();
    expect(zoomOut()!.disabled).toBe(true);
  });
});

describe("the wheel over the laptop's photo (S28)", () => {
  it("does nothing at Fit without Ctrl: the page scrolls", () => {
    const tool = mount();
    expect(wheel({ deltaY: 120 })).toBe(false);
    expect(wheel({ deltaX: 40 })).toBe(false);
    expect(tool.view).toEqual(IDENTITY_VIEW);
  });

  it("moves a zoomed photo by the scroll and keeps the page still", () => {
    const tool = mount();
    click(zoomIn());
    click(zoomIn());
    const before = { ...tool.view };
    expect(wheel({ deltaY: 100 })).toBe(true);
    expect(tool.view.panY).toBeCloseTo(before.panY - 100, 6);
    expect(tool.view.panX).toBeCloseTo(before.panX, 6);
    expect(tool.view.zoom).toBe(before.zoom);
    // Sideways, and lines as 16 px
    expect(wheel({ deltaX: 2, deltaMode: 1 })).toBe(true);
    expect(tool.view.panX).toBeCloseTo(before.panX - 32, 6);
  });

  it("lets the page scroll once the photo is at its edge that way", () => {
    const tool = mount();
    click(zoomIn());
    click(zoomIn());
    const limits = panLimits(tool.fit!, tool.view.zoom, STAGE, IMAGE);
    // Scrolled up as far as it goes: the photo's top at the stage's top
    act(() => tool.setState({}));
    tool.view = { ...tool.view, panY: limits.maxY };
    tool.scaleState = applyView(tool.fit!, tool.view);
    expect(wheel({ deltaY: -100 })).toBe(false);
    expect(tool.view.panY).toBe(limits.maxY);
    // The other way it still moves
    expect(wheel({ deltaY: 100 })).toBe(true);
  });

  it("zooms with Ctrl at the pointer, keeping the point under it, and stops the page zooming", () => {
    const tool = mount();
    const pointer = { x: 300, y: 200 };
    const before = under(tool, pointer);
    expect(wheel({ deltaY: -50, ctrlKey: true, clientX: pointer.x, clientY: pointer.y })).toBe(true);
    expect(tool.view.zoom).toBeCloseTo(Math.exp(0.5), 6);
    const after = under(tool, pointer);
    // Within a pixel on the stage
    expect(Math.abs(after.x - before.x) * tool.scaleState.scale).toBeLessThan(1);
    expect(Math.abs(after.y - before.y) * tool.scaleState.scale).toBeLessThan(1);
    // A trackpad pinch out (deltaY > 0 with ctrlKey) zooms back out, never below 1
    expect(wheel({ deltaY: 400, ctrlKey: true, clientX: pointer.x, clientY: pointer.y })).toBe(true);
    expect(tool.view.zoom).toBe(1);
    expect(tool.state.zoomed).toBe(false);
  });

  it("leaves a wheel over the open box's panel alone, so the panel or the page scrolls", () => {
    const tool = mount();
    click(zoomIn());
    act(() => tool.selectBoxById("car"));
    const panel = host.querySelector<HTMLElement>(".rp-selected-input")!;
    expect(panel).not.toBeNull();
    const before = { ...tool.view };
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
    act(() => {
      panel.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(tool.view).toEqual(before);
    const pinch = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -50, ctrlKey: true });
    act(() => {
      panel.dispatchEvent(pinch);
    });
    expect(tool.view).toEqual(before);
  });

  it("never zooms during a drag, and still keeps the page from zooming", () => {
    const tool = mount();
    tool.mouseDragCanvas = host.querySelector("canvas.rp-shapes");
    expect(wheel({ deltaY: -80, ctrlKey: true })).toBe(true);
    expect(tool.view).toEqual(IDENTITY_VIEW);
    tool.mouseDragCanvas = null;
  });
});

describe("drawing on a zoomed laptop photo (S28)", () => {
  // A mouse press on the canvas, moved and released on the window, as the tool follows a press (S18)
  function draw(tool: Tool, from: { x: number; y: number }, to: { x: number; y: number }) {
    const canvas = host.querySelector<HTMLCanvasElement>("canvas.rp-shapes")!;
    const stage = (p: { x: number; y: number }) => ({ x: tool.scaleState.originX + p.x * tool.scaleState.scale, y: tool.scaleState.originY + p.y * tool.scaleState.scale });
    const a = stage(from), b = stage(to);
    act(() => {
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: a.x, clientY: a.y });
      Object.defineProperty(down, "offsetX", { value: a.x });
      Object.defineProperty(down, "offsetY", { value: a.y });
      canvas.dispatchEvent(down);
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }));
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: b.x, clientY: b.y }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    return tool.shapes.filter((s) => s.getAnnotationData().editable).map((s) => s.getAnnotationData().mark);
  }

  it("stores a box drawn at zoom 2 in image px, the same as one drawn over the same spot at Fit", () => {
    const atFit = mount();
    const [one] = draw(atFit, { x: 100, y: 100 }, { x: 200, y: 180 });
    expect(one).toMatchObject({ x: 100, y: 100, width: 100, height: 80 });
    act(() => root!.unmount());
    root = null;
    host.remove();

    const zoomed = mount();
    click(zoomIn());
    click(zoomIn());
    // Moved somewhere else too, so the spot is not where it was on the stage
    wheel({ deltaY: -60, deltaX: -60 });
    expect(zoomed.view.zoom).toBeCloseTo(2.25);
    const [two] = draw(zoomed, { x: 100, y: 100 }, { x: 200, y: 180 });
    for (const key of ["x", "y", "width", "height"] as const) expect(two[key]).toBeCloseTo(one[key], 4);
  });
});

describe("the zoom keys on a laptop (S28)", () => {
  const key = (k: string, extra: KeyboardEventInit = {}, target: EventTarget = window) =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
    });

  it("zooms with + or =, out with -, and fits with 0, with the pointer over the photo", () => {
    const tool = mount();
    key("+");
    // Not over the photo: nothing
    expect(tool.view).toEqual(IDENTITY_VIEW);
    act(() => {
      area().dispatchEvent(new Event("pointerenter"));
    });
    key("+");
    expect(tool.view.zoom).toBeCloseTo(1.5);
    key("=");
    expect(tool.view.zoom).toBeCloseTo(2.25);
    key("-");
    expect(tool.view.zoom).toBeCloseTo(1.5);
    key("0");
    expect(tool.view).toEqual(IDENTITY_VIEW);
    // Ctrl or Cmd with them zooms the page, not the photo
    key("+", { ctrlKey: true });
    key("=", { metaKey: true });
    expect(tool.view).toEqual(IDENTITY_VIEW);
    act(() => {
      area().dispatchEvent(new Event("pointerleave"));
    });
    key("+");
    expect(tool.view).toEqual(IDENTITY_VIEW);
  });

  it("never zooms while typing in a field", () => {
    const tool = mount();
    act(() => {
      area().dispatchEvent(new Event("pointerenter"));
    });
    const input = document.createElement("input");
    host.appendChild(input);
    key("+", {}, input);
    key("-", {}, input);
    expect(tool.view).toEqual(IDENTITY_VIEW);
  });
});

describe("phones and tablets (S28): unchanged", () => {
  it("has no Zoom in or Zoom out, and Fit at the top right edge as before", () => {
    const tool = mount({ layout: "sheet" });
    expect(host.querySelector("[data-zoom-controls]")).toBeNull();
    expect(zoomIn()).toBeNull();
    expect(zoomOut()).toBeNull();
    act(() => tool.setState({ zoomed: true }));
    expect(fitButton()!.style.right).toBe("12px");
    expect(fitButton()!.textContent).toBe("Fit");
  });

  it("leaves the wheel to the page in the sheet layout", () => {
    const tool = mount({ layout: "sheet" });
    tool.view = { zoom: 2, panX: -100, panY: -100 };
    expect(wheel({ deltaY: 100 })).toBe(false);
    expect(wheel({ deltaY: -100, ctrlKey: true })).toBe(false);
    expect(tool.view).toEqual({ zoom: 2, panX: -100, panY: -100 });
  });
});
