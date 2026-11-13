// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation, { SESSION_CHANGED_MESSAGE, SESSION_CHANGED_RELOAD_MS, ADD_BOX_COPY, ADD_BOX_HINT_MS } from "./ReactPictureAnnotation";
import { readSessionData, writeSession, readCurrentCount, writeCurrentCount } from "@/util/sessionCache";
import { emptySceneLevel } from "@/util/validators/sceneQuestions.mjs";
import { LOUPE_SIZE_PX, LOUPE_BOX_GAP_PX, LOUPE_MARGIN_PX, LOUPE_FINGER_CLEAR_PX } from "./loupe";
import { PANEL_WIDTH, PANEL_ROOM_BELOW } from "./panelPosition";
import { messageVisibleMs } from "@/features/annotate/stepMessage";

// The magnifier against the box being fitted (15 Oct 2026), CSS px in the photo area
type LoupeTool = {
  state: { loupe: { left: number; top: number } | null; inputPosition: { left: number; top: number }; showInput: boolean };
  scaleState: { scale: number; originX: number; originY: number };
  displayScale: number;
  stageSize(): { width: number; height: number };
  sheetCover(): number;
  shapes: Array<{ getAnnotationData(): { id: string; mark: { x: number; y: number; width: number; height: number } } }>;
};
type Edges = { x1: number; y1: number; x2: number; y2: number };
const asLoupeTool = (tool: unknown) => tool as LoupeTool;
function loupeEdges(tool: unknown): Edges {
  const loupe = asLoupeTool(tool).state.loupe!;
  return { x1: loupe.left, y1: loupe.top, x2: loupe.left + LOUPE_SIZE_PX, y2: loupe.top + LOUPE_SIZE_PX };
}
/** The box as drawn now, CSS px, grown by the gap the magnifier keeps from it */
function boxEdgesCss(tool: unknown, id: string): Edges {
  const t = asLoupeTool(tool);
  const m = t.shapes.find((sh) => sh.getAnnotationData().id === id)!.getAnnotationData().mark;
  const { scale, originX, originY } = t.scaleState;
  const ds = t.displayScale;
  const x = (v: number) => (v * scale + originX) * ds;
  const y = (v: number) => (v * scale + originY) * ds;
  return {
    x1: x(Math.min(m.x, m.x + m.width)) - LOUPE_BOX_GAP_PX,
    y1: y(Math.min(m.y, m.y + m.height)) - LOUPE_BOX_GAP_PX,
    x2: x(Math.max(m.x, m.x + m.width)) + LOUPE_BOX_GAP_PX,
    y2: y(Math.max(m.y, m.y + m.height)) + LOUPE_BOX_GAP_PX,
  };
}
const edgesOverlap = (a: Edges, b: Edges) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
/** Inside the part of the photo area not under the sheet, 8 px in */
function expectLoupeInPhoto(tool: unknown) {
  const t = asLoupeTool(tool);
  const loupe = loupeEdges(tool);
  const ds = t.displayScale;
  const stage = t.stageSize();
  expect(loupe.x1).toBeGreaterThanOrEqual(LOUPE_MARGIN_PX);
  expect(loupe.y1).toBeGreaterThanOrEqual(LOUPE_MARGIN_PX);
  expect(loupe.x2).toBeLessThanOrEqual(stage.width * ds - LOUPE_MARGIN_PX);
  expect(loupe.y2).toBeLessThanOrEqual((stage.height - t.sheetCover()) * ds - LOUPE_MARGIN_PX);
}

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
  onMarkNotAnObject(): void;
  onPhotoShown(): void;
  onSetSeverity(severity: number): void;
  onInputCommentChange(comment: string): void;
  onSetObstructs(obstructs: boolean): void;
  onSetOnSidewalk(onSidewalk: boolean): void;
  onChangeSeverity(severity: number): void;
  onClose(): void;
  hideAllBoxes(): void;
  onDelete(): void;
  toggleBoxHidden(id: string): void;
  showAllBoxes(): void;
  isBoxHidden(id: string): boolean;
  isOffPhoto(id: string): boolean;
  enterObstructionStep(): void;
  onMouseDown(event: { nativeEvent: { offsetX: number; offsetY: number } }): void;
  onMouseMove(event: { nativeEvent: { offsetX: number; offsetY: number } }): void;
  onMouseUp(): void;
  currentImageElement?: { width: number; height: number };
};

const mark = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h, type: "RECT" });
// A complete Step 3 for a sidewalk (S15)
const COMPLETE_SCENE = { sidewalkWidth: "two_people", overallAccessibility: 5, surfaceEvenness: 3, surfaceType: "concrete", surfaceCondition: 3, roadBarrier: false };
const record = () => ({
  imageID: "IMG-1",
  url: "/photo.jpg",
  city: "manila",
  // Step 1 answered Yes (S15), so the boxes open
  userHasSidewalk: true,
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

let toolRef = React.createRef<Tool>();

type MountOptions = {
  isAnnotator?: boolean;
  current?: number;
  layout?: "desktop" | "sheet";
  askSidewalk?: boolean;
  focus?: boolean;
  onEnterFocus?: () => void;
  onExitFocus?: () => void;
  tau?: number;
  onDesktopMessage?: (shown: boolean) => void;
};

function element({ isAnnotator = false, current = 1, layout = "desktop", askSidewalk, focus, onEnterFocus, onExitFocus, tau, onDesktopMessage }: MountOptions = {}) {
  const data = readSessionData();
  const rec = data.imgRecords[current - 1];
  return (
    <ReactPictureAnnotation
      ref={toolRef as unknown as React.Ref<ReactPictureAnnotation>}
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
      layout={layout}
      askSidewalk={askSidewalk}
      focus={focus}
      onEnterFocus={onEnterFocus}
      onExitFocus={onExitFocus}
      tau={tau}
      onDesktopMessage={onDesktopMessage}
    />
  );
}

function mount(options: MountOptions = {}) {
  toolRef = React.createRef<Tool>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(element(options));
  });
  return toolRef.current as unknown as Tool;
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
      tool.onSetOnSidewalk(true);
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

  // 22 Oct 2026: answers run worst to best. A page cached before the change has
  // no userSceneScale and its answers ran the other way
  it("marks the answers it saves, and turns a cached answer from before the change round", () => {
    const tool = mount();
    act(() => tool.setState({ sceneLevel: COMPLETE_SCENE }));
    act(() => vi.advanceTimersByTime(500));
    expect(saved().userSceneScale).toBe(2);
    unmount();
    expect(mount().state.sceneLevel).toEqual(COMPLETE_SCENE);
    unmount();

    // Old-scale numbers are turned round, surfaceEvenness (born higher is better, S15) never. A stored
    // Evenness 1 (Uneven, before S27) is kept as it is: the row shows no answer and Next Image asks again.
    const old = { ...record(), userSceneLevel: { ...COMPLETE_SCENE, overallAccessibility: 1, surfaceCondition: 1, surfaceEvenness: 1 } };
    writeSession({ total: 1, current: 1, data: { imgRecords: [old], isAnnotator: false } });
    expect(mount().state.sceneLevel).toEqual({ ...COMPLETE_SCENE, overallAccessibility: 5, surfaceCondition: 3, surfaceEvenness: 1 });
  });

  it("saves a waiting edit at once when the page is left", () => {
    const tool = mount();
    act(() => {
      tool.selectBoxById("a-car");
      tool.onSetOnSidewalk(true);
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
      tool.onSetOnSidewalk(true);
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

// S12 (2 Nov 2026): a contributor first says whether each object is on the
// sidewalk or the path people walk on. No takes the box off the photo and
// lists it under Not obstructions, as a real object that does not obstruct.
describe("the sidewalk question (S12, 2 Nov 2026)", () => {
  type Data = Record<string, unknown>;
  const data = (tool: Tool, id: string) => tool.shapes.find((sh) => sh.getAnnotationData().id === id)!.getAnnotationData() as unknown as Data;
  const sidewalkNo = (tool: Tool, id: string) => act(() => {
    tool.selectBoxById(id);
    tool.onSetOnSidewalk(false);
  });
  const noList = () => host.querySelector("#object-tray-not-obstructions")!;
  const chipOf = (label: string) =>
    Array.from(noList().querySelectorAll('[data-tray="notObstructions"]')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
  const panelText = () => host.querySelector(".rp-selected-input")?.textContent ?? "";
  const QUESTION = "Is it on the sidewalk?";

  it("No records a suggestion as a real object that does not obstruct, closes its panel and takes it off the photo, without hiding it", () => {
    const tool = mount();
    act(() => tool.selectBoxById("a-car"));
    expect(panelText()).toContain(QUESTION);
    expect(panelText()).not.toContain("obstruct the sidewalk?");
    act(() => tool.onSetOnSidewalk(false));
    expect(tool.selectedId).toBeNull();
    expect(data(tool, "a-car")).toMatchObject({ comment: "car", onSidewalk: false, obstructs: false, severity: null, selected: false, isRejected: true });
    expect(tool.isOffPhoto("a-car")).toBe(true);
    expect(tool.isBoxHidden("a-car")).toBe(false);
    expect(tool.state.hiddenBoxIds).toEqual([]);
    expect(noList().textContent).toContain("Car #1");
    expect(host.querySelector("#object-tray-off-sidewalk")).toBeNull();
    expect(host.textContent).not.toContain("walking path");
    // Its chip has no eye: the box is off the photo already
    expect(chipOf("Car #1")!.parentElement!.querySelector("[data-eye]")).toBeNull();
  });

  it("a press where it was does not pick it, and Show all does not bring it back", () => {
    const tool = mount();
    sidewalkNo(tool, "a-car");
    // Inside the car, away from the pole
    act(() => {
      tool.currentAnnotationState.onMouseDown(250, 150);
      tool.currentAnnotationState.onMouseUp();
    });
    expect(tool.selectedId).not.toBe("a-car");
    act(() => tool.showAllBoxes());
    expect(tool.isOffPhoto("a-car")).toBe(true);
  });

  it("its chip opens it, the box shows while the panel is open, and Yes moves on to the obstruction question", () => {
    const tool = mount();
    sidewalkNo(tool, "a-car");
    act(() => chipOf("Car #1")!.click());
    expect(tool.selectedId).toBe("a-car");
    expect(tool.isOffPhoto("a-car")).toBe(false);
    expect(panelText()).toContain(QUESTION);
    act(() => tool.onSetOnSidewalk(true));
    expect(tool.selectedId).toBe("a-car");
    expect(data(tool, "a-car")).toMatchObject({ onSidewalk: true, selected: false, isRejected: false, severity: null });
    expect(data(tool, "a-car").obstructs).toBeUndefined();
    expect(panelText()).toContain("Does Car obstruct the sidewalk?");
    // Closed, it is back on the photo, still to decide
    act(() => (tool as unknown as { onClose(): void }).onClose());
    expect(tool.isOffPhoto("a-car")).toBe(false);
    expect(noList().textContent).not.toContain("Car #1");
  });

  // S17 (4 Nov 2026): Back to Question 1 replaced Go back, which cleared both answers
  it("Back to Question 1 on the obstruction question shows the sidewalk question and changes no answer", () => {
    const tool = mount();
    act(() => {
      tool.selectBoxById("a-car");
      tool.onSetOnSidewalk(true);
      tool.onUnselectObstruction();
    });
    act(() => tool.selectBoxById("a-car"));
    expect(panelText()).toContain("obstruct the sidewalk?");
    const before = JSON.stringify(data(tool, "a-car"));
    act(() => (host.querySelector('.rp-selected-input [data-control="back-to-question-1"]') as HTMLButtonElement).click());
    expect(JSON.stringify(data(tool, "a-car"))).toBe(before);
    expect(tool.selectedId).toBe("a-car");
    expect(panelText()).toContain(QUESTION);
    expect(host.querySelector('.rp-selected-input [data-control="back"]')).toBeNull();
  });

  it("Not an object leaves no sidewalk answer on the box", () => {
    const tool = mount();
    act(() => {
      tool.selectBoxById("a-car");
      tool.onSetOnSidewalk(true);
      tool.onMarkNotAnObject();
    });
    expect(data(tool, "a-car")).toMatchObject({ comment: "not_an_object", obstructs: false });
    expect(data(tool, "a-car")).not.toHaveProperty("onSidewalk");
  });

  it("a drawn box answered No leaves the photo too, with obstructs false", () => {
    const tool = mount();
    // Away from every suggestion
    act(() => {
      tool.currentAnnotationState.onMouseDown(700, 400);
      tool.currentAnnotationState.onMouseMove(760, 480);
      tool.currentAnnotationState.onMouseUp();
    });
    const drawn = tool.shapes.find((sh) => sh.getAnnotationData().editable)!.getAnnotationData().id;
    act(() => {
      tool.selectBoxById(drawn);
      tool.onInputCommentChange("bench");
      tool.onSetOnSidewalk(false);
    });
    expect(data(tool, drawn)).toMatchObject({ editable: true, onSidewalk: false, obstructs: false, severity: null });
    expect(tool.isOffPhoto(drawn)).toBe(true);
    expect(noList().textContent).toContain("Bench #1");
  });

  it("a box answered No is saved, and comes back off the photo when the session is resumed", () => {
    const tool = mount();
    sidewalkNo(tool, "a-car");
    act(() => vi.advanceTimersByTime(500));
    expect(box("a-car")).toMatchObject({ onSidewalk: false, obstructs: false, isRejected: true });
    unmount();
    const again = mount();
    expect(data(again, "a-car")).toMatchObject({ onSidewalk: false, obstructs: false });
    expect(again.isOffPhoto("a-car")).toBe(true);
    expect(noList().textContent).toContain("Car #1");
  });

  it("sends onSidewalk on every real box, and logs a suggestion off the walking path as off_sidewalk at the time of its No", async () => {
    vi.setSystemTime(new Date("2026-11-02T09:00:00Z"));
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const tool = mount();
    act(() => tool.onPhotoShown());
    act(() => vi.advanceTimersByTime(1500));
    sidewalkNo(tool, "a-car");
    act(() => {
      tool.selectBoxById("b-pole");
      tool.onSetOnSidewalk(true);
    });
    // The time to answer runs on to the obstruction answer
    act(() => vi.advanceTimersByTime(1000));
    act(() => tool.onUnselectObstruction());
    act(() => {
      tool.selectBoxById("c-tree");
      tool.onMarkNotAnObject();
    });
    act(() => tool.setState({ sceneLevel: COMPLETE_SCENE }));
    await act(async () => {
      await tool.submit();
    });
    expect(tool.state.error).toBeNull();
    const call = fetchMock.mock.calls.find((c) => (c as unknown as [string])[0] === "/api/annotationSubmit") as unknown as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    const sent = (id: string) => body.selectedObjectsID.find((b: { id: string }) => b.id === id);
    expect(sent("a-car")).toMatchObject({ comment: "car", onSidewalk: false, obstructs: false, isRejected: true });
    expect(sent("b-pole")).toMatchObject({ onSidewalk: true, obstructs: false, isRejected: true });
    expect(sent("c-tree")).not.toHaveProperty("onSidewalk");
    const entry = (id: string) => body.telemetry.suggestionConfidences.find((e: { id: string }) => e.id === id);
    expect(entry("a-car")).toMatchObject({ disposition: "off_sidewalk", obstructs: false, msToAnswer: 1500 });
    expect(entry("b-pole")).toMatchObject({ disposition: "accepted", obstructs: false, msToAnswer: 2500 });
    expect(entry("c-tree")).toMatchObject({ disposition: "removed" });
    expect(body.telemetry).toMatchObject({ offSidewalkSuggestionCount: 1, removedSuggestionCount: 1, totalBoxesSubmitted: 2, nonObstructionCount: 2 });
  });

  it("is never asked of annotators", () => {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
    const tool = mount({ isAnnotator: true });
    act(() => {
      tool.selectBoxById("a-car");
      tool.onSetOnSidewalk(false);
    });
    expect(data(tool, "a-car")).not.toHaveProperty("onSidewalk");
    expect(tool.isOffPhoto("a-car")).toBe(false);
    expect(panelText()).not.toContain(QUESTION);
  });
});

// 10 Oct 2026: hiding the open box from its panel, Hide all, and the open
// object's chip highlighted, for both roles
describe("hiding from the panel and Hide all (10 Oct 2026)", () => {
  const button = (root: Element | null, text: string) =>
    Array.from(root?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

  it("hides the open box from its panel's eye, which closes the panel", () => {
    for (const isAnnotator of [false, true]) {
      window.localStorage.clear();
      writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator } });
      const tool = mount({ isAnnotator });
      act(() => tool.selectBoxById("a-car"));
      const eye = host.querySelector('.rp-selected-input button[aria-label="Hide this box on the photo"]') as HTMLButtonElement;
      expect(eye).not.toBeNull();
      act(() => eye.click());
      expect(tool.isBoxHidden("a-car")).toBe(true);
      expect(tool.selectedId).toBeNull();
      expect(host.querySelector(".rp-selected-input")).toBeNull();
      unmount();
    }
  });

  it("hides every box with Hide all and shows them with Show all, for both roles", () => {
    for (const isAnnotator of [false, true]) {
      window.localStorage.clear();
      writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator } });
      const tool = mount({ isAnnotator });
      act(() => tool.selectBoxById("b-pole"));
      const list = () => host.querySelector("#box-review-section");
      act(() => button(list(), "Hide all")!.click());
      for (const id of ["a-car", "b-pole", "c-tree"]) expect(tool.isBoxHidden(id)).toBe(true);
      expect(tool.selectedId).toBeNull();
      expect(button(list(), "Hide all")).toBeUndefined();
      expect(list()!.textContent).toContain("3 boxes hidden");
      act(() => button(list(), "Show all")!.click());
      expect(tool.state.hiddenBoxIds).toEqual([]);
      unmount();
    }
  });

  it("highlights the open object's chip in the annotators' Objects in This Image", () => {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
    const tool = mount({ isAnnotator: true });
    act(() => tool.selectBoxById("c-tree"));
    const current = host.querySelectorAll('#box-review-section [aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Tree #1");
    expect(current[0].closest("li")!.className).toContain("bg-primary-50");
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
        tool.onSetOnSidewalk(true);
        tool.onUnselectObstruction();
      }
      tool.setState({ sceneLevel: COMPLETE_SCENE });
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
      tool.onSetOnSidewalk(true);
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

  it("marks the image as drawn on the fixed canvas (photo frame fix, 9 Oct 2026) and its answers on the new scale", async () => {
    const tool = mount();
    ready(tool);
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
    expect(JSON.parse(call[1].body).canvasVersion).toBe(2);
    // Step 2's answers on the scale where higher is better (22 Oct 2026)
    expect(JSON.parse(call[1].body).sceneScale).toBe(2);
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

  // 23 Oct 2026: a phone left overnight held a session that was no longer the account's current one
  it("when Next is refused because the session changed, says so and loads the current session", async () => {
    const tool = mount();
    ready(tool);
    const Router = (await import("next/router")).default as unknown as { reload: ReturnType<typeof vi.fn> };
    Router.reload.mockClear();
    sessionStorage.removeItem("isNavigatingImages");
    globalThis.fetch = vi.fn(async (url: string) =>
      url === "/api/annotationSubmit"
        ? { status: 403, ok: false, json: async () => ({ message: "That image is not part of your current session.", code: "IMAGE_NOT_IN_SESSION" }) }
        : { status: 200, ok: true, json: async () => ({}) }
    ) as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    expect(tool.state.error).toBe(SESSION_CHANGED_MESSAGE);
    // Still saving, so Next cannot be pressed again while it loads
    expect(tool.state.submitting).toBe(true);
    expect(Router.reload).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SESSION_CHANGED_RELOAD_MS));
    // The saved copy gone, and a cold reload, so the annotate page asks the server
    expect(readSessionData()).toBeNull();
    expect(Router.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("isNavigatingImages")).toBeNull();
  });

  it("keeps the session for any other refusal", async () => {
    const tool = mount();
    ready(tool);
    globalThis.fetch = vi.fn(async (url: string) =>
      url === "/api/annotationSubmit"
        ? { status: 422, ok: false, json: async () => ({ message: "Invalid sidewalk width value." }) }
        : { status: 200, ok: true, json: async () => ({}) }
    ) as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    expect(tool.state.error).toBe("Invalid sidewalk width value.");
    act(() => vi.advanceTimersByTime(SESSION_CHANGED_RELOAD_MS));
    expect(readSessionData()).not.toBeNull();
    expect(tool.state.submitting).toBe(false);
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

describe("the timing two quality checks need (S10, 28 Oct 2026)", () => {
  const MINUTE = 60 * 1000;

  function fastServer() {
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }
  const sentTelemetry = (fetchMock: ReturnType<typeof vi.fn>) => {
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/annotationSubmit") as unknown as [string, { body: string }];
    return JSON.parse(call[1].body).telemetry;
  };
  const answerNo = (tool: Tool, id: string) => act(() => {
    tool.selectBoxById(id);
    tool.onSetOnSidewalk(true);
    tool.onUnselectObstruction();
  });
  const noSidewalk = (tool: Tool) => act(() => {
    tool.setState({ sceneLevel: COMPLETE_SCENE });
  });
  const interact = (type: "pointerdown" | "keydown" | "touchstart") => act(() => {
    const event = type === "keydown" ? new KeyboardEvent(type, { bubbles: true }) : new Event(type, { bubbles: true });
    document.body.dispatchEvent(event);
  });
  const confidence = (telemetry: { suggestionConfidences: Array<{ id: string }> }, id: string) =>
    telemetry.suggestionConfidences.find((entry) => entry.id === id);

  beforeEach(() => vi.setSystemTime(new Date("2026-10-28T09:00:00Z")));

  it("sends a contributor's longest idle, the time from its end to submit, and each suggestion's time to answer", async () => {
    const tool = mount();
    act(() => tool.onPhotoShown());
    act(() => vi.advanceTimersByTime(2000));
    interact("pointerdown");
    answerNo(tool, "a-car");
    // Away for 11 minutes, then a key press
    act(() => vi.advanceTimersByTime(11 * MINUTE));
    interact("keydown");
    act(() => vi.advanceTimersByTime(500));
    interact("touchstart");
    answerNo(tool, "b-pole");
    act(() => vi.advanceTimersByTime(1000));
    act(() => {
      tool.selectBoxById("c-tree");
      tool.onMarkNotAnObject();
    });
    noSidewalk(tool);
    act(() => vi.advanceTimersByTime(1000));
    interact("pointerdown");
    const fetchMock = fastServer();
    await act(async () => {
      await tool.submit();
    });
    const telemetry = sentTelemetry(fetchMock);
    expect(telemetry.msLongestIdle).toBe(11 * MINUTE);
    expect(telemetry.msFromLastIdleToSubmit).toBe(2500);
    expect(confidence(telemetry, "a-car")).toMatchObject({ disposition: "accepted", obstructs: false, msToAnswer: 2000 });
    expect(confidence(telemetry, "b-pole")).toMatchObject({ disposition: "accepted", obstructs: false, msToAnswer: 2000 + 11 * MINUTE + 500 });
    expect(confidence(telemetry, "c-tree")).toMatchObject({ disposition: "removed", msToAnswer: 2000 + 11 * MINUTE + 1500 });
  });

  it("sends null under 10 minutes idle, and for an answer restored after a refresh", async () => {
    const restored = record();
    Object.assign(restored.annotationList[0], {
      onSidewalk: true,
      isRejected: true,
      obstructs: false,
      initialState: { comment: "car", mark: mark(100, 100, 200, 120) },
    });
    writeSession({ total: 1, current: 1, data: { imgRecords: [restored], isAnnotator: false } });
    const tool = mount();
    act(() => tool.onPhotoShown());
    act(() => vi.advanceTimersByTime(3000));
    interact("pointerdown");
    answerNo(tool, "b-pole");
    answerNo(tool, "c-tree");
    noSidewalk(tool);
    act(() => vi.advanceTimersByTime(4000));
    interact("pointerdown");
    const fetchMock = fastServer();
    await act(async () => {
      await tool.submit();
    });
    const telemetry = sentTelemetry(fetchMock);
    expect(telemetry.msLongestIdle).toBe(4000);
    expect(telemetry.msFromLastIdleToSubmit).toBeNull();
    expect(confidence(telemetry, "a-car")).toMatchObject({ disposition: "accepted", msToAnswer: null });
    expect(confidence(telemetry, "b-pole")).toMatchObject({ msToAnswer: 3000 });
  });

  it("does not start the time to answer before the photo shows", async () => {
    const tool = mount();
    act(() => vi.advanceTimersByTime(900));
    for (const id of ["a-car", "b-pole", "c-tree"]) answerNo(tool, id);
    noSidewalk(tool);
    const fetchMock = fastServer();
    await act(async () => {
      await tool.submit();
    });
    for (const entry of sentTelemetry(fetchMock).suggestionConfidences) expect(entry.msToAnswer).toBeNull();
  });

  it("sends none of it for annotators", async () => {
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
    const tool = mount({ isAnnotator: true }) as Tool & { state: { obstructionsConfirmed: boolean } };
    act(() => tool.onPhotoShown());
    act(() => vi.advanceTimersByTime(11 * MINUTE));
    interact("pointerdown");
    act(() => {
      for (const shape of tool.shapes) (shape.getAnnotationData() as { selected?: boolean }).selected = true;
      tool.enterObstructionStep();
    });
    act(() => tool.setState({ obstructionsConfirmed: true }));
    const fetchMock = fastServer();
    await act(async () => {
      await tool.submit();
    });
    const telemetry = sentTelemetry(fetchMock);
    expect(telemetry.msObjectStep).toEqual(expect.any(Number));
    expect(telemetry).not.toHaveProperty("msLongestIdle");
    expect(telemetry).not.toHaveProperty("msFromLastIdleToSubmit");
    expect(telemetry.suggestionConfidences).toHaveLength(3);
    for (const entry of telemetry.suggestionConfidences) expect(entry).not.toHaveProperty("msToAnswer");
  });

  it("stops listening when the tool unmounts", () => {
    const removed = vi.spyOn(window, "removeEventListener");
    mount();
    unmount();
    for (const type of ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"]) {
      expect(removed.mock.calls.some(([name]) => name === type)).toBe(true);
    }
    removed.mockRestore();
  });
});

describe("what was done to each suggestion, in the manuscript's names (S6, 29 Oct 2026)", () => {
  type Entry = { id: string; disposition: string; obstructs: boolean | null };
  async function sentEntries(tool: Tool) {
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    const calls = fetchMock.mock.calls as unknown as Array<[string, { body: string }]>;
    const call = calls.find(([url]) => url === "/api/annotationSubmit")!;
    const telemetry = JSON.parse(call[1].body).telemetry;
    lastTelemetry = telemetry;
    const entries: Entry[] = telemetry.suggestionConfidences;
    return new Map(entries.map((entry) => [entry.id, entry]));
  }
  let lastTelemetry: Record<string, unknown> = {};

  it("sends a contributor's No as an object answered No, not a deleted box", async () => {
    const tool = mount();
    act(() => {
      tool.selectBoxById("a-car");
      tool.onSetOnSidewalk(true);
      tool.onUnselectObstruction();
      tool.selectBoxById("b-pole");
      tool.onSetOnSidewalk(true);
      tool.onSelectObstruction();
    });
    act(() => tool.onSetSeverity(3));
    act(() => {
      tool.selectBoxById("c-tree");
      tool.onMarkNotAnObject();
      tool.setState({ sceneLevel: COMPLETE_SCENE });
    });
    const entries = await sentEntries(tool);
    expect(entries.get("a-car")).toMatchObject({ disposition: "accepted", obstructs: false });
    expect(entries.get("b-pole")).toMatchObject({ disposition: "accepted", obstructs: true });
    expect(entries.get("c-tree")).toMatchObject({ disposition: "removed" });
    for (const entry of Array.from(entries.values())) expect(entry).not.toHaveProperty("action");
    // Nothing sent says deleted, in the entries or the image's counts
    expect(JSON.stringify(lastTelemetry)).not.toContain("deleted");
    // The image's counts agree: the No is accepted, Not an object removed
    expect(lastTelemetry).toMatchObject({
      acceptedSuggestionCount: 2,
      removedSuggestionCount: 1,
      relabeledSuggestionCount: 0,
      modifiedSuggestionCount: 0,
      obstructionCount: 1,
      nonObstructionCount: 1,
      // Every real object: the Yes and the No
      totalBoxesSubmitted: 2,
    });
  });

  it("sends an annotator's confirmed obstruction answers, false for every object not marked", async () => {
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
    const tool = mount({ isAnnotator: true });
    act(() => {
      for (const shape of tool.shapes) (shape.getAnnotationData() as { selected?: boolean }).selected = true;
      tool.enterObstructionStep();
    });
    act(() => {
      (tool.shapes.find((shape) => shape.getAnnotationData().id === "c-tree")!.getAnnotationData() as { obstructs?: boolean }).obstructs = true;
      tool.setState({ obstructionsConfirmed: true });
    });
    const entries = await sentEntries(tool);
    expect(entries.get("c-tree")).toMatchObject({ disposition: "accepted", obstructs: true });
    expect(entries.get("a-car")).toMatchObject({ disposition: "accepted", obstructs: false });
    expect(entries.get("b-pole")).toMatchObject({ disposition: "accepted", obstructs: false });
  });
});

describe("the batch's suggestion threshold (S2, 29 Oct 2026)", () => {
  // Confidences 0.9, 0.4 and 0.2: the pole shows under τ 0.3, not under 0.5
  function writeConfidences() {
    const rec = record();
    const confidences: Record<string, number> = { "a-car": 0.9, "b-pole": 0.4, "c-tree": 0.2 };
    for (const box of rec.annotationList) Object.assign(box, { confidence: confidences[box.id] });
    writeSession({ total: 1, current: 1, data: { imgRecords: [rec], isAnnotator: false } });
  }
  const shownIds = (tool: Tool) => tool.shapes.map((shape) => shape.getAnnotationData().id).sort();

  async function sentTelemetry(tool: Tool, answer: string[]) {
    act(() => {
      for (const id of answer) {
        tool.selectBoxById(id);
        tool.onSetOnSidewalk(true);
        tool.onUnselectObstruction();
      }
      tool.setState({ sceneLevel: COMPLETE_SCENE });
    });
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    const calls = fetchMock.mock.calls as unknown as Array<[string, { body: string }]>;
    return JSON.parse(calls.find(([url]) => url === "/api/annotationSubmit")![1].body).telemetry;
  }

  it("shows the suggestions at or above the batch's τ and logs it as tauThreshold", async () => {
    writeConfidences();
    const tool = mount({ tau: 0.3 });
    expect(shownIds(tool)).toEqual(["a-car", "b-pole"]);
    const telemetry = await sentTelemetry(tool, ["a-car", "b-pole"]);
    expect(telemetry.tauThreshold).toBe(0.3);
    expect(telemetry.hiddenSuggestionCount).toBe(1);
  });

  it("uses 0.5 when the batch has no τ, as the tutorial does", async () => {
    writeConfidences();
    const tool = mount();
    expect(shownIds(tool)).toEqual(["a-car"]);
    const telemetry = await sentTelemetry(tool, ["a-car"]);
    expect(telemetry.tauThreshold).toBe(0.5);
    expect(telemetry.hiddenSuggestionCount).toBe(2);
  });

  it("uses 0.5 for a τ that is not a number from 0 to 1", () => {
    writeConfidences();
    const tool = mount({ tau: 7 });
    expect(shownIds(tool)).toEqual(["a-car"]);
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
    act(() => { tool.onSetOnSidewalk(true); tool.onUnselectObstruction(); });
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

  // The same magnifier as on touch, while a handle is dragged with the mouse
  // (10 Oct 2026), for contributors and annotators
  it("shows the magnifier while a corner or edge handle is dragged with the mouse, for both roles", () => {
    for (const isAnnotator of [false, true]) {
      window.localStorage.clear();
      writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator } });
      const tool = mount({ isAnnotator });
      tool.currentImageElement = { width: 640, height: 360 };
      const loupe = () => (tool.state as unknown as { loupe: { left: number; top: number } | null }).loupe;
      act(() => tool.selectBoxById("a-car"));
      // The bottom-right corner handle, (300, 220)
      act(() => tool.onMouseDown(at(300, 220)));
      expect(loupe()).toBeNull();
      act(() => tool.onMouseMove(at(330, 240)));
      expect(loupe()).toEqual({ left: expect.any(Number), top: expect.any(Number) });
      act(() => tool.onMouseUp());
      expect(loupe()).toBeNull();
      expect(markOf(tool, "a-car")).toMatchObject({ width: 230, height: 140 });
      // The right edge's middle handle, now at (330, 170)
      act(() => tool.onMouseDown(at(330, 170)));
      act(() => tool.onMouseMove(at(360, 170)));
      expect(loupe()).toEqual({ left: expect.any(Number), top: expect.any(Number) });
      act(() => (tool as unknown as { onMouseLeave(): void }).onMouseLeave());
      expect(loupe()).toBeNull();
      // Drawing a new box, or moving one, shows none
      act(() => tool.onMouseDown(at(200, 160)));
      act(() => tool.onMouseMove(at(220, 170)));
      expect(loupe()).toBeNull();
      act(() => tool.onMouseUp());
      unmount();
    }
  });

  it("keeps the magnifier outside the box, inside the photo and off the box's panel while a handle is dragged with the mouse, for both roles (15 Oct 2026)", () => {
    for (const isAnnotator of [false, true]) {
      window.localStorage.clear();
      writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator } });
      const tool = mount({ isAnnotator });
      tool.currentImageElement = { width: 640, height: 360 };
      act(() => tool.selectBoxById("a-car"));
      const t = asLoupeTool(tool);
      const check = () => {
        const loupe = loupeEdges(tool);
        expect(edgesOverlap(loupe, boxEdgesCss(tool, "a-car"))).toBe(false);
        expectLoupeInPhoto(tool);
        // The panel beside the box, as wide and tall as the tool takes it when the page has no layout
        expect(t.state.showInput).toBe(true);
        const ds = t.displayScale;
        const { left, top } = t.state.inputPosition;
        expect(edgesOverlap(loupe, { x1: left * ds, y1: top * ds, x2: (left + PANEL_WIDTH) * ds, y2: (top + PANEL_ROOM_BELOW) * ds })).toBe(false);
      };
      // The bottom-right corner, (300, 220). As before the magnifier sat on the car, 96 px above the pointer.
      act(() => tool.onMouseDown(at(300, 220)));
      act(() => tool.onMouseMove(at(330, 240)));
      check();
      act(() => tool.onMouseUp());
      // The right edge's middle, now at (330, 170)
      act(() => tool.onMouseDown(at(330, 170)));
      act(() => tool.onMouseMove(at(360, 170)));
      check();
      act(() => tool.onMouseUp());
      unmount();
    }
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
        tool.onSetOnSidewalk(true);
        tool.onUnselectObstruction();
      }
      tool.setState({ sceneLevel: COMPLETE_SCENE });
    });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tool.state.error).toBe("Bollard #1 is outside the photo. Move it onto the photo or delete it.");
  });

  it("shows the server's own reason when it refuses an image", async () => {
    const tool = mount();
    act(() => {
      for (const id of ["a-car", "b-pole", "c-tree"]) {
        tool.selectBoxById(id);
        tool.onSetOnSidewalk(true);
        tool.onUnselectObstruction();
      }
      tool.setState({ sceneLevel: COMPLETE_SCENE });
    });
    globalThis.fetch = vi.fn(async () => ({ status: 422, ok: false, json: async () => ({ message: "A box has no area inside the image." }) })) as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    expect(tool.state.error).toBe("A box has no area inside the image.");
  });
});

// Contributors on phones and tablets (9 Oct 2026): real pointer events from a
// finger on the photo, in the sheet layout. The canvas is the 960 by 600 stage
// shown at its own size, so a CSS px on it is an image px here.
describe("touch on the photo (9 Oct 2026)", () => {
  const realMatchMedia = window.matchMedia;
  const realRect = HTMLCanvasElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    // A phone: a finger is the primary pointer, and no animation
    window.matchMedia = ((query: string) => ({
      matches: query.includes("coarse") || query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 960, height: 600, right: 960, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
    HTMLCanvasElement.prototype.getBoundingClientRect = realRect;
  });

  function onPhone() {
    const tool = mount({ layout: "sheet" });
    tool.currentImageElement = { width: 640, height: 360 };
    return tool;
  }
  const canvas = () => host.querySelector("canvas.rp-shapes") as HTMLCanvasElement;
  const fire = (type: string, x: number, y: number, { id = 1, pointerType = "touch" } = {}) =>
    act(() => {
      canvas().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y }));
    });
  const markOf = (tool: Tool, id: string) =>
    ({ ...(tool.shapes.find((sh) => sh.getAnnotationData().id === id)!.getAnnotationData() as unknown as { mark: Record<string, number> }).mark });
  const CAR = { x: 100, y: 100, width: 200, height: 120 };

  it("selects a suggestion on a tap and leaves its mark as it was, and leaves a mouse's pointer events to the mouse handlers", () => {
    const tool = onPhone();
    fire("pointerdown", 200, 160, { pointerType: "mouse" });
    fire("pointerup", 200, 160, { pointerType: "mouse" });
    expect(tool.selectedId).toBeNull();
    fire("pointerdown", 200, 160);
    fire("pointermove", 203, 162);
    fire("pointerup", 203, 162);
    expect(tool.selectedId).toBe("a-car");
    expect(markOf(tool, "a-car")).toMatchObject(CAR);
  });

  it("moves the selected box on a drag past the slop, and saves the edit", () => {
    const tool = onPhone();
    act(() => tool.selectBoxById("a-car"));
    fire("pointerdown", 200, 160);
    fire("pointermove", 204, 160);
    expect(markOf(tool, "a-car")).toMatchObject(CAR);
    fire("pointermove", 230, 170);
    fire("pointerup", 230, 170);
    expect(markOf(tool, "a-car")).toMatchObject({ x: 130, y: 110, width: 200, height: 120 });
    act(() => vi.advanceTimersByTime(500));
    expect(box("a-car").mark).toMatchObject({ x: 130, y: 110 });
  });

  it("keeps the magnifier outside the box and off the finger while a corner is dragged, and above the sheet when it is pulled up (15 Oct 2026)", () => {
    const tool = onPhone();
    act(() => tool.selectBoxById("a-car"));
    const clear = (x: number, y: number) => ({ x1: x - LOUPE_FINGER_CLEAR_PX, y1: y - LOUPE_FINGER_CLEAR_PX, x2: x + LOUPE_FINGER_CLEAR_PX, y2: y + LOUPE_FINGER_CLEAR_PX });
    // The bottom-right corner, (300, 220)
    fire("pointerdown", 305, 224);
    fire("pointermove", 345, 254);
    expect(edgesOverlap(loupeEdges(tool), boxEdgesCss(tool, "a-car"))).toBe(false);
    expect(edgesOverlap(loupeEdges(tool), clear(345, 254))).toBe(false);
    expectLoupeInPhoto(tool);
    fire("pointerup", 345, 254);
    expect(asLoupeTool(tool).state.loupe).toBeNull();

    // The sheet pulled up over the bottom of the photo: the magnifier stays above it
    (tool as unknown as { sheetPoints: Record<string, number> }).sheetPoints = { collapsed: 0, half: 300, full: 400, panel: 300 };
    act(() => tool.setState({ sheetSnap: "half" }));
    expect(asLoupeTool(tool).sheetCover()).toBe(300);
    // The corner is now at (340, 250)
    fire("pointerdown", 342, 252);
    fire("pointermove", 360, 262);
    expect(edgesOverlap(loupeEdges(tool), boxEdgesCss(tool, "a-car"))).toBe(false);
    expect(edgesOverlap(loupeEdges(tool), clear(360, 262))).toBe(false);
    expectLoupeInPhoto(tool);
    fire("pointerup", 360, 262);
  });

  it("resizes the selected box from the corner dragged, showing the magnifier while it moves", () => {
    const tool = onPhone();
    act(() => tool.selectBoxById("a-car"));
    // The bottom-right corner is at (300, 220)
    fire("pointerdown", 305, 224);
    fire("pointermove", 345, 254);
    expect((tool.state as unknown as { loupe: unknown }).loupe).not.toBeNull();
    fire("pointerup", 345, 254);
    expect(markOf(tool, "a-car")).toMatchObject({ x: 100, y: 100, width: 240, height: 150 });
    expect((tool.state as unknown as { loupe: unknown }).loupe).toBeNull();
  });

  it("puts the box back when a second finger lands mid-drag", () => {
    const tool = onPhone();
    act(() => tool.selectBoxById("a-car"));
    fire("pointerdown", 200, 160);
    fire("pointermove", 240, 180);
    expect(markOf(tool, "a-car").x).toBe(140);
    fire("pointerdown", 400, 300, { id: 2 });
    expect(markOf(tool, "a-car")).toMatchObject(CAR);
    fire("pointerup", 240, 180);
    fire("pointerup", 400, 300, { id: 2 });
    expect(markOf(tool, "a-car")).toMatchObject(CAR);
  });

  it("puts the box back on a pointercancel", () => {
    const tool = onPhone();
    act(() => tool.selectBoxById("a-car"));
    fire("pointerdown", 200, 160);
    fire("pointermove", 240, 180);
    expect(markOf(tool, "a-car").x).toBe(140);
    fire("pointercancel", 240, 180);
    expect(markOf(tool, "a-car")).toMatchObject(CAR);
  });

  it("on a phone the open box is the only box on the photo until it closes (14 Oct 2026), and on the desktop layout too for contributors only (S17)", () => {
    const tool = onPhone();
    act(() => tool.selectBoxById("c-tree"));
    expect(tool.isBoxHidden("c-tree")).toBe(false);
    expect(tool.isBoxHidden("a-car")).toBe(true);
    expect(tool.isBoxHidden("b-pole")).toBe(true);
    act(() => (tool as unknown as { onClose(): void }).onClose());
    expect(tool.isBoxHidden("a-car")).toBe(false);

    unmount();
    const desktop = mount();
    act(() => desktop.selectBoxById("c-tree"));
    expect(desktop.isBoxHidden("a-car")).toBe(true);

    unmount();
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
    const annotator = mount({ isAnnotator: true });
    act(() => annotator.selectBoxById("c-tree"));
    expect(annotator.isBoxHidden("a-car")).toBe(false);
  });

  it("puts Show all and Hide all beside the step's name at the top of the sheet, and the list pulled up no longer repeats them (14 Oct 2026)", () => {
    const tool = onPhone();
    const peek = () => host.querySelector("#box-review-section-peek")!;
    const peekButton = (text: string) => Array.from(peek().querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
    expect(peek().textContent).toContain("Step 2: Identify Objects");
    expect(peekButton("Hide all")).toBeDefined();
    expect(host.querySelector("#box-review-section [data-hidden-summary]")).toBeNull();
    act(() => peekButton("Hide all")!.click());
    for (const id of ["a-car", "b-pole", "c-tree"]) expect(tool.isBoxHidden(id)).toBe(true);
    expect(peekButton("Hide all")).toBeUndefined();
    act(() => peekButton("Show all 3")!.click());
    expect(tool.state.hiddenBoxIds).toEqual([]);
  });

  it("adds an editable box with Add box, selects it, and lists it as still to decide", () => {
    const tool = onPhone();
    const button = host.querySelector("#add-box-button") as HTMLButtonElement;
    expect(button.textContent).toContain("Add box");
    act(() => button.click());
    const added = tool.shapes.map((sh) => sh.getAnnotationData()).find((d) => d.editable);
    expect(added).toBeDefined();
    expect(tool.selectedId).toBe(added!.id);
    // Centred on the photo, 30% of it each way
    expect(markOf(tool, added!.id)).toMatchObject({ x: 224, y: 126, width: 192, height: 108 });
    expect(host.textContent).toContain("Drag the corners to fit the object.");
    // Closed without an answer, it waits under Still to decide with the three suggestions
    act(() => (tool as unknown as { onClose(): void }).onClose());
    const peek = host.querySelector("#box-review-section-peek")!;
    expect(peek.textContent).toContain("Still to decide 4");
    expect(host.querySelector("#box-review-section")!.textContent).toContain("Still to decide 4");
    expect(host.querySelector('#box-review-section [data-tray="toDecide"][title="Drawn by you"]')!.textContent).toContain("Select a category");
  });

  it("renders the box panel in the answers sheet, not over the photo", () => {
    const tool = onPhone();
    act(() => tool.selectBoxById("a-car"));
    expect(host.querySelector(".rp-selected-input")).toBeNull();
    // The sidewalk question first (S12)
    expect(host.querySelector("#answer-sheet")!.textContent).toContain("Is it on the sidewalk?");
  });

  it("keeps every box and the selection when the layout switches to desktop", () => {
    const tool = onPhone();
    act(() => tool.selectBoxById("a-car"));
    const count = tool.shapes.length;
    act(() => root!.render(element({ layout: "desktop" })));
    expect(toolRef.current).toBe(tool);
    expect(tool.shapes).toHaveLength(count);
    expect(tool.selectedId).toBe("a-car");
    expect(host.querySelector(".rp-selected-input")!.textContent).toContain("Is it on the sidewalk?");
    expect(host.querySelector("#answer-sheet")).toBeNull();
  });
});

// Annotators on phones and tablets, and the full-screen photo (12 Oct 2026).
// Real pointer events from a finger, as in "touch on the photo" above.
describe("annotators on a phone, and the full-screen photo (12 Oct 2026)", () => {
  const realMatchMedia = window.matchMedia;
  const realRect = HTMLCanvasElement.prototype.getBoundingClientRect;
  let coarse = true;

  beforeEach(() => {
    coarse = true;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("coarse") ? coarse : query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 960, height: 600, right: 960, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
    HTMLCanvasElement.prototype.getBoundingClientRect = realRect;
  });

  type Editor = {
    mask: { polygons: Array<{ id: string; kind: string; points: Array<{ x: number; y: number }> }> };
    draft: { points: unknown[] } | null;
    selectedId: string | null;
    selectedPoint: number | null;
    drag: unknown;
  };
  type AnnotatorTool = Tool & {
    enterSidewalkStep(): void;
    enterObstructionStep(): void;
    getSidewalkState(): Editor;
    dispatchSidewalk(action: { type: string; [key: string]: unknown }): void;
    state: Tool["state"] & { sheetSnap: string; annotatorStep: string; obstructionsConfirmed: boolean };
  };

  function annotator(options: MountOptions = {}) {
    const tool = mount({ isAnnotator: true, layout: "sheet", askSidewalk: true, ...options }) as AnnotatorTool;
    tool.currentImageElement = { width: 640, height: 360 };
    return tool;
  }
  const canvas = () => host.querySelector("canvas.rp-shapes") as HTMLCanvasElement;
  const fire = (type: string, x: number, y: number, { id = 1, pointerType = "touch" } = {}) =>
    act(() => {
      canvas().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y }));
    });
  const tap = (x: number, y: number, options = {}) => {
    fire("pointerdown", x, y, options);
    fire("pointerup", x, y, options);
  };
  const sheet = () => host.querySelector("#answer-sheet");
  const button = (scope: Element | null, text: string) =>
    Array.from(scope?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
  const data = (tool: Tool, id: string) =>
    tool.shapes.find((sh) => sh.getAnnotationData().id === id)!.getAnnotationData() as unknown as { selected?: boolean; obstructs?: boolean | null; comment?: string };
  /** Every suggestion kept, so Objects is done */
  const keepAll = (tool: Tool) => {
    for (const id of ["a-car", "b-pole", "c-tree"]) data(tool, id).selected = true;
  };
  /** A square outline drawn with taps: four points, then the first point again */
  const drawSquare = () => {
    for (const [x, y] of [[300, 250], [500, 250], [500, 330], [300, 330]]) tap(x, y);
    tap(303, 252);
  };
  const submit = () => host.querySelector("button[type='submit']") as HTMLButtonElement;

  it("Objects: a tap opens the annotators' panel in the sheet, Keep keeps the box, and Add box asks for a category", () => {
    const tool = annotator();
    // A mouse's pointer events are left to the mouse handlers, in every step
    tap(200, 160, { pointerType: "mouse" });
    expect(tool.selectedId).toBeNull();
    tap(200, 160);
    expect(tool.selectedId).toBe("a-car");
    expect(host.querySelector(".rp-selected-input")).toBeNull();
    const keep = button(sheet(), "Keep")!;
    expect(keep.className).toContain("min-h-[44px]");
    expect(sheet()!.querySelector("select")!.className).toContain("text-base");
    act(() => keep.click());
    expect(data(tool, "a-car").selected).toBe(true);
    expect(tool.selectedId).toBeNull();
    // The top of the sheet says what is left, with Next
    expect(host.querySelector("#box-review-section-peek")!.textContent).toContain("To decide 2");

    act(() => (host.querySelector("#add-box-button") as HTMLButtonElement).click());
    const added = tool.shapes.map((sh) => sh.getAnnotationData()).find((d) => d.editable)!;
    expect(tool.selectedId).toBe(added.id);
    expect(sheet()!.textContent).toContain("Select a category");
  });

  it("Objects: an open box is the only box on the photo until it closes, and boxes hidden before stay hidden (14 Oct 2026)", () => {
    const tool = annotator();
    act(() => tool.toggleBoxHidden("b-pole"));
    tap(440, 150);
    expect(tool.selectedId).toBe("c-tree");
    expect(tool.isBoxHidden("c-tree")).toBe(false);
    expect(tool.isBoxHidden("a-car")).toBe(true);
    expect(tool.isBoxHidden("b-pole")).toBe(true);
    // Focus is not hiding: the list's eyes still say only the pole is hidden
    expect(tool.state.hiddenBoxIds).toEqual(["b-pole"]);
    // A tap where the car is closes the tree, as the car is out of the way
    tap(250, 160);
    expect(tool.selectedId).toBeNull();
    expect(tool.isBoxHidden("a-car")).toBe(false);
    expect(tool.isBoxHidden("b-pole")).toBe(true);

    // A box just added is alone on the photo too, until its panel closes
    act(() => (host.querySelector("#add-box-button") as HTMLButtonElement).click());
    const added = tool.shapes.map((sh) => sh.getAnnotationData()).find((d) => d.editable)!;
    expect(tool.selectedId).toBe(added.id);
    for (const id of ["a-car", "b-pole", "c-tree"]) expect(tool.isBoxHidden(id)).toBe(true);
    act(() => (tool as unknown as { onClose(): void }).onClose());
    expect(tool.isBoxHidden("a-car")).toBe(false);
    expect(tool.isBoxHidden(added.id)).toBe(false);
  });

  it("Objects: the chips put the suggestions still to decide first, and Show all and Hide all sit beside the step's name (14 Oct 2026)", () => {
    const tool = annotator();
    const peek = () => host.querySelector("#box-review-section-peek")!;
    const chips = () => Array.from(peek().querySelectorAll('ul[aria-label="Objects in this image"] li')).map((li) => li.textContent);
    expect(chips()).toEqual(["Car #1To decide", "Utility Post #1To decide", "Tree #1To decide"]);
    act(() => {
      data(tool, "a-car").selected = true;
      tool.setState({});
    });
    expect(chips()).toEqual(["Utility Post #1To decide", "Tree #1To decide", "Car #1Kept"]);

    // Beside the heading: Hide all, then Show all with how many are hidden
    expect(button(peek(), "Hide all")).toBeDefined();
    expect(button(peek(), "Show all 1")).toBeUndefined();
    act(() => button(peek(), "Hide all")!.click());
    for (const id of ["a-car", "b-pole", "c-tree"]) expect(tool.isBoxHidden(id)).toBe(true);
    expect(button(peek(), "Hide all")).toBeUndefined();
    act(() => button(peek(), "Show all 3")!.click());
    expect(tool.state.hiddenBoxIds).toEqual([]);
    // Pulled up, the card no longer repeats them
    expect(button(host.querySelector("#box-review-section"), "Hide all")).toBeUndefined();
  });

  it("Objects: a new box with no category goes with the suggestions still to decide, at the front of the chips and the list (17 Oct 2026)", () => {
    const tool = annotator();
    const peekChips = () =>
      Array.from(host.querySelector("#box-review-section-peek")!.querySelectorAll('ul[aria-label="Objects in this image"] li')).map((li) => li.textContent);
    const listChips = () => Array.from(host.querySelector("#box-review-section")!.querySelectorAll("li")).map((li) => li.textContent);
    act(() => {
      data(tool, "a-car").selected = true;
      tool.setState({});
    });
    // A box added and closed without a category: after the suggestions still to decide, before the kept car
    act(() => (host.querySelector("#add-box-button") as HTMLButtonElement).click());
    const added = tool.shapes.map((sh) => sh.getAnnotationData()).find((d) => d.editable)!;
    act(() => (tool as unknown as { onClose(): void }).onClose());
    // A drawn box has the pencil, read out as "drawn by you", and says No category until it has one
    expect(peekChips()).toEqual(["Utility Post #1To decide", "Tree #1To decide", "Select a category, drawn by youNo category", "Car #1Kept"]);
    expect(listChips()).toEqual(["Utility Post #1To decide", "Tree #1To decide", "Select a category, drawn by youNo category", "Car #1Kept"]);
    // With a category it is finished, and goes back after the decided ones
    act(() => {
      (added as unknown as { comment: string }).comment = "bench";
      tool.setState({});
    });
    expect(peekChips()).toEqual(["Utility Post #1To decide", "Tree #1To decide", "Car #1Kept", "Bench #1, drawn by you"]);
    expect(listChips()).toEqual(["Utility Post #1To decide", "Tree #1To decide", "Car #1Kept", "Bench #1, drawn by you"]);
  });

  it("Objects: the count and Next take in a box with no category, and the row says so once every box is decided (17 Oct 2026)", () => {
    const tool = annotator();
    const peek = () => host.querySelector("#box-review-section-peek")!;
    keepAll(tool);
    act(() => tool.setState({}));
    expect(peek().textContent).toContain("Every box is decided.");
    act(() => (host.querySelector("#add-box-button") as HTMLButtonElement).click());
    const added = tool.shapes.map((sh) => sh.getAnnotationData()).find((d) => d.editable)!;
    act(() => (tool as unknown as { onClose(): void }).onClose());
    // Every suggestion is decided, but the new box is still left
    expect(peek().textContent).toContain("To decide 1");
    expect(peek().textContent).not.toContain("Every box is decided.");
    act(() => button(peek(), "Next")!.click());
    expect(tool.selectedId).toBe(added.id);
    act(() => (tool as unknown as { onClose(): void }).onClose());
    // With a suggestion left too, Next opens the first chip, the suggestion
    act(() => {
      data(tool, "b-pole").selected = false;
      tool.setState({});
    });
    expect(peek().textContent).toContain("To decide 2");
    act(() => button(peek(), "Next")!.click());
    expect(tool.selectedId).toBe("b-pole");
    act(() => {
      data(tool, "b-pole").selected = true;
      (added as unknown as { comment: string }).comment = "bench";
      (tool as unknown as { onClose(): void }).onClose();
    });
    expect(peek().textContent).toContain("Every box is decided.");
  });

  it("Objects: a double tap where a hidden box is shows it again, and two slow taps do not (14 Oct 2026)", () => {
    const tool = annotator();
    act(() => tool.toggleBoxHidden("c-tree"));
    const now = vi.spyOn(Date, "now");
    try {
      now.mockReturnValue(10_000);
      tap(440, 150);
      now.mockReturnValue(10_000 + 1_000);
      tap(440, 150);
      expect(tool.isBoxHidden("c-tree")).toBe(true);
      now.mockReturnValue(20_000);
      tap(440, 150);
      now.mockReturnValue(20_250);
      tap(445, 155);
      expect(tool.isBoxHidden("c-tree")).toBe(false);
      expect(tool.state.hiddenBoxIds).toEqual([]);
      // Shown, not opened
      expect(tool.selectedId).toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  it("Objects: the magnifier stays outside the box while a corner is dragged (15 Oct 2026)", () => {
    const tool = annotator();
    act(() => tool.selectBoxById("c-tree"));
    // The tree's bottom-left corner, (400, 250)
    fire("pointerdown", 402, 248);
    fire("pointermove", 380, 290);
    expect(asLoupeTool(tool).state.loupe).not.toBeNull();
    expect(edgesOverlap(loupeEdges(tool), boxEdgesCss(tool, "c-tree"))).toBe(false);
    expectLoupeInPhoto(tool);
    fire("pointerup", 380, 290);
    expect(asLoupeTool(tool).state.loupe).toBeNull();
  });

  it("the footer names the step's button and keeps it the submit button, with Back in later steps", () => {
    const tool = annotator();
    expect(submit().textContent).toBe("Next: Sidewalk");
    expect(button(host, "Back")).toBeUndefined();
    keepAll(tool);
    act(() => tool.enterSidewalkStep());
    expect(tool.state.annotatorStep).toBe("sidewalk");
    expect(submit().textContent).toBe("Next: Obstructions");
    expect(submit().getAttribute("type")).toBe("submit");
    expect(button(host, "Back")!.getAttribute("aria-label")).toBe("Back to Objects");
    // The step's heading and tools are at the top of the sheet, with the touch hint.
    // Before a shape is started the only tool is Photo only (13 Oct 2026).
    expect(sheet()!.textContent).toContain("Step 2 of 3: Sidewalk");
    expect(sheet()!.querySelector("#sidewalk-tools")!.textContent).toBe("Photo only");
    expect(sheet()!.textContent).toContain("Tap the photo to start a shape around the walking space.");
  });

  it("Sidewalk: taps add points, a tap on the first point closes the shape, and the outline is saved", () => {
    const tool = annotator();
    keepAll(tool);
    act(() => tool.enterSidewalkStep());
    tap(300, 250, { pointerType: "mouse" });
    expect(tool.getSidewalkState().draft).toBeNull();
    tap(300, 250);
    expect(tool.getSidewalkState().draft!.points).toHaveLength(1);
    tap(500, 250);
    tap(500, 330);
    tap(300, 330);
    expect(tool.getSidewalkState().mask.polygons).toHaveLength(0);
    tap(303, 252);
    const { mask, draft } = tool.getSidewalkState();
    expect(draft).toBeNull();
    expect(mask.polygons).toHaveLength(1);
    expect(mask.polygons[0]).toMatchObject({ kind: "walk", points: [{ x: 300, y: 250 }, { x: 500, y: 250 }, { x: 500, y: 330 }, { x: 300, y: 330 }] });
    expect(saved().userSidewalkMask.polygons).toHaveLength(1);
  });

  it("Sidewalk: a drag moves a point of the selected shape, keeping the finger's offset, and ends the drag", () => {
    const tool = annotator();
    keepAll(tool);
    act(() => tool.enterSidewalkStep());
    drawSquare();
    // The second point is at (500, 250): pressed 2 px off it
    fire("pointerdown", 502, 252);
    fire("pointermove", 530, 270);
    expect((tool.state as unknown as { loupe: unknown }).loupe).not.toBeNull();
    fire("pointerup", 530, 270);
    const editor = tool.getSidewalkState();
    expect(editor.mask.polygons[0].points[1]).toEqual({ x: 528, y: 268 });
    expect(editor.drag).toBeNull();
    expect((tool.state as unknown as { loupe: unknown }).loupe).toBeNull();
  });

  it("Sidewalk: a tap on empty photo clears the selection and starts no shape, and a second finger puts a dragged point back", () => {
    const tool = annotator();
    keepAll(tool);
    act(() => tool.enterSidewalkStep());
    drawSquare();
    expect(tool.getSidewalkState().selectedId).toBe("w1");
    tap(100, 300);
    expect(tool.getSidewalkState().selectedId).toBeNull();
    expect(tool.getSidewalkState().draft).toBeNull();
    expect(tool.getSidewalkState().mask.polygons).toHaveLength(1);

    // A tap inside the shape selects it again
    tap(400, 290);
    expect(tool.getSidewalkState().selectedId).toBe("w1");
    fire("pointerdown", 300, 250);
    fire("pointermove", 330, 280);
    expect(tool.getSidewalkState().mask.polygons[0].points[0]).toEqual({ x: 330, y: 280 });
    fire("pointerdown", 600, 100, { id: 2 });
    expect(tool.getSidewalkState().mask.polygons[0].points[0]).toEqual({ x: 300, y: 250 });
    expect(tool.getSidewalkState().drag).toBeNull();
    fire("pointerup", 330, 280);
    fire("pointerup", 600, 100, { id: 2 });
    expect(tool.getSidewalkState().mask.polygons[0].points[0]).toEqual({ x: 300, y: 250 });
  });

  it("Obstructions: a tap marks an object and a second tap unmarks it, with no panel, and an unticked confirmation collapses the sheet", async () => {
    const tool = annotator();
    keepAll(tool);
    act(() => tool.enterSidewalkStep());
    act(() => tool.dispatchSidewalk({ type: "SET_NO_SIDEWALK", value: true }));
    act(() => tool.enterObstructionStep());
    expect(tool.state.annotatorStep).toBe("obstructions");
    tap(450, 150, { pointerType: "mouse" });
    expect(data(tool, "c-tree").obstructs).not.toBe(true);
    tap(450, 150);
    expect(data(tool, "c-tree").obstructs).toBe(true);
    expect(tool.selectedId).toBeNull();
    expect(host.querySelector("#box-review-section-peek")!.textContent).toContain("Marked 1 of 3");
    expect(button(sheet(), "Keep")).toBeUndefined();
    tap(450, 150);
    expect(data(tool, "c-tree").obstructs).not.toBe(true);
    expect(host.querySelector("#obstructions-confirmed")).not.toBeNull();
    expect(button(host, "Back")!.getAttribute("aria-label")).toBe("Back to Sidewalk");

    // iOS Safari follows a tap with a mouse press on the same spot, even
    // though the tap's pointerdown was cancelled. It must not toggle again.
    const compatMouse = (type: string, x: number, y: number) =>
      act(() => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
        Object.defineProperty(event, "offsetX", { value: x });
        Object.defineProperty(event, "offsetY", { value: y });
        canvas().dispatchEvent(event);
      });
    tap(450, 150);
    compatMouse("mousedown", 450, 150);
    compatMouse("mouseup", 450, 150);
    expect(data(tool, "c-tree").obstructs).toBe(true);
    expect(host.querySelector("#box-review-section-peek")!.textContent).toContain("Marked 1 of 3");
    tap(450, 150);
    compatMouse("mousedown", 450, 150);
    expect(data(tool, "c-tree").obstructs).not.toBe(true);

    // Sent with the confirmation unticked: the message shows and the sheet collapses
    act(() => tool.setState({ sheetSnap: "full" }));
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    await act(async () => {
      submit().click();
    });
    expect(tool.state.error).toContain("Please tick the box");
    expect(tool.state.sheetSnap).toBe("collapsed");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("full screen: the sheet is down to its handle, Add box and Exit are on the photo, and a chip says what is left or the selected box's name", () => {
    const onExitFocus = vi.fn();
    const tool = annotator({ focus: true, onExitFocus });
    // The sheet is there to be pulled up, with nothing under its handle at rest
    const handle = sheet()!.querySelector("button[aria-expanded]")!;
    expect(handle.getAttribute("aria-expanded")).toBe("false");
    expect(handle.parentElement!.children).toHaveLength(1);
    // The step's buttons come up with the sheet, and cannot be reached before
    expect(submit().closest("[inert]")).not.toBeNull();
    expect(host.querySelector("#add-box-button")).not.toBeNull();
    expect(host.querySelector("#full-screen-button")).toBeNull();
    const exit = host.querySelector("#exit-full-screen-button") as HTMLButtonElement;
    expect(exit.getAttribute("aria-label")).toBe("Exit full screen");
    // Nothing selected: how many suggestions are left
    expect(host.querySelector("[data-focus-chip] span")!.textContent).toBe("3 to decide");
    // A box selected on the photo leaves the photo clear
    tap(200, 160);
    expect(tool.selectedId).toBe("a-car");
    expect(tool.state.sheetSnap).toBe("collapsed");
    expect(host.querySelector("[data-focus-chip]")!.textContent).toContain("Car #1");
    act(() => exit.click());
    expect(onExitFocus).toHaveBeenCalledTimes(1);
    // Leaving with the box selected opens its panel in the sheet
    act(() => root!.render(element({ isAnnotator: true, layout: "sheet", askSidewalk: true, focus: false, onExitFocus })));
    expect(sheet()!.textContent).toContain("Keep");
    expect(tool.state.sheetSnap).toBe("panel");
    expect(tool.selectedId).toBe("a-car");
    // Next is not there while the box is open (28 Oct 2026)
    expect(Array.from(host.querySelectorAll("button")).some((b) => /^(Next|Finish)/.test(b.textContent?.trim() ?? ""))).toBe(false);
    // And going in with it open puts the sheet down again
    act(() => root!.render(element({ isAnnotator: true, layout: "sheet", askSidewalk: true, focus: true, onExitFocus })));
    expect(tool.state.sheetSnap).toBe("collapsed");
    expect(tool.selectedId).toBe("a-car");
  });

  it("full screen: the chip on the photo counts a box added without a category with the suggestions left (17 Oct 2026)", () => {
    const tool = annotator({ focus: true });
    const chip = () => host.querySelector("[data-focus-chip] span")!.textContent;
    expect(chip()).toBe("3 to decide");
    act(() => (host.querySelector("#add-box-button") as HTMLButtonElement).click());
    act(() => (tool as unknown as { onClose(): void }).onClose());
    expect(chip()).toBe("4 to decide");
  });

  // Later on 12 Oct 2026: before, Details left full screen and nothing could be
  // answered in it. Then a panel beside the photo, too narrow for Step 2. Now
  // the sheet itself, pulled up from the bottom across the whole width.
  it("full screen: Details pulls the sheet up to the box's panel, stays in full screen, and answering puts it down again", () => {
    const onExitFocus = vi.fn();
    const tool = annotator({ focus: true, onExitFocus });
    const canvasBefore = canvas();
    const sheetBefore = sheet();
    tap(200, 160);
    act(() => button(host.querySelector("[data-focus-chip]"), "Details")!.click());
    expect(onExitFocus).not.toHaveBeenCalled();
    expect(tool.state.sheetSnap).toBe("panel");
    // The box's name and panel are in the part that scrolls
    const scroller = sheet()!.querySelector("[data-sheet-scroll]")!;
    expect(scroller.textContent).toContain("Car #1");
    expect(button(scroller, "Keep")).toBeDefined();
    // Nothing is rebuilt, and the button is gone while the sheet is up
    expect(canvas()).toBe(canvasBefore);
    expect(sheet()).toBe(sheetBefore);
    expect(host.querySelector("[data-open-sheet]")).toBeNull();
    // Next is not there while the box is open (28 Oct 2026)
    expect(Array.from(host.querySelectorAll("button")).some((b) => /^(Next|Finish)/.test(b.textContent?.trim() ?? ""))).toBe(false);
    act(() => button(scroller, "Keep")!.click());
    expect(data(tool, "a-car").selected).toBe(true);
    expect(tool.state.sheetSnap).toBe("collapsed");
    expect(host.querySelector("[data-open-sheet]")!.textContent).toBe("Details");
    // With the sheet up on the lists, a box opened from them shows its panel
    act(() => (host.querySelector("[data-open-sheet]") as HTMLButtonElement).click());
    expect(tool.state.sheetSnap).toBe("half");
    expect(scroller.textContent).toContain("To decide 2");
    act(() => tool.selectBoxById("b-pole"));
    expect(tool.state.sheetSnap).toBe("panel");
    // The handle, pressed with a box selected and the sheet down, brings its panel
    act(() => tool.setState({ sheetSnap: "collapsed" }));
    act(() => (sheet()!.querySelector("button[aria-expanded]") as HTMLButtonElement).click());
    expect(tool.state.sheetSnap).toBe("panel");
  });

  it("full screen: an annotator goes through Sidewalk and Obstructions from the sheet, which goes down for each step's photo", () => {
    const tool = annotator({ focus: true });
    keepAll(tool);
    // Not done would be said with the sheet up: the message is in it
    act(() => (host.querySelector("[data-open-sheet]") as HTMLButtonElement).click());
    act(() => submit().click());
    expect(tool.state.annotatorStep).toBe("sidewalk");
    expect(tool.state.sheetSnap).toBe("collapsed");
    // The sheet has the step's own toolbar, and the photo the icons-only one with the way up
    expect(sheet()!.querySelectorAll("#sidewalk-tools")).toHaveLength(1);
    expect(host.querySelectorAll('[role="toolbar"]')).toHaveLength(2);
    expect(host.querySelector("[data-open-sheet]")!.textContent).toBe("Details");
    drawSquare();
    expect(tool.getSidewalkState().mask.polygons).toHaveLength(1);
    act(() => (host.querySelector("[data-open-sheet]") as HTMLButtonElement).click());
    // Up: one toolbar, the sheet's
    expect(host.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
    act(() => submit().click());
    expect(tool.state.annotatorStep).toBe("obstructions");
    expect(sheet()!.querySelector("[data-sheet-scroll] #obstructions-confirmed")).not.toBeNull();
    // Sent with the confirmation unticked: the sheet comes up with the message
    expect(tool.state.sheetSnap).toBe("collapsed");
    act(() => submit().click());
    expect(tool.state.error).toContain("Please tick the box");
    expect(tool.state.sheetSnap).toBe("half");
  });

  it("full screen: a contributor's Answers holds the lists, Step 2 and Next Image, and a missing Step 2 answer pulls the sheet up to it", async () => {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: false } });
    const tool = mount({ layout: "sheet", focus: true }) as AnnotatorTool;
    const open = host.querySelector("[data-open-sheet]") as HTMLButtonElement;
    expect(open.textContent).toBe("Answers");
    expect(host.querySelector("[data-focus-chip] span")!.textContent).toBe("3 still to decide");
    act(() => open.click());
    expect(tool.state.sheetSnap).toBe("half");
    const scroller = sheet()!.querySelector("[data-sheet-scroll]")!;
    expect(scroller.querySelector("#scene-level-section")).not.toBeNull();
    // The lists once: no short summary above them
    expect(host.querySelector("#box-review-section-peek")).toBeNull();
    act(() => (sheet()!.querySelector("button[aria-expanded]") as HTMLButtonElement).click());
    expect(tool.state.sheetSnap).toBe("collapsed");

    // Every box answered and Step 2 empty: the message has to be seen
    act(() => {
      for (const id of ["a-car", "b-pole", "c-tree"]) {
        tool.selectBoxById(id);
        tool.onSetOnSidewalk(true);
        tool.onUnselectObstruction();
      }
    });
    expect(tool.state.sheetSnap).toBe("collapsed");
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    expect(tool.state.error).toContain("sidewalk width");
    expect(tool.state.sheetSnap).toBe("full");
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("sidewalk width");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // 12 Oct 2026: on a 360 px phone the fifth accessibility option stuck out of
  // its card. From S15 (9 Nov 2026) each question is one grid of picture
  // buttons, and Ease of Navigation's five go three and two in the sheet (five
  // "obstructed" labels do not fit at 12 px) and five across on a laptop.
  // jsdom lays nothing out, so this checks the grids' columns.
  it("puts Step 3's answers in rows, Ease of Navigation three and two in the sheet and five across on the desktop layout", () => {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: false } });
    const counts = () =>
      Array.from(host.querySelectorAll<HTMLElement>("#scene-level-section [data-scene-question]")).map((q) => q.querySelectorAll("[data-scene-option]").length);
    const easeGrid = () => host.querySelector<HTMLElement>('[data-scene-question="overallAccessibility"] .grid')!;
    mount({ layout: "sheet" });
    expect(counts()).toEqual([3, 5, 2, 4, 3, 2]);
    expect(easeGrid().className).toContain("grid-cols-3");
    unmount();
    mount({ layout: "desktop" });
    expect(counts()).toEqual([3, 5, 2, 4, 3, 2]);
    expect(easeGrid().className).toContain("grid-cols-5");
  });

  // 12 Oct 2026: bringing Step 2 into view scrolled the phone screen itself
  // (scrollIntoView scrolls every container, also the ones that hide their
  // overflow), which left the photo shifted and a dark gap under it
  it("a missing Step 2 answer pulls the sheet up and scrolls only inside the sheet, for the tour's request too", async () => {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: false } });
    const proto = Element.prototype as unknown as { scrollIntoView?: unknown; scrollTo?: unknown };
    const real = { into: proto.scrollIntoView, to: proto.scrollTo };
    const scrollIntoView = vi.fn();
    const scrolled: Element[] = [];
    proto.scrollIntoView = scrollIntoView;
    proto.scrollTo = function (this: Element) {
      scrolled.push(this);
    };
    try {
      const tool = mount({ layout: "sheet" }) as AnnotatorTool;
      act(() => {
        for (const id of ["a-car", "b-pole", "c-tree"]) {
          tool.selectBoxById(id);
          tool.onSetOnSidewalk(true);
          tool.onUnselectObstruction();
        }
      });
      globalThis.fetch = vi.fn() as unknown as typeof fetch;
      await act(async () => {
        await tool.submit();
      });
      expect(tool.state.error).toContain("sidewalk width");
      expect(tool.state.sheetSnap).toBe("full");
      const scroller = sheet()!.querySelector("[data-sheet-scroll]")!;
      expect(scroller.contains(host.querySelector("#scene-level-section"))).toBe(true);
      expect(scrolled).toEqual([scroller]);

      // The tutorial's request before a tour step in the pulled-up part of the sheet
      scrolled.length = 0;
      act(() => {
        window.dispatchEvent(new CustomEvent("imprint:answer-sheet", { detail: { snap: "full", scrollTo: "#scene-level-section" } }));
      });
      expect(scrolled).toEqual([scroller]);
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      proto.scrollIntoView = real.into;
      proto.scrollTo = real.to;
    }
  });

  it("puts back a part of the phone screen that scrolled anyway, and leaves the sheet's own scrolling alone", () => {
    mount({ layout: "sheet" });
    const fixed = Array.from(host.querySelectorAll<HTMLElement>("[data-no-scroll]"));
    // The screen's root, the photo area and the sheet's container
    expect(fixed.length).toBeGreaterThanOrEqual(3);
    expect(fixed).toContain(canvas().closest("[data-no-scroll]"));
    expect(fixed).toContain(sheet()!.closest("[data-no-scroll]"));
    for (const el of fixed) {
      el.scrollTop = 180;
      el.scrollLeft = 12;
      act(() => {
        el.dispatchEvent(new Event("scroll"));
      });
      expect([el.scrollTop, el.scrollLeft]).toEqual([0, 0]);
    }
    const scroller = sheet()!.querySelector<HTMLElement>("[data-sheet-scroll]")!;
    scroller.scrollTop = 180;
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(scroller.scrollTop).toBe(180);
    // Gone with the tool
    const left = fixed[0];
    unmount();
    document.body.appendChild(left);
    left.scrollTop = 90;
    left.dispatchEvent(new Event("scroll"));
    expect(left.scrollTop).toBe(90);
    left.remove();
  });

  it("offers the full-screen button only when the form passes it (phones), level with Add box", () => {
    annotator();
    expect(host.querySelector("#full-screen-button")).toBeNull();
    unmount();
    const onEnterFocus = vi.fn();
    annotator({ onEnterFocus });
    const enter = host.querySelector("#full-screen-button") as HTMLButtonElement;
    expect(enter.getAttribute("aria-label")).toBe("Full-screen photo");
    expect(enter.style.bottom).toBe((host.querySelector("#add-box-button") as HTMLElement).style.bottom);
    act(() => enter.click());
    expect(onEnterFocus).toHaveBeenCalledTimes(1);
    // Full screen belongs to the sheet layout, which every phone and tablet has
    unmount();
    annotator({ layout: "desktop", onEnterFocus });
    expect(host.querySelector("#full-screen-button")).toBeNull();
  });

  it("counts the times and the time in full screen for telemetry", async () => {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: false } });
    const tool = mount({ layout: "sheet" });
    act(() => root!.render(element({ layout: "sheet", focus: true })));
    act(() => vi.advanceTimersByTime(2000));
    act(() => root!.render(element({ layout: "sheet", focus: false })));
    act(() => root!.render(element({ layout: "sheet", focus: true })));
    act(() => vi.advanceTimersByTime(1000));
    act(() => {
      for (const id of ["a-car", "b-pole", "c-tree"]) {
        tool.selectBoxById(id);
        tool.onSetOnSidewalk(true);
        tool.onUnselectObstruction();
      }
      tool.setState({ sceneLevel: COMPLETE_SCENE });
    });
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    const call = fetchMock.mock.calls.find((c) => (c as unknown as [string])[0] === "/api/annotationSubmit") as unknown as [string, { body: string }];
    const { telemetry } = JSON.parse(call[1].body);
    expect(telemetry.focusModeCount).toBe(2);
    expect(telemetry.focusModeMs).toBe(3000);
    expect(telemetry.layout).toBe("sheet");
  });

  it("on the desktop layout says tap when a finger is the primary pointer, and reads as before with a mouse", () => {
    const TOUCH = {
      objects: "Tap Add box for every object the suggestions missed.",
      sidewalk: "Tap points around the sidewalk, then tap the first point again, or Finish shape, to close the shape.",
      hint: "No shapes yet. Tap points around the sidewalk on the photo to start one.",
      obstructions: "Tap every object that obstructs the sidewalk for you, traveling as you normally do.",
    };
    const MOUSE = {
      objects: "Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not. For each dashed yellow suggestion, check its category, fix the box if it is loose, then click Keep, or click Not an object if it marks nothing real. Draw a box for every object the suggestions missed.",
      sidewalk: "Outline the walking space in this image. Click points around the sidewalk and click the first point again to close the shape. Draw under any object standing on the sidewalk, as if it were not there.",
      hint: "No shapes yet. Click points around the sidewalk on the photo to start one.",
      obstructions: "Click every object that obstructs the sidewalk for you, traveling as you normally do. Click it again to unmark it. Leave the others unmarked, then confirm below that they do not obstruct.",
    };
    for (const [finger, copy, other] of [[true, TOUCH, MOUSE], [false, MOUSE, TOUCH]] as const) {
      coarse = finger;
      window.localStorage.clear();
      writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
      const tool = annotator({ layout: "desktop" });
      expect(host.textContent).toContain(copy.objects);
      expect(host.textContent).not.toContain(other.objects);
      keepAll(tool);
      act(() => tool.enterSidewalkStep());
      expect(host.textContent).toContain(copy.sidewalk);
      expect(host.textContent).toContain(copy.hint);
      expect(host.textContent).not.toContain(other.hint);
      act(() => tool.dispatchSidewalk({ type: "SET_NO_SIDEWALK", value: true }));
      act(() => tool.enterObstructionStep());
      expect(host.textContent).toContain(copy.obstructions);
      expect(host.textContent).not.toContain(other.obstructions);
      unmount();
    }
  });
});

/**
 * The Sidewalk step's drawing tools (13 Oct 2026): a bar that shows only the
 * tools for what the annotator is doing, in place of six buttons above the
 * photo that were mostly greyed out. One rule (sidewalkTools.js) for the
 * desktop bar, the answers sheet and the full-screen photo.
 */
describe("the Sidewalk step's drawing tools (13 Oct 2026)", () => {
  const realMatchMedia = window.matchMedia;
  const realRect = HTMLCanvasElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
    HTMLCanvasElement.prototype.getBoundingClientRect = realRect;
  });

  type Editor = {
    mask: { polygons: Array<{ id: string; points: Array<{ x: number; y: number }> }> };
    draft: { points: unknown[] } | null;
    selectedId: string | null;
    selectedPoint: number | null;
    message: string | null;
  };
  type SidewalkTool = Tool & {
    enterSidewalkStep(): void;
    getSidewalkState(): Editor;
    state: Tool["state"] & { hideSidewalkFill: boolean; sheetSnap: string };
  };

  /** An annotator in the Sidewalk step, every suggestion kept */
  function inSidewalk(options: MountOptions = {}) {
    const tool = mount({ isAnnotator: true, askSidewalk: true, ...options }) as SidewalkTool;
    tool.currentImageElement = { width: 640, height: 360 };
    for (const shape of tool.shapes) (shape.getAnnotationData() as unknown as { selected: boolean }).selected = true;
    act(() => tool.enterSidewalkStep());
    expect(tool.state.annotatorStep).toBe("sidewalk");
    return tool;
  }
  /** Phones and tablets: a finger as the pointer, and a canvas with a size */
  function onTouch() {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("coarse"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 960, height: 600, right: 960, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  }
  const click = (tool: Tool, x: number, y: number) =>
    act(() => {
      tool.onMouseDown({ nativeEvent: { offsetX: x, offsetY: y } });
      tool.onMouseUp();
    });
  const tap = (x: number, y: number) => {
    const canvas = host.querySelector("canvas.rp-shapes") as HTMLCanvasElement;
    for (const type of ["pointerdown", "pointerup"]) {
      act(() => {
        canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", clientX: x, clientY: y }));
      });
    }
  };
  const key = (name: string) => act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })));
  const SQUARE: Array<[number, number]> = [[300, 250], [500, 250], [500, 330], [300, 330]];

  const bar = (scope: ParentNode = host) => scope.querySelector<HTMLElement>("#sidewalk-tools")!;
  const toolButtons = (scope: Element) => Array.from(scope.querySelectorAll<HTMLButtonElement>("button[data-tool]"));
  const names = (scope: Element) => toolButtons(scope).map((b) => b.dataset.tool);
  const toolButton = (scope: Element, name: string) => scope.querySelector<HTMLButtonElement>(`button[data-tool="${name}"]`)!;
  const status = () => bar().querySelector('[role="status"]')!.textContent;

  it("desktop: the bar is part of the photo's card, and before a shape is started it has only Photo only and what to do next", () => {
    inSidewalk();
    expect(bar().getAttribute("role")).toBe("toolbar");
    expect(bar().getAttribute("aria-label")).toBe("Drawing tools");
    expect(bar().dataset.context).toBe("idle");
    // In the card with the photo, above it: nothing floats between the step's words and the card
    expect(bar().parentElement!.querySelector("canvas.rp-shapes")).not.toBeNull();
    expect(bar().compareDocumentPosition(host.querySelector("canvas.rp-shapes")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(names(bar())).toEqual(["photoOnly"]);
    expect(status()).toBe("Click the photo to start a shape.");
    // One line at a fixed height, so the photo does not move as the tools change
    expect(bar().className).toContain("min-h-[44px]");
    expect(bar().className).not.toContain("flex-wrap");
    for (const gone of ["Finish", "Undo", "Cancel", "Delete point", "Delete shape"]) expect(bar().textContent).not.toContain(gone);
  });

  it("desktop: drawing shows Finish, Undo and Cancel, and a selected shape shows Delete point, Delete shape and Done", () => {
    const tool = inSidewalk();
    click(tool, ...SQUARE[0]);
    expect(bar().dataset.context).toBe("drawing");
    expect(names(bar())).toEqual(["finish", "undo", "cancel", "photoOnly"]);
    expect(toolButtons(bar()).map((b) => b.textContent)).toEqual(["Finish", "Undo", "Cancel", "Photo only"]);
    expect(toolButtons(bar()).map((b) => b.getAttribute("aria-label"))).toEqual(["Finish shape", "Undo point", "Cancel shape", "Show photo only"]);
    expect(toolButtons(bar()).every((b) => !b.disabled && b.getAttribute("type") === "button")).toBe(true);
    expect(status()).toBe("Drawing a shape: 1 point");
    // Finish on one point: the editor says why not, under the photo as before
    act(() => toolButton(bar(), "finish").click());
    expect(tool.getSidewalkState().message).toBe("A shape needs at least three points.");
    expect(host.textContent).toContain("A shape needs at least three points.");
    expect(tool.getSidewalkState().draft).not.toBeNull();

    for (const [x, y] of SQUARE.slice(1)) click(tool, x, y);
    expect(status()).toBe("Drawing a shape: 4 points");
    act(() => toolButton(bar(), "undo").click());
    expect(tool.getSidewalkState().draft!.points).toHaveLength(3);
    click(tool, ...SQUARE[3]);
    act(() => toolButton(bar(), "finish").click());
    expect(tool.getSidewalkState().draft).toBeNull();
    expect(tool.getSidewalkState().mask.polygons).toHaveLength(1);

    // Closed, the shape is selected: its tools replace the drawing ones
    expect(bar().dataset.context).toBe("shape");
    expect(names(bar())).toEqual(["deletePoint", "deleteShape", "done", "photoOnly"]);
    expect(status()).toBe("Shape 1: 4 points");
    expect(toolButton(bar(), "deletePoint").disabled).toBe(true);
    expect(toolButton(bar(), "deletePoint").title).toBe("Delete point. Click a point of the shape first.");
    expect(toolButton(bar(), "done").getAttribute("aria-label")).toBe("Done");
    // A press on a point selects it, and Delete point can remove it
    click(tool, ...SQUARE[1]);
    expect(tool.getSidewalkState().selectedPoint).toBe(1);
    expect(status()).toBe("Shape 1: point 2 of 4");
    expect(toolButton(bar(), "deletePoint").disabled).toBe(false);
    act(() => toolButton(bar(), "deletePoint").click());
    expect(tool.getSidewalkState().mask.polygons[0].points).toEqual([{ x: 300, y: 250 }, { x: 500, y: 330 }, { x: 300, y: 330 }]);
    expect(status()).toBe("Shape 1: 3 points");

    // Done puts the shape down: no tools, and what to do next
    act(() => toolButton(bar(), "done").click());
    expect(tool.getSidewalkState().selectedId).toBeNull();
    expect(names(bar())).toEqual(["photoOnly"]);
    expect(status()).toBe("Click a shape to select it, or click the photo to start another.");
    // A click inside the shape selects it again, and Delete shape removes it
    click(tool, 340, 310);
    expect(tool.getSidewalkState().selectedId).toBe("w1");
    act(() => toolButton(bar(), "deleteShape").click());
    expect(tool.getSidewalkState().mask.polygons).toHaveLength(0);
    expect(bar().dataset.context).toBe("idle");
    expect(status()).toBe("Click the photo to start a shape.");
    // Cancel drops a shape being drawn
    click(tool, ...SQUARE[0]);
    click(tool, ...SQUARE[1]);
    act(() => toolButton(bar(), "cancel").click());
    expect(tool.getSidewalkState().draft).toBeNull();
    expect(names(bar())).toEqual(["photoOnly"]);
  });

  it("desktop: each tool's tooltip names a key, and the key does what the button does", () => {
    const tool = inSidewalk();
    for (const [x, y] of SQUARE) click(tool, x, y);
    expect(toolButtons(bar()).map((b) => b.title)).toEqual(["Finish shape (Enter)", "Undo point (Backspace)", "Cancel shape (Esc)", "Show photo only"]);
    key("Backspace");
    expect(tool.getSidewalkState().draft!.points).toHaveLength(3);
    key("Escape");
    expect(tool.getSidewalkState().draft).toBeNull();
    for (const [x, y] of SQUARE) click(tool, x, y);
    key("Enter");
    expect(tool.getSidewalkState().mask.polygons).toHaveLength(1);
    expect(toolButton(bar(), "deleteShape").title).toBe("Delete shape (Delete)");
    expect(toolButton(bar(), "done").title).toBe("Done (Esc)");

    // With a point selected the Delete key removes the point, so Delete shape's tooltip drops it
    click(tool, ...SQUARE[2]);
    expect(toolButton(bar(), "deletePoint").title).toBe("Delete point (Backspace)");
    expect(toolButton(bar(), "deleteShape").title).toBe("Delete shape");
    key("Delete");
    expect(tool.getSidewalkState().mask.polygons[0].points).toHaveLength(3);
    key("Escape");
    expect(tool.getSidewalkState().selectedId).toBeNull();
    click(tool, 340, 310);
    key("Delete");
    expect(tool.getSidewalkState().mask.polygons).toHaveLength(0);
  });

  it("desktop: Photo only is always there and says whether it is on", () => {
    const tool = inSidewalk();
    const photoOnly = () => toolButton(bar(), "photoOnly");
    expect(photoOnly().getAttribute("aria-pressed")).toBe("false");
    act(() => photoOnly().click());
    expect(tool.state.hideSidewalkFill).toBe(true);
    expect(photoOnly().getAttribute("aria-pressed")).toBe("true");
    // Still there, and still on, while drawing and with a shape selected
    for (const [x, y] of SQUARE) click(tool, x, y);
    expect(photoOnly().getAttribute("aria-pressed")).toBe("true");
    key("Enter");
    expect(names(bar())).toEqual(["deletePoint", "deleteShape", "done", "photoOnly"]);
    act(() => photoOnly().click());
    expect(tool.state.hideSidewalkFill).toBe(false);
  });

  it("phones and tablets: the sheet's row follows the same rule, without Done, and stays one height", () => {
    onTouch();
    const tool = inSidewalk({ layout: "sheet" });
    const row = () => bar(host.querySelector("#answer-sheet")!);
    expect(row().dataset.context).toBe("idle");
    expect(names(row())).toEqual(["photoOnly"]);
    expect(toolButton(row(), "photoOnly").textContent).toBe("Photo only");
    expect(row().className).toContain("h-11");

    tap(...SQUARE[0]);
    expect(names(row())).toEqual(["finish", "undo", "cancel", "photoOnly"]);
    expect(toolButtons(row()).map((b) => b.textContent)).toEqual(["Finish", "Undo", "Cancel", ""]);
    // Beside other tools Photo only is its icon, named for a screen reader
    expect(toolButton(row(), "photoOnly").getAttribute("aria-label")).toBe("Show photo only");
    expect(toolButtons(row()).every((b) => b.className.includes("h-11"))).toBe(true);
    expect(row().className).toContain("h-11");
    tap(...SQUARE[1]);
    act(() => toolButton(row(), "undo").click());
    expect(tool.getSidewalkState().draft!.points).toHaveLength(1);
    for (const [x, y] of SQUARE.slice(1)) tap(x, y);
    act(() => toolButton(row(), "finish").click());
    expect(tool.getSidewalkState().mask.polygons).toHaveLength(1);

    // A tap on empty photo clears the selection there, so no Done
    expect(names(row())).toEqual(["deletePoint", "deleteShape", "photoOnly"]);
    expect(toolButton(row(), "deletePoint").disabled).toBe(true);
    tap(...SQUARE[1]);
    expect(tool.getSidewalkState().selectedPoint).toBe(1);
    act(() => toolButton(row(), "deletePoint").click());
    expect(tool.getSidewalkState().mask.polygons[0].points).toHaveLength(3);
    act(() => toolButton(row(), "deleteShape").click());
    expect(tool.getSidewalkState().mask.polygons).toHaveLength(0);
    expect(names(row())).toEqual(["photoOnly"]);
  });

  it("the full-screen photo: the same tools as icons, each with its name", () => {
    onTouch();
    const tool = inSidewalk({ layout: "sheet", focus: true });
    const chip = () => host.querySelector<HTMLElement>('[data-open-sheet]')!.parentElement!.querySelector<HTMLElement>('[role="toolbar"]')!;
    expect(tool.state.sheetSnap).toBe("collapsed");
    expect(chip().id).toBe("");
    expect(names(chip())).toEqual(["photoOnly"]);
    tap(...SQUARE[0]);
    expect(names(chip())).toEqual(["finish", "undo", "cancel", "photoOnly"]);
    expect(toolButtons(chip()).map((b) => b.textContent)).toEqual(["", "", "", ""]);
    expect(toolButtons(chip()).map((b) => b.getAttribute("aria-label"))).toEqual(["Finish shape", "Undo point", "Cancel shape", "Show photo only"]);
    // No keyboard on a phone: the tooltips name no keys
    expect(toolButtons(chip()).map((b) => b.title)).toEqual(["Finish shape", "Undo point", "Cancel shape", "Show photo only"]);
    for (const [x, y] of SQUARE.slice(1)) tap(x, y);
    act(() => toolButton(chip(), "finish").click());
    expect(names(chip())).toEqual(["deletePoint", "deleteShape", "photoOnly"]);
    expect(toolButton(chip(), "deletePoint").title).toBe("Delete point. Tap a point of the shape first.");
  });
});


// 17 Oct 2026: annotators' chips mark a drawn box with the contributors' pencil, and say No category until it has one
describe("annotators' object chips on the desktop (17 Oct 2026)", () => {
  it("puts the pencil before a drawn box's name, No category on a box without one, and no tag on a drawn box with one", () => {
    window.localStorage.clear();
    const rec = record();
    rec.annotationList.push(
      { id: "zz-new", mark: mark(500, 40, 60, 60), editable: true, selected: false, isRejected: false } as never,
      { id: "zz-bench", comment: "bench", mark: mark(500, 200, 60, 40), editable: true, selected: false, isRejected: false } as never,
    );
    writeSession({ total: 1, current: 1, data: { imgRecords: [rec], isAnnotator: true } });
    const tool = mount({ isAnnotator: true });
    tool.currentImageElement = { width: 640, height: 360 };
    // A kept suggestion whose category is not on the list needs one too
    act(() => {
      const car = tool.shapes.find((sh) => sh.getAnnotationData().id === "a-car")!.getAnnotationData() as unknown as { selected: boolean; comment: string };
      car.selected = true;
      car.comment = "truck";
      tool.setState({});
    });
    const items = () => Array.from(host.querySelectorAll("#box-review-section li"));
    const itemFor = (text: string) => items().find((li) => li.textContent!.startsWith(text))!;
    const newBox = itemFor("Select a category");
    expect(newBox.querySelector("svg[data-drawn]")).not.toBeNull();
    expect(newBox.textContent).toContain("Select a category, drawn by youNo category");
    const bench = itemFor("Bench #1");
    expect(bench.querySelector("svg[data-drawn]")).not.toBeNull();
    expect(bench.querySelector("button")!.textContent).toBe("Bench #1, drawn by you");
    expect(bench.textContent).not.toContain("Drawn");
    // Suggestions have no pencil
    const truck = itemFor("Truck #1");
    expect(truck.querySelector("svg[data-drawn]")).toBeNull();
    expect(truck.textContent).toContain("No category");
    expect(itemFor("Utility Post #1").textContent).toContain("To decide");
    expect(host.textContent).not.toMatch(/Drawn(?! by)/);
  });
});

// 21 Oct 2026: a failed Next or Next Image opens the box left to finish; on a
// phone the eye sits on the line with the open box's name; contributors see
// every object in one row at the top of the sheet
describe("what a failed Next opens, the sheet's eye, and the contributors' chip row (21 Oct 2026)", () => {
  const realMatchMedia = window.matchMedia;
  const realRect = HTMLCanvasElement.prototype.getBoundingClientRect;
  let coarse = false;
  beforeEach(() => {
    coarse = false;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("coarse") ? coarse : query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 960, height: 600, right: 960, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    HTMLCanvasElement.prototype.getBoundingClientRect = realRect;
  });

  type Box = { onSidewalk?: boolean; selected?: boolean; isRejected?: boolean; obstructs?: boolean | null; severity?: number | null; comment?: string };
  type SheetTool = Tool & { state: Tool["state"] & { sheetSnap: string; showInput: boolean } };
  const data = (tool: Tool, id: string) => tool.shapes.find((sh) => sh.getAnnotationData().id === id)!.getAnnotationData() as unknown as Box;
  const set = (tool: Tool, changes: Record<string, Box>) =>
    act(() => {
      for (const [id, patch] of Object.entries(changes)) Object.assign(data(tool, id), patch);
      tool.setState({});
    });
  const open = (role: "annotator" | "contributor", options: MountOptions = {}) => {
    const isAnnotator = role === "annotator";
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator } });
    const tool = mount({ isAnnotator, ...options }) as SheetTool;
    tool.currentImageElement = { width: 640, height: 360 };
    return tool;
  };
  const submitButton = () => host.querySelector("button[type='submit']") as HTMLButtonElement;
  const press = () => act(() => submitButton().click());
  const submitNow = async (tool: Tool) => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
  };
  const SCENE = COMPLETE_SCENE;

  it("annotators, desktop: Next opens the first suggestion still to decide, then the first box with no category", () => {
    const tool = open("annotator");
    set(tool, { "a-car": { selected: true } });
    press();
    expect(tool.state.error).toContain("Keep or Not an object");
    expect(tool.selectedId).toBe("b-pole");
    expect(tool.state.showInput).toBe(true);
    // Every suggestion decided, one kept with a category not on the list
    set(tool, { "b-pole": { selected: true }, "c-tree": { selected: true, comment: "truck" } });
    act(() => (tool as unknown as { onClose(): void }).onClose());
    press();
    expect(tool.state.error).toContain("choose a category");
    expect(tool.selectedId).toBe("c-tree");
  });

  it("annotators, phone: the sheet comes up to the box's panel with the message, in full screen too", () => {
    coarse = true;
    const tool = open("annotator", { layout: "sheet" });
    set(tool, { "a-car": { selected: true } });
    press();
    expect(tool.selectedId).toBe("b-pole");
    expect(tool.state.sheetSnap).toBe("panel");
    // The message floats over the photo, in view with the panel
    expect(host.querySelector("[role='alert']")!.textContent).toContain("Keep or Not an object");
    unmount();
    const full = open("annotator", { layout: "sheet", focus: true });
    act(() => full.setState({}));
    expect(full.state.sheetSnap).toBe("collapsed");
    press();
    expect(full.selectedId).toBe("a-car");
    expect(full.state.sheetSnap).toBe("panel");
  });

  it("contributors, desktop: Next Image opens the first unanswered object, then a Yes with no severity, and nothing for Step 2", async () => {
    const tool = open("contributor");
    set(tool, { "a-car": { onSidewalk: true, selected: true, obstructs: true, severity: 3 } });
    act(() => tool.setState({ sceneLevel: SCENE }));
    await submitNow(tool);
    // The sidewalk question comes first (S12)
    expect(tool.state.error).toBe("Please say whether each object is on the sidewalk.");
    expect(tool.selectedId).toBe("b-pole");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    act(() => (tool as unknown as { onClose(): void }).onClose());
    set(tool, { "b-pole": { onSidewalk: true }, "c-tree": { onSidewalk: true } });
    await submitNow(tool);
    expect(tool.state.error).toContain("Yes or No");
    expect(tool.selectedId).toBe("b-pole");
    act(() => (tool as unknown as { onClose(): void }).onClose());
    set(tool, { "b-pole": { isRejected: true, obstructs: false }, "c-tree": { selected: true, obstructs: true, severity: null } });
    await submitNow(tool);
    expect(tool.state.error).toContain("severity");
    expect(tool.selectedId).toBe("c-tree");
    // Step 3 left: no box opens
    act(() => (tool as unknown as { onClose(): void }).onClose());
    set(tool, { "c-tree": { severity: 2 } });
    act(() => tool.setState({ sceneLevel: emptySceneLevel() }));
    await submitNow(tool);
    expect(tool.state.error).toContain("sidewalk width");
    expect(tool.selectedId).toBeNull();
  });

  it("contributors, phone: the sheet comes up to the first unanswered object's panel", async () => {
    coarse = true;
    const tool = open("contributor", { layout: "sheet" });
    await submitNow(tool);
    expect(tool.selectedId).toBe("a-car");
    expect(tool.state.sheetSnap).toBe("panel");
  });

  it("phone, both roles: Hide on photo is on the line with the open box's name, not beside the panel's buttons", () => {
    for (const role of ["annotator", "contributor"] as const) {
      coarse = true;
      const tool = open(role, { layout: "sheet" });
      act(() => tool.selectBoxById("a-car"));
      const sheet = host.querySelector("#answer-sheet")!;
      const hide = Array.from(sheet.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Hide on photo")!;
      expect(hide).toBeDefined();
      expect(hide.closest("[data-sheet-scroll]")).toBeNull();
      expect(hide.parentElement!.textContent).toContain("Car #1");
      // The panel itself has no eye
      expect(sheet.querySelector('[data-sheet-scroll] button[aria-label="Hide this box on the photo"]')).toBeNull();
      act(() => hide.click());
      expect(tool.isBoxHidden("a-car")).toBe(true);
      expect(tool.selectedId).toBeNull();
      unmount();
    }
  });

  it("desktop: the floating panel keeps its eye", () => {
    const tool = open("annotator");
    act(() => tool.selectBoxById("a-car"));
    expect(host.querySelector('.rp-selected-input button[aria-label="Hide this box on the photo"]')).not.toBeNull();
    expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent?.trim() === "Hide on photo")).toBe(false);
  });

  it("contributors, phone: one row of every object at the top of the sheet, what is left first, with the lists still pulled up", () => {
    coarse = true;
    const tool = open("contributor", { layout: "sheet" });
    set(tool, { "a-car": { onSidewalk: true, selected: true, obstructs: true, severity: 3 }, "c-tree": { onSidewalk: true, selected: true, obstructs: true, severity: null } });
    const peek = host.querySelector("#box-review-section-peek")!;
    const chips = Array.from(peek.querySelectorAll("#box-review-chips-peek li")).map((li) => li.textContent);
    expect(chips).toEqual(["Utility Post #1To decide", "Tree #1No severity", "Car #1Obstruction"]);
    expect(peek.textContent).toContain("Still to decide 2");
    expect(peek.textContent).not.toContain("Not obstructions");
    // Pulled up, the answers are still in their lists
    const body = host.querySelector("#answer-sheet [data-sheet-scroll]")!;
    expect(body.textContent).toContain("Not obstructions");
    expect(body.textContent).toContain("Obstructions");
    // Next opens the first chip left
    const next = Array.from(peek.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Next")!;
    act(() => next.click());
    expect(tool.selectedId).toBe("b-pole");
  });

  it("a message goes by itself after it has been read, and trying again shows it its full time again", () => {
    const tool = open("annotator");
    set(tool, { "a-car": { selected: true } });
    press();
    const message = "Please click Keep or Not an object on every suggested box.";
    expect(tool.state.error).toBe(message);
    act(() => (tool as unknown as { onClose(): void }).onClose());
    // Nearly its time, then Next again: it stays its full time from now
    act(() => vi.advanceTimersByTime(messageVisibleMs(message) - 100));
    expect(tool.state.error).toBe(message);
    press();
    act(() => vi.advanceTimersByTime(messageVisibleMs(message) - 100));
    expect(tool.state.error).toBe(message);
    // Its time up, it goes
    act(() => vi.advanceTimersByTime(200));
    expect(tool.state.error).toBeNull();
    // Hidden as it leaves (its words stay for the way out)
    expect(host.querySelector("[role='alert']")!.closest("[aria-hidden]")!.getAttribute("aria-hidden")).toBe("true");
  });

  // 6 Nov 2026 (Rans): a pill at the top of the screen, as the tutorial's "Click Tour at the top of the page", with the red warning sign
  it("desktop: the message is a dark pill fixed under the top bar with the red warning sign, moving nothing, its words kept while it leaves", () => {
    const tool = open("annotator");
    const pill = () => host.querySelector("[data-desktop-message]") as HTMLElement;
    const card = () => pill().firstElementChild as HTMLElement;
    // In the page before any message, hidden
    expect(pill().getAttribute("aria-hidden")).toBe("true");
    expect(card().className).toContain("opacity-0");
    press();
    const message = tool.state.error!;
    expect(pill().getAttribute("aria-hidden")).toBe("false");
    expect(card().className).toContain("opacity-100");
    expect(pill().querySelector("[role='alert']")!.textContent).toBe(message);
    // Where and how the tutorial's tour hint is: fixed under the top bar, a dark pill, never taking a click
    expect(pill().className.split(" ")).toEqual(expect.arrayContaining(["fixed", "pointer-events-none", "z-[60]"]));
    expect(pill().style.top).toBe("calc(var(--nav-h, 64px) + 12px)");
    expect(card().className.split(" ")).toEqual(expect.arrayContaining(["rounded-full", "bg-ink/85", "text-white", "text-xs", "font-semibold"]));
    // A red warning sign, red-400 on the dark pill so it reads against it (S20)
    expect(card().querySelector("svg")!.getAttribute("class")).toContain("text-red-400");
    expect(card().querySelector("svg")!.getAttribute("class")).not.toContain("text-danger");
    // Not in the page's flow above the buttons any more
    expect(pill().closest(".grid")).toBeNull();
    act(() => vi.advanceTimersByTime(messageVisibleMs(message)));
    expect(tool.state.error).toBeNull();
    // Leaving, with the same words, not cut off
    expect(pill().getAttribute("aria-hidden")).toBe("true");
    expect(card().className).toContain("opacity-0");
    expect(pill().textContent).toContain(message);
  });

  // S20 (7 Nov 2026)
  it("phone: the card keeps text-danger for its warning sign", () => {
    coarse = true;
    open("contributor", { layout: "sheet" });
    press();
    const alert = host.querySelector("[role='alert']")!;
    expect(alert.parentElement!.querySelector("svg")!.parentElement!.className).toContain("text-danger");
    expect(host.querySelector(".text-red-400")).toBeNull();
  });

  it("desktop: tells the page when the pill shows and goes, and the phone never", () => {
    const told: boolean[] = [];
    const tool = open("contributor", { onDesktopMessage: (shown) => told.push(shown) });
    press();
    expect(told).toEqual([true]);
    // The same message again, still showing: nothing new to tell
    press();
    expect(told).toEqual([true]);
    act(() => vi.advanceTimersByTime(messageVisibleMs(tool.state.error!)));
    expect(told).toEqual([true, false]);
    unmount();

    coarse = true;
    const phone: boolean[] = [];
    open("contributor", { layout: "sheet", onDesktopMessage: (shown) => phone.push(shown) });
    press();
    expect(phone).toEqual([]);
  });

  it("desktop: a message about Step 2 brings its heading below the pill when it is out of view, and leaves it when in view", () => {
    const tool = open("contributor");
    act(() => {
      for (const id of ["a-car", "b-pole", "c-tree"]) {
        tool.selectBoxById(id);
        tool.onSetOnSidewalk(true);
        tool.onUnselectObstruction();
      }
      tool.onClose();
    });
    const section = host.querySelector("#scene-level-section") as HTMLElement;
    expect(section.className).toContain("scroll-mt-[calc(var(--nav-h,64px)+60px)]");
    const scroll = vi.fn();
    section.scrollIntoView = scroll;
    // Above the screen: brought in
    section.getBoundingClientRect = () => ({ top: -300 }) as DOMRect;
    press();
    expect(tool.state.error).toBe("Please choose the sidewalk width.");
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    // In view below the pill (jsdom reads no scroll margin, so 0): left alone
    scroll.mockClear();
    section.getBoundingClientRect = () => ({ top: 200 }) as DOMRect;
    press();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("phone: the message floats over the photo, not in the sheet's footer, so the sheet keeps its height", () => {
    coarse = true;
    const tool = open("contributor", { layout: "sheet" });
    press();
    const alert = host.querySelector("[role='alert']")!;
    expect(alert.textContent).toBe(tool.state.error);
    expect(alert.closest("#answer-sheet")).toBeNull();
    expect(alert.closest(".pointer-events-none")).not.toBeNull();
    // The footer is the step's buttons alone (here none: the failed Next
    // opened the box left, and Next is not there while it is open)
    const footer = Array.from(host.querySelectorAll("div")).find((d) => d.className.includes("bottom-0 z-20"))!;
    expect(footer.querySelector("[role='alert']")).toBeNull();
    act(() => vi.advanceTimersByTime(messageVisibleMs(tool.state.error!)));
    expect(alert.closest("[aria-hidden]")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("phone, both roles: Next beside the count is plain tinted text with a full-size target", () => {
    for (const role of ["annotator", "contributor"] as const) {
      coarse = true;
      open(role, { layout: "sheet" });
      const next = Array.from(host.querySelectorAll("#box-review-section-peek button")).find((b) => b.textContent?.trim() === "Next")!;
      expect(next.className).toContain("h-11");
      expect(next.className).toContain("text-primary");
      expect(next.className).toContain("active:opacity-40");
      // No fill: Next Image stays the one filled button
      expect(next.className).not.toMatch(/\bbg-/);
      expect(next.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("contributors, full screen: the chip on the photo counts a Yes with no severity as left", () => {
    coarse = true;
    const tool = open("contributor", { layout: "sheet", focus: true });
    set(tool, { "a-car": { onSidewalk: true, selected: true, obstructs: true, severity: null }, "b-pole": { onSidewalk: true, isRejected: true, obstructs: false } });
    expect(host.querySelector("[data-focus-chip] span")!.textContent).toBe("2 still to decide");
  });
});

// 27 Oct 2026: fewer buttons while a box is open on a phone; 28 Oct 2026: both roles, and its space goes too
describe("an open box on a phone or tablet", () => {
  const nextButton = () => Array.from(host!.querySelectorAll("button")).find((b) => /^(Next Image|Finish Session|Next: .+)$/.test(b.textContent?.trim() ?? ""));

  it("takes Next Image away while a contributor's box is open, and brings it back when the box closes", () => {
    const tool = mount({ layout: "sheet" });
    expect(nextButton()).toBeDefined();
    act(() => tool.selectBoxById("a-car"));
    expect(tool.selectedId).toBe("a-car");
    expect(nextButton()).toBeUndefined();
    act(() => tool.setState({ showInput: false }));
    expect(nextButton()).toBeDefined();
  });

  it("does the same for an annotator", () => {
    const tool = mount({ isAnnotator: true, layout: "sheet" });
    expect(nextButton()).toBeDefined();
    act(() => tool.selectBoxById("a-car"));
    expect(nextButton()).toBeUndefined();
  });

  it("takes Previous away too, and drops the empty footer from the sheet", () => {
    window.localStorage.clear();
    writeSession({ total: 3, current: 2, data: { imgRecords: [record(), record(), record()], isAnnotator: false } });
    const tool = mount({ layout: "sheet", current: 2 });
    act(() => tool.selectBoxById("a-car"));
    const buttons = Array.from(host!.querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(buttons).not.toContain("Previous");
    expect(nextButton()).toBeUndefined();
    act(() => tool.setState({ showInput: false }));
    expect(Array.from(host!.querySelectorAll("button")).map((b) => b.textContent?.trim())).toContain("Previous");
    unmount();

    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: false } });
    const first = mount({ layout: "sheet" });
    act(() => first.selectBoxById("a-car"));
    const footer = Array.from(host!.querySelectorAll("div")).find((d) => d.className.includes("bottom-0 z-20"));
    expect(footer?.className).toContain(" hidden");
  });

  it("keeps Next Image on the laptop layout", () => {
    const tool = mount();
    act(() => tool.selectBoxById("a-car"));
    expect(nextButton()).toBeDefined();
  });

  it("fades the Add box hint after a few seconds, without a drag", () => {
    const tool = mount({ layout: "sheet" }) as unknown as Tool & { addBoxFromButton(): void; currentImageElement: unknown };
    tool.currentImageElement = { width: 640, height: 360 };
    act(() => tool.addBoxFromButton());
    const hint = () => Array.from(host!.querySelectorAll("p")).find((p) => p.textContent === ADD_BOX_COPY.hint);
    expect(hint()?.className).toContain("opacity-100");
    act(() => vi.advanceTimersByTime(ADD_BOX_HINT_MS));
    expect(hint()?.className).toContain("opacity-0");
    act(() => vi.advanceTimersByTime(400));
    expect(hint()).toBeUndefined();
  });
});

// S17 (4 Nov 2026), from pilot participant 3, in the real tool on the
// desktop layout: a confirmed obstruction opens on its severity scale, Back
// to Question 2 and Back to Question 1 change nothing until a new answer, the
// open box is the only one on the photo, and a Not an object box leaves it.
describe("changing an answer, one box at a time, and Not an object off the photo (S17)", () => {
  type Data = Record<string, unknown>;
  const data = (tool: Tool, id: string) => tool.shapes.find((sh) => sh.getAnnotationData().id === id)!.getAnnotationData() as unknown as Data;
  const panel = () => host.querySelector(".rp-selected-input");
  const control = (name: string) => panel()?.querySelector(`[data-control="${name}"]`) as HTMLButtonElement | null;
  const press = (el: HTMLElement | null) => act(() => el!.click());
  const slider = () => panel()!.querySelector('input[aria-label="Severity"]') as HTMLInputElement;
  const moveSliderTo = (v: number) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider(), String(v));
    slider().dispatchEvent(new Event("input", { bubbles: true }));
    slider().dispatchEvent(new Event("pointerup", { bubbles: true }));
    slider().dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  const clickAt = (tool: Tool, x: number, y: number) => act(() => {
    tool.currentAnnotationState.onMouseDown(x, y);
    tool.currentAnnotationState.onMouseUp();
  });
  /** The tree as a confirmed obstruction at severity 2, closed */
  const confirmTree = (tool: Tool) => act(() => {
    tool.selectBoxById("c-tree");
    tool.onSetOnSidewalk(true);
    tool.onSelectObstruction();
    tool.onSetSeverity(2);
  });

  it("onChangeSeverity sets the severity and leaves the panel open, where onSetSeverity closes it", () => {
    const tool = mount();
    confirmTree(tool);
    expect(tool.selectedId).toBeNull();
    act(() => tool.selectBoxById("c-tree"));
    act(() => tool.onChangeSeverity(4));
    expect(tool.selectedId).toBe("c-tree");
    expect(data(tool, "c-tree")).toMatchObject({ obstructs: true, severity: 4, selected: true, onSidewalk: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(box("c-tree")).toMatchObject({ obstructs: true, severity: 4 });
  });

  it("is refused for annotators, who give no severity", () => {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
    const tool = mount({ isAnnotator: true });
    act(() => tool.selectBoxById("c-tree"));
    act(() => tool.onChangeSeverity(4));
    expect(data(tool, "c-tree").severity ?? null).toBeNull();
    // Their panel has no way back and no scale
    expect(panel()?.querySelector('[data-control^="back"]')).toBeNull();
    expect(panel()?.querySelector("[data-severity-panel]")).toBeNull();
  });

  it("reopens a confirmed obstruction on its scale, saves a new value when the slider is let go, and keeps it after closing", () => {
    const tool = mount();
    confirmTree(tool);
    act(() => tool.selectBoxById("c-tree"));
    expect(panel()!.querySelector("[data-severity-panel]")).not.toBeNull();
    expect(slider().value).toBe("2");
    moveSliderTo(4);
    expect(tool.selectedId).toBe("c-tree");
    expect(data(tool, "c-tree").severity).toBe(4);
    expect(panel()!.textContent).toContain("4 · Difficult to pass");
    act(() => tool.onClose());
    act(() => tool.selectBoxById("c-tree"));
    expect(slider().value).toBe("4");
  });

  it("Back to Question 2 then closing changes nothing, and the box reopens on its severity", () => {
    const tool = mount();
    confirmTree(tool);
    act(() => tool.selectBoxById("c-tree"));
    moveSliderTo(4);
    const before = JSON.stringify(data(tool, "c-tree"));
    press(control("back-to-question-2"));
    expect(panel()!.textContent).toContain("Question 2 of 2");
    expect(control("yes")!.getAttribute("aria-pressed")).toBe("true");
    act(() => tool.onClose());
    expect(JSON.stringify(data(tool, "c-tree"))).toBe(before);
    act(() => tool.selectBoxById("c-tree"));
    expect(panel()!.querySelector("[data-severity-panel]")).not.toBeNull();
    expect(slider().value).toBe("4");
  });

  it("Back to Question 2 and No records today's No, and the box reopens on Question 2 with No", () => {
    const tool = mount();
    confirmTree(tool);
    act(() => tool.selectBoxById("c-tree"));
    press(control("back-to-question-2"));
    press(control("no"));
    expect(tool.selectedId).toBeNull();
    expect(data(tool, "c-tree")).toMatchObject({ onSidewalk: true, obstructs: false, severity: null, selected: false, isRejected: true });
    act(() => tool.selectBoxById("c-tree"));
    expect(panel()!.textContent).toContain("Question 2 of 2");
    expect(control("no")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("Back to Question 1 and No takes the box off the photo", () => {
    const tool = mount();
    confirmTree(tool);
    act(() => tool.selectBoxById("c-tree"));
    press(control("back-to-question-2"));
    press(control("back-to-question-1"));
    expect(panel()!.textContent).toContain("Question 1 of 2");
    expect(data(tool, "c-tree")).toMatchObject({ onSidewalk: true, obstructs: true, severity: 2 });
    press(control("on-sidewalk-no"));
    expect(tool.selectedId).toBeNull();
    expect(data(tool, "c-tree")).toMatchObject({ onSidewalk: false, obstructs: false, severity: null });
    expect(tool.isOffPhoto("c-tree")).toBe(true);
  });

  // Rans (4 Nov 2026): the severity panel, Question 2 and Question 1 reached
  // with Back have no close button, so the way out is a click on the photo
  // away from the box
  it("closes the severity panel, Question 2 and Question 1 with a click on the photo, changing nothing", () => {
    const tool = mount();
    confirmTree(tool);
    const before = JSON.stringify(data(tool, "c-tree"));
    const views: Array<[string, string[]]> = [
      ["How severe is this obstruction?", []],
      ["Question 2 of 2", ["back-to-question-2"]],
      ["Question 1 of 2", ["back-to-question-2", "back-to-question-1"]],
    ];
    for (const [shown, backs] of views) {
      // Empty photo, then where the car is (hidden while the tree is open)
      for (const [x, y] of [[700, 400], [250, 150]]) {
        act(() => tool.selectBoxById("c-tree"));
        for (const back of backs) press(control(back));
        expect(panel()!.textContent).toContain(shown);
        expect(panel()!.querySelector('[aria-label="Close"]')).toBeNull();
        clickAt(tool, x, y);
        expect(tool.selectedId).toBeNull();
        expect(tool.shapes).toHaveLength(3);
        expect(JSON.stringify(data(tool, "c-tree"))).toBe(before);
      }
    }
  });

  it("closes a reopened box answered off the path, and a reopened Not an object box, with a click on the photo, changing nothing", () => {
    const tool = mount();
    act(() => {
      tool.selectBoxById("a-car");
      tool.onSetOnSidewalk(false);
      tool.selectBoxById("c-tree");
      tool.onMarkNotAnObject();
    });
    for (const [id, shown] of [["a-car", "Question 1 of 2"], ["c-tree", "Restore"]]) {
      const before = JSON.stringify(data(tool, id));
      act(() => tool.selectBoxById(id));
      expect(panel()!.textContent).toContain(shown);
      expect(panel()!.querySelector('[aria-label="Close"]')).toBeNull();
      // Empty photo, away from every box
      clickAt(tool, 700, 450);
      expect(tool.selectedId).toBeNull();
      expect(tool.shapes).toHaveLength(3);
      expect(JSON.stringify(data(tool, id))).toBe(before);
      expect(tool.isOffPhoto(id)).toBe(true);
    }
  });

  it("resets the view when another box is opened", () => {
    const tool = mount();
    confirmTree(tool);
    act(() => tool.selectBoxById("c-tree"));
    press(control("back-to-question-2"));
    press(control("back-to-question-1"));
    // From the lists, another box
    act(() => tool.selectBoxById("a-car"));
    expect(panel()!.textContent).toContain("Question 1 of 2");
    expect(control("on-sidewalk-yes")!.getAttribute("aria-pressed")).toBe("false");
    act(() => tool.selectBoxById("c-tree"));
    expect(panel()!.querySelector("[data-severity-panel]")).not.toBeNull();
  });

  describe("one box at a time on the desktop layout", () => {
    it("keeps only the open box on the photo, drawn and clickable, until it closes", () => {
      const tool = mount();
      act(() => tool.selectBoxById("c-tree"));
      expect(tool.isOffPhoto("c-tree")).toBe(false);
      expect(tool.isOffPhoto("a-car")).toBe(true);
      expect(tool.isOffPhoto("b-pole")).toBe(true);
      // Not stored as hidden
      expect(tool.state.hiddenBoxIds).toEqual([]);
      act(() => tool.onClose());
      for (const id of ["a-car", "b-pole", "c-tree"]) expect(tool.isOffPhoto(id)).toBe(false);
    });

    it("closes the open box with a click where a hidden box is, without opening it or drawing a box", () => {
      const tool = mount();
      act(() => tool.selectBoxById("c-tree"));
      // Inside the car, away from the pole
      clickAt(tool, 250, 150);
      expect(tool.selectedId).toBeNull();
      expect(tool.shapes).toHaveLength(3);
      // Closed, the car is clickable again
      clickAt(tool, 250, 150);
      expect(tool.selectedId).toBe("a-car");
    });

    it("draws a new box with a drag on the photo while a box is open, as before, and the new box shows as it grows", () => {
      const tool = mount();
      act(() => tool.selectBoxById("c-tree"));
      act(() => {
        tool.currentAnnotationState.onMouseDown(700, 400);
        tool.currentAnnotationState.onMouseMove(760, 480);
      });
      const drawing = tool.shapes[tool.shapes.length - 1].getAnnotationData().id;
      expect(tool.isOffPhoto(drawing)).toBe(false);
      // The tree's panel stays open during the drag, as before
      expect(tool.selectedId).toBe("c-tree");
      act(() => tool.currentAnnotationState.onMouseUp());
      expect(tool.shapes).toHaveLength(4);
      expect(tool.selectedId).toBe(drawing);
      expect(tool.isOffPhoto("c-tree")).toBe(true);
    });

    it("keeps a box hidden with the eye hidden after the panel closes", () => {
      const tool = mount();
      act(() => tool.toggleBoxHidden("a-car"));
      act(() => tool.selectBoxById("c-tree"));
      act(() => tool.onClose());
      expect(tool.isOffPhoto("a-car")).toBe(true);
      expect(tool.isOffPhoto("b-pole")).toBe(false);
    });

    it("leaves annotators' desktop as it was: every box on the photo, and a click on another box opens it", () => {
      window.localStorage.clear();
      writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
      const tool = mount({ isAnnotator: true });
      act(() => tool.selectBoxById("c-tree"));
      for (const id of ["a-car", "b-pole", "c-tree"]) expect(tool.isOffPhoto(id)).toBe(false);
      clickAt(tool, 250, 150);
      expect(tool.selectedId).toBe("a-car");
    });
  });

  describe("a box marked Not an object", () => {
    const removedChip = (label: string) =>
      Array.from(host.querySelectorAll('[data-tray="removed"]')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

    it("leaves the photo once its panel closes, cannot be clicked, and comes back while its panel is open", () => {
      const tool = mount();
      act(() => tool.selectBoxById("a-car"));
      act(() => tool.onMarkNotAnObject());
      expect(tool.selectedId).toBeNull();
      expect(tool.isOffPhoto("a-car")).toBe(true);
      expect(tool.isBoxHidden("a-car")).toBe(false);
      clickAt(tool, 250, 150);
      expect(tool.selectedId).not.toBe("a-car");
      act(() => tool.onClose());
      // Listed under Not an object, with no eye, and its name opens it
      expect(removedChip("Car")!.parentElement!.querySelector("[data-eye]")).toBeNull();
      act(() => removedChip("Car")!.click());
      expect(tool.selectedId).toBe("a-car");
      expect(tool.isOffPhoto("a-car")).toBe(false);
      expect(panel()!.textContent).toContain("Restore");
      // Restore: back on the photo, still to decide, once closed too
      act(() => (tool as unknown as { onRestoreObject(): void }).onRestoreObject());
      act(() => tool.onClose());
      expect(tool.isOffPhoto("a-car")).toBe(false);
      expect(data(tool, "a-car").comment).toBe("car");
    });

    it("stays off the photo after Show all, and Hide all leaves it out", () => {
      const tool = mount();
      act(() => tool.selectBoxById("a-car"));
      act(() => tool.onMarkNotAnObject());
      act(() => tool.hideAllBoxes());
      expect(tool.state.hiddenBoxIds.sort()).toEqual(["b-pole", "c-tree"]);
      act(() => tool.showAllBoxes());
      expect(tool.isOffPhoto("a-car")).toBe(true);
    });

    it("comes back off the photo when the session is resumed, and nothing stored changes", () => {
      const tool = mount();
      act(() => tool.selectBoxById("a-car"));
      act(() => tool.onMarkNotAnObject());
      act(() => vi.advanceTimersByTime(1000));
      expect(box("a-car")).toMatchObject({ comment: "not_an_object", selected: false, isRejected: true, obstructs: false, severity: null });
      expect(box("a-car")).not.toHaveProperty("onSidewalk");
      unmount();
      expect(mount().isOffPhoto("a-car")).toBe(true);
    });

    it("stays on the photo for annotators", () => {
      window.localStorage.clear();
      writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
      const tool = mount({ isAnnotator: true });
      act(() => tool.selectBoxById("a-car"));
      act(() => tool.onMarkNotAnObject());
      expect(data(tool, "a-car").comment).toBe("not_an_object");
      expect(tool.isOffPhoto("a-car")).toBe(false);
      clickAt(tool, 250, 150);
      expect(tool.selectedId).toBe("a-car");
    });
  });
});

// S18 (4 Nov 2026), from pilot participant 4: on a laptop, resizing a box
// towards its panel dropped the drag, since the panel sits over the canvas and
// the canvas's mouseleave ended it. During a press the window follows the mouse,
// and the panel fades and lets the pointer through.
describe("dragging a box with its panel open on the desktop layout (S18)", () => {
  type DragTool = Tool & { state: Tool["state"] & { boxDragging: boolean; inputPosition: { left: number; top: number } } };
  const realRect = HTMLCanvasElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    // The stage at 1:1 from the window's top-left, so client px are stage px
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 960, height: 600, right: 960, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getBoundingClientRect = realRect;
  });

  const canvas = () => host.querySelector("canvas.rp-shapes") as HTMLCanvasElement;
  const panelEl = () => host.querySelector(".rp-selected-input") as HTMLDivElement;
  const carMark = (tool: Tool) => (tool.shapes.find((sh) => sh.getAnnotationData().id === "a-car")!.getAnnotationData() as unknown as { mark: { x: number; y: number; width: number; height: number } }).mark;
  const pressOnCanvas = (tool: Tool, x: number, y: number) =>
    act(() => (tool.onMouseDown as unknown as (e: object) => void)({ nativeEvent: { offsetX: x, offsetY: y }, currentTarget: canvas(), clientX: x, clientY: y, detail: 1 }));
  const windowMouse = (type: string, x: number, y: number, target: EventTarget = window) =>
    act(() => {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    });
  const open = () => {
    const tool = mount() as DragTool;
    tool.currentImageElement = { width: 960, height: 600 };
    act(() => tool.selectBoxById("a-car"));
    return tool;
  };

  it("keeps resizing when the mouse leaves the canvas onto the panel or off the photo, fading the panel meanwhile", () => {
    const tool = open();
    // The panel opens right of the car (100 to 300): 310
    expect(panelEl().style.left).toBe("310px");
    // The car's right edge handle, mid-height
    pressOnCanvas(tool, 300, 160);
    windowMouse("mousemove", 340, 160);
    expect(carMark(tool).width).toBe(240);
    expect(tool.state.boxDragging).toBe(true);
    expect(panelEl().style.pointerEvents).toBe("none");
    expect(panelEl().style.opacity).toBe("0.2");
    expect(panelEl().dataset.boxDragging).toBe("true");
    // Onto the panel: the canvas's mouseleave, then moves the panel would have swallowed
    act(() => (tool as unknown as { onMouseLeave(): void }).onMouseLeave());
    windowMouse("mousemove", 420, 170, panelEl());
    expect(carMark(tool).width).toBe(320);
    // Off the photo: clamped at its edge, still resizing
    windowMouse("mousemove", 1500, 160, document.body);
    expect(carMark(tool).width).toBe(860);
    windowMouse("mousemove", 600, 160, document.body);
    expect(carMark(tool).width).toBe(500);
    // Released over the panel: the drag ends as on the photo, and the panel comes back for the new size
    windowMouse("mouseup", 600, 160, panelEl());
    expect(tool.state.boxDragging).toBe(false);
    expect(panelEl().style.pointerEvents).toBe("");
    expect(panelEl().style.opacity).toBe("");
    expect(panelEl().dataset.boxDragging).toBeUndefined();
    expect(tool.selectedId).toBe("a-car");
    // 600 + 10 + 280 fits in 960
    expect(panelEl().style.left).toBe("610px");
    // Released: the window no longer moves the box
    windowMouse("mousemove", 700, 160);
    expect(carMark(tool).width).toBe(500);
  });

  it("moves the whole box past the panel too, and a release anywhere ends it", () => {
    const tool = open();
    pressOnCanvas(tool, 200, 160);
    windowMouse("mousemove", 260, 200, panelEl());
    expect(carMark(tool)).toMatchObject({ x: 160, y: 140, width: 200, height: 120 });
    expect(tool.state.boxDragging).toBe(true);
    windowMouse("mouseup", 2000, 2000, document.body);
    expect(tool.state.boxDragging).toBe(false);
    windowMouse("mousemove", 300, 300);
    expect(carMark(tool)).toMatchObject({ x: 160, y: 140 });
  });

  it("does not fade the panel for a click on the box, or a move under 3 px", () => {
    const tool = open();
    pressOnCanvas(tool, 200, 160);
    windowMouse("mousemove", 202, 161);
    expect(tool.state.boxDragging).toBe(false);
    windowMouse("mouseup", 202, 161);
    expect(tool.state.boxDragging).toBe(false);
    expect(tool.selectedId).toBe("a-car");
  });

  it("ends the drag when the window loses focus mid-press", () => {
    const tool = open();
    pressOnCanvas(tool, 300, 160);
    windowMouse("mousemove", 340, 160);
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(tool.state.boxDragging).toBe(false);
    windowMouse("mousemove", 500, 160);
    expect(carMark(tool).width).toBe(240);
  });

  it("removes its window listeners when the tool unmounts mid-press", () => {
    const tool = open();
    const removed = vi.spyOn(window, "removeEventListener");
    pressOnCanvas(tool, 300, 160);
    unmount();
    const types = removed.mock.calls.map((c) => c[0]);
    expect(types).toEqual(expect.arrayContaining(["mousemove", "mouseup", "blur"]));
    removed.mockRestore();
  });
});

// S15 (9 Nov 2026): Step 1, whether there is a sidewalk or only a path, in the real tool
describe("Step 1, whether there is a sidewalk (S15)", () => {
  type S15Tool = Tool & {
    state: Tool["state"] & { hasSidewalk: boolean | null; sceneLevel: Record<string, unknown>; showInput: boolean };
    currentImageElement: { width: number; height: number };
  };
  type Data = Record<string, unknown>;
  const fresh = (extra: Record<string, unknown> = {}) => {
    window.localStorage.clear();
    const rec: Record<string, unknown> = { ...record(), ...extra };
    if (!("userHasSidewalk" in extra)) delete rec.userHasSidewalk;
    writeSession({ total: 1, current: 1, data: { imgRecords: [rec], isAnnotator: false } });
  };
  const start = (options: MountOptions = {}) => {
    const tool = mount(options) as S15Tool;
    tool.currentImageElement = { width: 640, height: 360 };
    return tool;
  };
  const presence = (value: boolean) => host.querySelector(`[data-presence-option='${value}']`) as HTMLButtonElement;
  const answer = (value: boolean) => act(() => presence(value).click());
  const data = (tool: Tool, id: string) => tool.shapes.find((s) => s.getAnnotationData().id === id)!.getAnnotationData() as unknown as Data;
  const PATH_SCENE = { sidewalkWidth: null, overallAccessibility: 3, surfaceEvenness: 2, surfaceType: null, surfaceCondition: null, roadBarrier: null };

  it("restores Step 1 with the other answers, and saves it as it changes", () => {
    fresh();
    const tool = start();
    expect(tool.state.hasSidewalk).toBeNull();
    answer(false);
    expect(tool.state.hasSidewalk).toBe(false);
    act(() => vi.advanceTimersByTime(500));
    expect(saved().userHasSidewalk).toBe(false);
    unmount();
    expect(start().state.hasSidewalk).toBe(false);
    unmount();
    // Only a real answer is restored
    fresh({ userHasSidewalk: "true" });
    expect(start().state.hasSidewalk).toBeNull();
  });

  it("shows Step 1 as its own card above Step 2's on a laptop", () => {
    fresh();
    start();
    const card = host.querySelector("#sidewalk-presence-section")!;
    expect(card.textContent).toContain("Step 1: Is There a Sidewalk?");
    expect(card.compareDocumentPosition(host.querySelector("[data-step1-card]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("clears and turns off the four sidewalk-only questions for a path, and turns them back on, empty, for a sidewalk", () => {
    const tool = start();
    act(() => tool.setState({ sceneLevel: COMPLETE_SCENE }));
    answer(false);
    expect(tool.state.sceneLevel).toEqual({ ...COMPLETE_SCENE, sidewalkWidth: null, surfaceType: null, surfaceCondition: null, roadBarrier: null });
    for (const key of ["sidewalkWidth", "surfaceType", "surfaceCondition", "roadBarrier"]) {
      expect(host.querySelector(`[data-scene-question='${key}']`)!.getAttribute("aria-disabled")).toBe("true");
    }
    expect(host.querySelector("[data-scene-question='overallAccessibility']")!.hasAttribute("aria-disabled")).toBe(false);
    answer(true);
    expect(tool.state.sceneLevel.sidewalkWidth).toBeNull();
    expect(host.querySelector("[data-scene-question='sidewalkWidth']")!.hasAttribute("aria-disabled")).toBe(false);
  });

  it("holds the top of the phone's sheet until answered, then sits first in the list, and a path's Step 3 line reads 2 of 2", () => {
    fresh();
    const tool = start({ layout: "sheet" });
    const header = () => host.querySelector("#answer-sheet")!;
    expect(header().querySelector("#sidewalk-presence-section")).not.toBeNull();
    expect(host.querySelector("#scene-level-peek")).toBeNull();
    answer(false);
    expect(host.querySelector("#sidewalk-presence-section")).not.toBeNull();
    // Step 1 before the lists, in the part pulled up
    const step1 = host.querySelector("#sidewalk-presence-section")!;
    expect(step1.compareDocumentPosition(host.querySelector("#box-review-section")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector("#scene-level-peek")!.textContent).toBe("Step 3: Rate the Sidewalk, 0 of 2 answered");
    act(() => tool.setState({ sceneLevel: PATH_SCENE }));
    expect(host.querySelector("#scene-level-peek")!.textContent).toBe("Step 3: Rate the Sidewalk, 2 of 2 answered");
    answer(true);
    expect(host.querySelector("#scene-level-peek")!.textContent).toBe("Step 3: Rate the Sidewalk, 2 of 6 answered");
  });

  it("resets the boxes answered under the other answer, and says so once", () => {
    const tool = start();
    act(() => {
      tool.selectBoxById("a-car");
      tool.onSetOnSidewalk(false);
      tool.selectBoxById("c-tree");
      tool.onSetOnSidewalk(true);
      tool.onSelectObstruction();
      tool.onSetSeverity(3);
      tool.selectBoxById("b-pole");
      tool.onMarkNotAnObject();
    });
    answer(false);
    expect(tool.state.error).toBe("Some boxes need answering again.");
    expect(data(tool, "a-car")).not.toHaveProperty("onSidewalk");
    expect(data(tool, "a-car")).not.toHaveProperty("obstructs");
    expect(data(tool, "a-car").isRejected).toBeFalsy();
    expect(data(tool, "c-tree")).not.toHaveProperty("onSidewalk");
    expect(data(tool, "c-tree")).toMatchObject({ obstructs: true, severity: 3, selected: true });
    expect(data(tool, "b-pole").comment).toBe("not_an_object");
    // The car is back on the photo, still to decide
    expect(tool.isOffPhoto("a-car")).toBe(false);
    act(() => tool.setState({ error: null }));
    answer(true);
    expect(tool.state.error).toBe("Some boxes need answering again.");
    expect(data(tool, "c-tree")).not.toHaveProperty("obstructs");
    expect(data(tool, "c-tree")).not.toHaveProperty("selected");
    expect(data(tool, "c-tree").comment).toBe("tree");
    expect(data(tool, "b-pole").comment).toBe("not_an_object");
  });

  it("says nothing when no box needs answering again", () => {
    fresh();
    const tool = start();
    answer(true);
    expect(tool.state.error).toBeNull();
    answer(false);
    expect(tool.state.error).toBeNull();
  });

  it("asks a path's boxes only whether they obstruct the path, and sends them with no onSidewalk, beside hasSidewalk", async () => {
    fresh();
    const tool = start();
    answer(false);
    act(() => tool.selectBoxById("a-car"));
    expect(host.textContent).toContain("Does Car obstruct the path?");
    expect(host.querySelector("[data-control='on-sidewalk-yes']")).toBeNull();
    expect(host.querySelector("[data-question-step]")).toBeNull();
    act(() => {
      tool.onUnselectObstruction();
      tool.selectBoxById("b-pole");
      tool.onSelectObstruction();
      tool.onSetSeverity(4);
      tool.selectBoxById("c-tree");
      tool.onUnselectObstruction();
      tool.setState({ sceneLevel: PATH_SCENE });
    });
    const fetchMock = vi.fn().mockResolvedValue({ status: 500, json: async () => ({}) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.hasSidewalk).toBe(false);
    expect(body.sceneLevel).toEqual(PATH_SCENE);
    expect(body.selectedObjectsID).toHaveLength(3);
    for (const b of body.selectedObjectsID) expect(b).not.toHaveProperty("onSidewalk");
    expect(body.selectedObjectsID.find((b: Data) => b.id === "b-pole")).toMatchObject({ obstructs: true, severity: 4 });
  });

  it("stops Next Image without Step 1, with its message, and brings Step 1 into view on a laptop", async () => {
    fresh();
    const tool = start();
    const section = host.querySelector("#sidewalk-presence-section") as HTMLElement;
    const scroll = vi.fn();
    section.scrollIntoView = scroll;
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    await act(async () => {
      await tool.submit();
    });
    expect(tool.state.error).toBe("Please say whether there is a sidewalk.");
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("counts changing Step 1 as a change to a sent image", () => {
    const tool = start() as S15Tool & { hasUnsentChanges(): boolean; sentSignature: string | null };
    act(() => tool.setState({}));
    expect(tool.hasUnsentChanges()).toBe(false);
    answer(false);
    expect(tool.hasUnsentChanges()).toBe(true);
  });
});

// S22 (9 Nov 2026): a contributor's new box, dragged out with the mouse on the
// desktop layout, is the only box on the photo from the moment it is big
// enough to keep (5 screen px each way), as an open box is
describe("drawing a new box on the desktop layout (S22)", () => {
  const realRect = HTMLCanvasElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    // The stage at 1:1 from the window's top-left, so client px are stage px
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 960, height: 600, right: 960, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getBoundingClientRect = realRect;
  });

  const OTHERS = ["a-car", "b-pole", "c-tree"];
  const canvas = () => host.querySelector("canvas.rp-shapes") as HTMLCanvasElement;
  const ready = (options: MountOptions = {}) => {
    const tool = mount(options);
    tool.currentImageElement = { width: 960, height: 600 };
    return tool;
  };
  // A press on empty photo, clear of every box, then the window follows the mouse (S18)
  const press = (tool: Tool, x = 600, y = 400) =>
    act(() => (tool.onMouseDown as unknown as (e: object) => void)({ nativeEvent: { offsetX: x, offsetY: y }, currentTarget: canvas(), clientX: x, clientY: y, detail: 1 }));
  const moveTo = (x: number, y: number) =>
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
    });
  const release = (x: number, y: number) =>
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
    });
  const drawnId = (tool: Tool) => tool.shapes.map((s) => s.getAnnotationData()).find((d) => d.editable)?.id;
  const hiddenOf = (tool: Tool, ids: string[]) => ids.map((id) => tool.isBoxHidden(id));

  it("hides every other box once the drag passes the size a box is kept at, and keeps them hidden with the new box open", () => {
    const tool = ready();
    press(tool);
    // 3 px: still a click, nothing hidden
    moveTo(603, 403);
    expect(drawnId(tool)).toBeDefined();
    expect(hiddenOf(tool, OTHERS)).toEqual([false, false, false]);
    // 4 by 40 px: thinner than 5 px, which a release would throw away
    moveTo(604, 440);
    expect(hiddenOf(tool, OTHERS)).toEqual([false, false, false]);
    // Past it: only the new box shows, and only it can be clicked
    moveTo(700, 500);
    const id = drawnId(tool)!;
    expect(tool.isBoxHidden(id)).toBe(false);
    expect(hiddenOf(tool, OTHERS)).toEqual([true, true, true]);
    expect(OTHERS.every((other) => tool.isOffPhoto(other))).toBe(true);
    // Released: the new box opens, and stays the only box
    release(700, 500);
    expect(tool.selectedId).toBe(id);
    expect((tool.state as unknown as { showInput: boolean }).showInput).toBe(true);
    expect(tool.isBoxHidden(id)).toBe(false);
    expect(hiddenOf(tool, OTHERS)).toEqual([true, true, true]);
    // Closed: every box is back, and none was hidden with the eye
    act(() => tool.onClose());
    expect(hiddenOf(tool, [...OTHERS, id])).toEqual([false, false, false, false]);
    expect(tool.state.hiddenBoxIds).toEqual([]);
  });

  it("hides nothing for a click on empty photo, at any point", () => {
    const tool = ready();
    press(tool);
    expect(hiddenOf(tool, OTHERS)).toEqual([false, false, false]);
    release(600, 400);
    expect(hiddenOf(tool, OTHERS)).toEqual([false, false, false]);
    expect(tool.shapes).toHaveLength(3);
    expect(tool.selectedId).toBeNull();
  });

  it("brings the other boxes back at once when the drag shrinks back to a click and is thrown away", () => {
    const tool = ready();
    press(tool);
    moveTo(700, 500);
    expect(hiddenOf(tool, OTHERS)).toEqual([true, true, true]);
    moveTo(602, 401);
    expect(hiddenOf(tool, OTHERS)).toEqual([false, false, false]);
    release(602, 401);
    expect(tool.shapes).toHaveLength(3);
    expect(hiddenOf(tool, OTHERS)).toEqual([false, false, false]);
  });

  it("with another box open, shows only the new box during the drag, then opens it", () => {
    const tool = ready();
    act(() => tool.selectBoxById("a-car"));
    expect(hiddenOf(tool, OTHERS)).toEqual([false, true, true]);
    press(tool);
    moveTo(700, 500);
    const id = drawnId(tool)!;
    expect(tool.isBoxHidden(id)).toBe(false);
    expect(hiddenOf(tool, OTHERS)).toEqual([true, true, true]);
    // The car's panel closes with its box off the photo
    expect((tool.state as unknown as { showInput: boolean }).showInput).toBe(false);
    release(700, 500);
    expect(tool.selectedId).toBe(id);
    expect(hiddenOf(tool, OTHERS)).toEqual([true, true, true]);
  });

  it("keeps a box hidden with the eye hidden after the new box closes", () => {
    const tool = ready();
    act(() => tool.toggleBoxHidden("b-pole"));
    press(tool);
    moveTo(700, 500);
    release(700, 500);
    act(() => tool.onClose());
    expect(hiddenOf(tool, OTHERS)).toEqual([false, true, false]);
    expect(tool.state.hiddenBoxIds).toEqual(["b-pole"]);
  });

  it("hides nothing for an annotator on the desktop layout", () => {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [record()], isAnnotator: true } });
    const tool = ready({ isAnnotator: true });
    press(tool);
    moveTo(700, 500);
    expect(drawnId(tool)).toBeDefined();
    expect(hiddenOf(tool, OTHERS)).toEqual([false, false, false]);
    release(700, 500);
    expect(hiddenOf(tool, OTHERS)).toEqual([false, false, false]);
  });

  // The tour's Step 3 card (S22 A): react-joyride takes any ancestor with
  // overflow auto or scroll for the target's scrolling box, and scrolled the
  // page to the top for a column that never scrolls
  it("keeps the contributors' Step 3 column from being a scrolling box, so the tour scrolls the page to Step 3", () => {
    mount();
    let el = host.querySelector("#scene-level-section")!.parentElement;
    expect(el).toBeTruthy();
    while (el && el !== host) {
      expect(el.className, el.className).not.toMatch(/overflow-(y-|x-)?(auto|scroll)/);
      el = el.parentElement;
    }
  });

  it("leaves the sheet layout as it was: a mouse drag with nothing open hides nothing", () => {
    const tool = ready({ layout: "sheet" });
    press(tool);
    moveTo(700, 500);
    expect(drawnId(tool)).toBeDefined();
    expect(hiddenOf(tool, OTHERS)).toEqual([false, false, false]);
  });
});
