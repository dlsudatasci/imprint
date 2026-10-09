// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation from "./ReactPictureAnnotation";
import { readSessionData, writeSession, readCurrentCount, writeCurrentCount } from "@/util/sessionCache";

// Moving between images reloads the page
vi.mock("next/router", () => ({ default: { reload: vi.fn() } }));

/**
 * The real annotation tool, mounted in jsdom (8 Oct 2026): unsubmitted edits
 * are saved to the session cache as they happen and come back on a remount,
 * which is what a refresh or a resume does, and a box hidden on the photo
 * cannot be clicked. jsdom has no canvas, so nothing is painted; the tool
 * guards every paint on the canvas context.
 */
// The parts of the tool these tests drive, several of them private to it
type Shape = { getAnnotationData(): { id: string; editable?: boolean } };
type Gesture = { onMouseDown(x: number, y: number): void; onMouseMove(x: number, y: number): void; onMouseUp(): void };
type Tool = {
  state: { sceneLevel: { sidewalkWidth: string | null }; hiddenBoxIds: string[]; annotatorStep: string; submitting: boolean; error: string | null };
  submit(): Promise<void>;
  onPrevious(): Promise<void>;
  setState(update: object): void;
  selectedId: string | null;
  shapes: Shape[];
  currentTransformer: unknown;
  currentAnnotationState: Gesture;
  currentAnnotationData: Array<{ id: string }>;
  selectBoxById(id: string): void;
  onSelectObstruction(): void;
  onUnselectObstruction(): void;
  onSetSeverity(severity: number): void;
  onInputCommentChange(comment: string): void;
  onSetObstructs(obstructs: boolean): void;
  onDelete(): void;
  toggleBoxHidden(id: string): void;
  showAllBoxes(): void;
  isBoxHidden(id: string): boolean;
  enterObstructionStep(): void;
  onMouseDown(event: { nativeEvent: { offsetX: number; offsetY: number } }): void;
  onMouseMove(event: { nativeEvent: { offsetX: number; offsetY: number } }): void;
  onMouseUp(): void;
  currentImageElement?: { width: number; height: number };
};

const mark = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h, type: "RECT" });
const record = () => ({
  imageID: "IMG-1",
  url: "/photo.jpg",
  city: "manila",
  annotationList: [
    { id: "a-car", comment: "car", mark: mark(100, 100, 200, 120), editable: false, selected: false, isRejected: false },
    { id: "b-pole", comment: "utility_post", mark: mark(120, 110, 20, 80), editable: false, selected: false, isRejected: false },
    { id: "c-tree", comment: "tree", mark: mark(400, 50, 80, 200), editable: false, selected: false, isRejected: false },
  ],
});

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean; ResizeObserver: unknown };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  // jsdom has no canvas: the tool paints nothing and keeps working
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
});

let root: Root | null = null;
let host: HTMLDivElement;

function mount({ isAnnotator = false, current = 1 } = {}) {
  const data = readSessionData();
  const rec = data.imgRecords[current - 1];
  const ref = React.createRef<Tool>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ReactPictureAnnotation
        ref={ref as unknown as React.Ref<ReactPictureAnnotation>}
        image={rec.url}
        onSelect={() => undefined}
        onChange={() => undefined}
        width={960}
        height={600}
        annotationData={rec.annotationList}
        imageID={rec.imageID}
        city={rec.city}
        currentAnnotationCount={current}
        totalAnnotationCount={data.imgRecords.length}
        username="test"
        isAnnotator={isAnnotator}
      />
    );
  });
  return ref.current as unknown as Tool;
}

function unmount() {
  act(() => root?.unmount());
  root = null;
  host?.remove();
}

const saved = () => readSessionData().imgRecords[0];
const box = (id: string) => saved().annotationList.find((b: { id: string }) => b.id === id);

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: false } });
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe("saving unsubmitted edits (8 Oct 2026)", () => {
  it("saves a Yes and its severity shortly after the edit, and a remount restores them", () => {
    const tool = mount();
    act(() => {
      tool.selectBoxById("c-tree");
      tool.onSelectObstruction();
    });
    act(() => tool.onSetSeverity(4));
    // Nothing yet: the save waits for the edits to stop
    expect(box("c-tree").severity ?? null).toBeNull();
    act(() => vi.advanceTimersByTime(500));
    expect(box("c-tree")).toMatchObject({ selected: true, obstructs: true, severity: 4 });

    // A refresh: the page mounts the tool again from the session cache
    unmount();
    const again = mount();
    const tree = again.currentAnnotationData.find((b: { id: string }) => b.id === "c-tree");
    expect(tree).toMatchObject({ selected: true, obstructs: true, severity: 4 });
  });

  it("saves a contributor's Step 2 answer, and a remount restores it", () => {
    const tool = mount();
    act(() => tool.setState({ sceneLevel: { ...tool.state.sceneLevel, sidewalkWidth: "two_people" } }));
    act(() => vi.advanceTimersByTime(500));
    expect(saved().userSceneLevel).toMatchObject({ sidewalkWidth: "two_people" });
    unmount();
    expect(mount().state.sceneLevel.sidewalkWidth).toBe("two_people");
  });

  it("saves a waiting edit at once when the page is left", () => {
    const tool = mount();
    act(() => {
      tool.selectBoxById("a-car");
      tool.onUnselectObstruction();
    });
    expect(box("a-car").isRejected).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(box("a-car")).toMatchObject({ isRejected: true, obstructs: false });
  });

  it("does not save before the image's boxes are restored", () => {
    const before = JSON.stringify(saved());
    mount();
    act(() => vi.advanceTimersByTime(1000));
    // Mounting alone changes nothing that was cached
    expect(saved().annotationList.map((b: { id: string }) => b.id)).toEqual(JSON.parse(before).annotationList.map((b: { id: string }) => b.id));
  });

  it("writes nothing once the session cache is cleared, as Stop Session does", () => {
    const tool = mount();
    act(() => {
      tool.selectBoxById("a-car");
      tool.onUnselectObstruction();
    });
    window.localStorage.clear();
    act(() => vi.advanceTimersByTime(1000));
    expect(readSessionData()).toBeNull();
  });
});

describe("hiding boxes on the photo (8 Oct 2026)", () => {
  // Inside the car, away from the pole: (250, 150)
  const pressAt = (tool: Tool, x: number, y: number) =>
    act(() => {
      tool.currentAnnotationState.onMouseDown(x, y);
      tool.currentAnnotationState.onMouseUp();
    });

  it("a press on a visible box selects it", () => {
    const tool = mount();
    pressAt(tool, 250, 150);
    expect(tool.selectedId).toBe("a-car");
    expect(tool.shapes).toHaveLength(3);
  });

  it("a press where a hidden box is selects nothing there, so a new box can be drawn", () => {
    const tool = mount();
    act(() => tool.toggleBoxHidden("a-car"));
    expect(tool.state.hiddenBoxIds).toEqual(["a-car"]);
    act(() => {
      tool.currentAnnotationState.onMouseDown(250, 150);
      tool.currentAnnotationState.onMouseMove(290, 200);
      tool.currentAnnotationState.onMouseUp();
    });
    expect(tool.selectedId).not.toBe("a-car");
    // The drag drew a new box instead
    expect(tool.shapes).toHaveLength(4);
    expect(tool.shapes.some((s) => s.getAnnotationData().editable)).toBe(true);
  });

  it("hiding the open box closes its panel, and opening a hidden box shows it again", () => {
    const tool = mount();
    act(() => tool.selectBoxById("a-car"));
    expect(tool.selectedId).toBe("a-car");
    act(() => tool.toggleBoxHidden("a-car"));
    expect(tool.selectedId).toBeNull();
    act(() => tool.selectBoxById("a-car"));
    expect(tool.state.hiddenBoxIds).toEqual([]);
    expect(tool.selectedId).toBe("a-car");
  });

  it("Show all shows every hidden box, and hiding is never saved", () => {
    const tool = mount();
    act(() => {
      tool.toggleBoxHidden("a-car");
      tool.toggleBoxHidden("c-tree");
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(JSON.stringify(saved())).not.toContain("hidden");
    act(() => tool.showAllBoxes());
    expect(tool.state.hiddenBoxIds).toEqual([]);
  });

  it("every box shows again when an annotator moves on to Obstructions", () => {
    window.localStorage.clear();
    const rec = record();
    // Kept in Objects. A cached suggestion carries initialState, without which
    // the tool treats it as fresh from the model and resets it.
    rec.annotationList = rec.annotationList.map((b) => ({ ...b, selected: true, obstructs: null, initialState: { comment: b.comment, mark: b.mark } }));
    writeSession({ total: 1, current: 1, data: { imgRecords: [rec], isAnnotator: true } });
    const tool = mount({ isAnnotator: true });
    act(() => tool.toggleBoxHidden("a-car"));
    expect(tool.isBoxHidden("a-car")).toBe(true);
    act(() => tool.enterObstructionStep());
    expect(tool.state.annotatorStep).toBe("obstructions");
    expect(tool.state.hiddenBoxIds).toEqual([]);
    expect(tool.isBoxHidden("a-car")).toBe(false);
  });
});

describe("deleting a drawn box (8 Oct 2026)", () => {
  it("clears its resize handles, so the next press where it was starts a new box", () => {
    const tool = mount();
    // Draw a box in empty space and delete it
    act(() => {
      tool.currentAnnotationState.onMouseDown(600, 400);
      tool.currentAnnotationState.onMouseMove(700, 500);
      tool.currentAnnotationState.onMouseUp();
    });
    const drawnId = tool.shapes.find((s) => s.getAnnotationData().editable).getAnnotationData().id;
    act(() => {
      tool.selectedId = drawnId;
      tool.onDelete();
    });
    expect(tool.shapes).toHaveLength(3);
    expect(tool.currentTransformer).toBeNull();
    // A press inside where it was draws again rather than resizing a deleted box
    act(() => {
      tool.currentAnnotationState.onMouseDown(650, 450);
      tool.currentAnnotationState.onMouseMove(720, 520);
      tool.currentAnnotationState.onMouseUp();
    });
    expect(tool.shapes).toHaveLength(4);
  });
});

describe("moving on from an image (8 Oct 2026)", () => {
  // A contributor's image ready to send: every suggestion answered No, no sidewalk
  function ready(tool: Tool) {
    act(() => {
      for (const id of ["a-car", "b-pole", "c-tree"]) {
        tool.selectBoxById(id);
        tool.onUnselectObstruction();
      }
      tool.setState({ sceneLevel: { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: null, overallAccessibility: null } });
    });
  }

  function slowServer() {
    let respond: (r: { status: number }) => void = () => undefined;
    const fetchMock = vi.fn((url: string) =>
      url === "/api/annotationSubmit"
        ? new Promise((r) => { respond = r; })
        : Promise.resolve({ status: 200, ok: true, json: async () => ({}) })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return { fetchMock, respond: (status = 200) => respond({ status }) };
  }

  const submits = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.filter(([url]) => url === "/api/annotationSubmit").length;

  it("sends the image once and moves on by one when Next is pressed twice", async () => {
    const tool = mount();
    ready(tool);
    const { fetchMock, respond } = slowServer();
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = tool.submit();
      second = tool.submit();
    });
    expect(submits(fetchMock)).toBe(1);
    expect(tool.state.submitting).toBe(true);
    await act(async () => {
      respond(200);
      await first;
      await second;
    });
    expect(readCurrentCount()).toBe(2);
  });

  it("moves to the image after the one on screen, whatever the cache already says", async () => {
    const tool = mount();
    ready(tool);
    const { respond } = slowServer();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = tool.submit();
    });
    // As if an earlier send of this image had already moved the cache on
    writeCurrentCount(2);
    await act(async () => {
      respond(200);
      await pending;
    });
    expect(readCurrentCount()).toBe(2);
  });

  it("keeps a drawn box's drawn time on this device but never submits it (8 Oct 2026)", async () => {
    const tool = mount();
    ready(tool);
    act(() => {
      tool.currentAnnotationState.onMouseDown(600, 400);
      tool.currentAnnotationState.onMouseMove(700, 500);
      tool.currentAnnotationState.onMouseUp();
    });
    const drawnId = tool.selectedId as string;
    act(() => {
      tool.onInputCommentChange("bollard");
      tool.onSetObstructs(false);
    });
    act(() => vi.advanceTimersByTime(500));
    expect(typeof box(drawnId).drawnOrder).toBe("number");

    const { fetchMock, respond } = slowServer();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = tool.submit();
    });
    await act(async () => {
      respond(200);
      await pending;
    });
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/annotationSubmit") as unknown as [string, { body: string }];
    const sent = JSON.parse(call[1].body);
    expect(sent.newObjects).toHaveLength(1);
    expect(sent.newObjects[0].id).toBe(drawnId);
    expect(sent.newObjects[0]).not.toHaveProperty("drawnOrder");
    // Still in the session copy, so Previous and a refresh keep the numbering
    expect(typeof box(drawnId).drawnOrder).toBe("number");
  });

  it("lets a failed send be tried again", async () => {
    const tool = mount();
    ready(tool);
    const { fetchMock, respond } = slowServer();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = tool.submit();
    });
    await act(async () => {
      respond(500);
      await pending;
    });
    expect(tool.state.submitting).toBe(false);
    expect(tool.state.error).toMatch(/couldn't save/);
    act(() => {
      pending = tool.submit();
    });
    expect(submits(fetchMock)).toBe(2);
  });

  it("Previous goes back one from the image on screen, even if pressed twice", async () => {
    window.localStorage.clear();
    writeSession({ total: 3, current: 2, data: { imgRecords: [record(), record(), record()], isAnnotator: false } });
    const tool = mount({ current: 2 });
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    await act(async () => {
      await Promise.all([tool.onPrevious(), tool.onPrevious()]);
    });
    expect(readCurrentCount()).toBe(1);
  });
});

describe("selecting and closing by id, not by a simulated click (8 Oct 2026)", () => {
  it("opens a newly drawn box even when its corner lands on a smaller box", () => {
    const tool = mount();
    // Drawn from empty space up and to the left, ending with the new box's
    // top-left corner on the pole (which sits inside the car)
    act(() => {
      tool.currentAnnotationState.onMouseDown(350, 300);
      tool.currentAnnotationState.onMouseMove(125, 115);
      tool.currentAnnotationState.onMouseUp();
    });
    const drawn = tool.shapes.find((s) => s.getAnnotationData().editable);
    expect(drawn).toBeDefined();
    expect(tool.selectedId).toBe(drawn!.getAnnotationData().id);
    expect(tool.selectedId).not.toBe("b-pole");
  });

  it("closes the panel of a box in the photo's top-left corner", () => {
    window.localStorage.clear();
    const rec = record();
    rec.annotationList.push({ id: "z-corner", comment: "bench", mark: mark(0, 0, 60, 60), editable: false, selected: false, isRejected: false });
    writeSession({ total: 1, current: 1, data: { imgRecords: [rec], isAnnotator: false } });
    const tool = mount();
    act(() => tool.selectBoxById("z-corner"));
    expect(tool.selectedId).toBe("z-corner");
    // No closes the panel
    act(() => tool.onUnselectObstruction());
    expect(tool.selectedId).toBeNull();
    expect(tool.currentTransformer).toBeNull();
  });
});

describe("keeping boxes on the photo (8 Oct 2026)", () => {
  // The photo, 640 by 360, sits in a larger canvas with empty bands beside it.
  // In jsdom the canvas maps one to one, so a negative or too-large position
  // is a press in a band.
  function onPhoto() {
    const tool = mount();
    tool.currentImageElement = { width: 640, height: 360 };
    return tool;
  }
  const at = (offsetX: number, offsetY: number) => ({ nativeEvent: { offsetX, offsetY } });
  const press = (tool: Tool, path: Array<[number, number]>) =>
    act(() => {
      tool.onMouseDown(at(...path[0]));
      for (const p of path.slice(1)) tool.onMouseMove(at(...p));
      tool.onMouseUp();
    });
  const drawnMarks = (tool: Tool) =>
    tool.shapes.filter((sh) => sh.getAnnotationData().editable).map((sh) => (sh.getAnnotationData() as unknown as { mark: Record<string, number> }).mark);
  const markOf = (tool: Tool, id: string) =>
    (tool.shapes.find((sh) => sh.getAnnotationData().id === id)!.getAnnotationData() as unknown as { mark: Record<string, number> }).mark;

  it("starts a box pressed in the band above the photo on its top edge", () => {
    const tool = onPhoto();
    press(tool, [[500, -40], [560, 60]]);
    expect(drawnMarks(tool)).toEqual([expect.objectContaining({ x: 500, y: 0, width: 60, height: 60 })]);
  });

  it("stops a box drawn out of the photo at its edge", () => {
    const tool = onPhoto();
    press(tool, [[500, 280], [900, 500]]);
    expect(drawnMarks(tool)).toEqual([expect.objectContaining({ x: 500, y: 280, width: 140, height: 80 })]);
  });

  it("makes no box from a drag wholly in a band", () => {
    const tool = onPhoto();
    press(tool, [[500, -60], [600, -10]]);
    expect(drawnMarks(tool)).toEqual([]);
  });

  it("stops a box dragged past an edge at the edge, at its full size", () => {
    const tool = onPhoto();
    // The car is 200 by 120 at (100, 100). Grab it in the middle, drag it up and far right.
    press(tool, [[200, 160], [200, 20], [2000, 2000]]);
    expect(markOf(tool, "a-car")).toMatchObject({ x: 440, y: 240, width: 200, height: 120 });
  });

  it("stops a corner dragged past the edge at the edge", () => {
    const tool = onPhoto();
    act(() => tool.selectBoxById("a-car"));
    // The bottom-right resize handle sits on the car's corner, (300, 220)
    press(tool, [[300, 220], [900, 900]]);
    expect(markOf(tool, "a-car")).toMatchObject({ x: 100, y: 100, width: 540, height: 260 });
  });

  it("refuses to send a box left wholly off the photo, and says which", async () => {
    window.localStorage.clear();
    const rec = record();
    rec.annotationList.push({ id: "zz-off", comment: "bollard", mark: mark(50, -120, 40, 60), editable: true, selected: false, isRejected: false, obstructs: false } as never);
    writeSession({ total: 1, current: 1, data: { imgRecords: [rec], isAnnotator: false } });
    const tool = mount();
    tool.currentImageElement = { width: 640, height: 360 };
    act(() => {
      for (const id of ["a-car", "b-pole", "c-tree"]) {
        tool.selectBoxById(id);
        tool.onUnselectObstruction();
      }
      tool.setState({ sceneLevel: { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: null, overallAccessibility: null } });
    });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tool.state.error).toBe("Bollard is outside the photo. Move it onto the photo or delete it.");
  });

  it("shows the server's own reason when it refuses an image", async () => {
    const tool = mount();
    act(() => {
      for (const id of ["a-car", "b-pole", "c-tree"]) {
        tool.selectBoxById(id);
        tool.onUnselectObstruction();
      }
      tool.setState({ sceneLevel: { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: null, overallAccessibility: null } });
    });
    globalThis.fetch = vi.fn(async () => ({ status: 422, ok: false, json: async () => ({ message: "A box has no area inside the image." }) })) as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    expect(tool.state.error).toBe("A box has no area inside the image.");
  });
});
