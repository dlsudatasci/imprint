// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation from "./ReactPictureAnnotation";
import { readSessionData, writeSession, readCurrentCount, readReachedCount } from "@/util/sessionCache";
import { requestImage, FINISH_BEFORE_LEAVING } from "@/util/imageNavigation";

vi.mock("next/router", () => ({ default: { reload: vi.fn() } }));
import Router from "next/router";

/**
 * Moving between images (6 Nov 2026): Previous and the progress strip, back
 * or forward up to the furthest image reached. An image already sent and
 * changed since is sent again before the page moves, so no answer stays only
 * in this browser. Same stand-in canvas as the persistence tests.
 */
type Tool = {
  state: { sceneLevel: Record<string, unknown>; error: string | null };
  setState(update: object): void;
  submit(): Promise<void>;
  onPrevious(): Promise<void>;
  goToImage(target: number): Promise<void>;
  selectBoxById(id: string): void;
  onSetOnSidewalk(onSidewalk: boolean): void;
  onUnselectObstruction(): void;
  onSelectObstruction(): void;
  onSetSeverity(severity: number): void;
  onMarkNotAnObject(): void;
};

const mark = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h, type: "RECT" });
const NO_SIDEWALK = { sidewalkWidth: "no_sidewalk", surfaceCondition: null, walkability: null, overallAccessibility: null };
const suggestion = (id: string, comment: string, m: ReturnType<typeof mark>) => ({ id, comment, mark: m, editable: false, selected: false, isRejected: false });
/** An image as it comes back once sent: every suggestion answered No on the path, and Step 2 answered */
const sentRecord = (n: number) => ({
  imageID: `IMG-${n}`,
  url: `/photo-${n}.jpg`,
  city: "manila",
  annotationList: [
    { ...suggestion("a-car", "car", mark(100, 100, 200, 120)), isRejected: true, onSidewalk: true, obstructs: false, initialState: { comment: "car", mark: mark(100, 100, 200, 120) } },
    { ...suggestion("c-tree", "tree", mark(400, 50, 80, 200)), isRejected: true, onSidewalk: true, obstructs: false, initialState: { comment: "tree", mark: mark(400, 50, 80, 200) } },
  ],
  userSceneLevel: NO_SIDEWALK,
  userSceneScale: 2,
});
/** An image not sent yet */
const freshRecord = (n: number) => ({
  imageID: `IMG-${n}`,
  url: `/photo-${n}.jpg`,
  city: "manila",
  annotationList: [suggestion("a-car", "car", mark(100, 100, 200, 120)), suggestion("c-tree", "tree", mark(400, 50, 80, 200))],
});

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean; ResizeObserver: unknown };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
});

let root: Root | null = null;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

/** A three-image session on image `current`, with images before `reached` sent */
function session({ current, reached, isAnnotator = false }: { current: number; reached: number; isAnnotator?: boolean }) {
  window.localStorage.clear();
  const imgRecords = [1, 2, 3].map((n) => (n < reached ? sentRecord(n) : freshRecord(n)));
  writeSession({ total: 3, current, data: { imgRecords, isAnnotator }, reached });
}

function mount({ current, isAnnotator = false }: { current: number; isAnnotator?: boolean }) {
  const ref = React.createRef<Tool>();
  const data = readSessionData();
  const rec = data.imgRecords[current - 1];
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
        totalAnnotationCount={3}
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

const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => u === url);
const sentBody = () => JSON.parse(calls("/api/annotationSubmit")[0][1].body);
const go = async (tool: Tool, target: number) => act(async () => { await tool.goToImage(target); });
/** Turns the car from a No into a Yes with severity 2: a real change, still complete */
const changeCar = (tool: Tool) =>
  act(() => {
    tool.selectBoxById("a-car");
    tool.onSelectObstruction();
    tool.onSetSeverity(2);
  });

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  (Router.reload as ReturnType<typeof vi.fn>).mockClear();
  fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({}) }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe("moving between images (6 Nov 2026)", () => {
  it("opens a later image already reached with nothing to send when nothing changed", async () => {
    session({ current: 1, reached: 3 });
    const tool = mount({ current: 1 });
    await go(tool, 3);
    expect(calls("/api/annotationSubmit")).toHaveLength(0);
    expect(JSON.parse(calls("/api/updateSessionCount")[0][1].body)).toEqual({ currentAnnotationCount: 3 });
    expect(readCurrentCount()).toBe(3);
    expect(sessionStorage.getItem("isNavigatingImages")).toBe("true");
    expect(Router.reload).toHaveBeenCalledTimes(1);
    // Every image's answers are still in the cache
    expect(readSessionData().imgRecords[0].annotationList[0]).toMatchObject({ isRejected: true, obstructs: false });
  });

  it("goes when the strip asks, through the window event", async () => {
    session({ current: 2, reached: 3 });
    mount({ current: 2 });
    await act(async () => {
      requestImage(3);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(readCurrentCount()).toBe(3);
    expect(Router.reload).toHaveBeenCalledTimes(1);
  });

  it("sends an image already sent again, with the image asked for, when its answers changed", async () => {
    session({ current: 1, reached: 3 });
    const tool = mount({ current: 1 });
    changeCar(tool);
    await go(tool, 3);
    expect(calls("/api/annotationSubmit")).toHaveLength(1);
    const body = sentBody();
    expect(body.currentAnnotationCount).toBe(3);
    expect(body.selectedObjectsID.find((b: { id: string }) => b.id === "a-car")).toMatchObject({ selected: true, obstructs: true, severity: 2 });
    // Its position is sent with the image, not apart
    expect(calls("/api/updateSessionCount")).toHaveLength(0);
    expect(readCurrentCount()).toBe(3);
    expect(readReachedCount()).toBe(3);
    // The cache holds what was sent, marked as the server has it
    const cached = readSessionData().imgRecords[0];
    expect(cached.annotationList.find((b: { id: string }) => b.id === "a-car")).toMatchObject({ obstructs: true, severity: 2 });
    expect(cached).not.toHaveProperty("userSentSignature");
    expect(Router.reload).toHaveBeenCalledTimes(1);
  });

  it("does the same with Previous", async () => {
    session({ current: 2, reached: 3 });
    const tool = mount({ current: 2 });
    changeCar(tool);
    await act(async () => { await tool.onPrevious(); });
    expect(sentBody().currentAnnotationCount).toBe(1);
    expect(readCurrentCount()).toBe(1);
  });

  it("stays, with the message, when the changed image is missing an answer", async () => {
    session({ current: 1, reached: 3 });
    const tool = mount({ current: 1 });
    act(() => tool.setState({ sceneLevel: { sidewalkWidth: null, surfaceCondition: null, walkability: null, overallAccessibility: null } }));
    await go(tool, 3);
    expect(calls("/api/annotationSubmit")).toHaveLength(0);
    expect(calls("/api/updateSessionCount")).toHaveLength(0);
    expect(tool.state.error).toBeTruthy();
    expect(readCurrentCount()).toBe(1);
    expect(Router.reload).not.toHaveBeenCalled();
  });

  it("still knows of a change after a refresh, and sends it on leaving", async () => {
    session({ current: 1, reached: 3 });
    const tool = mount({ current: 1 });
    changeCar(tool);
    // The change is saved to the cache, then the page is refreshed
    act(() => vi.advanceTimersByTime(500));
    expect(typeof readSessionData().imgRecords[0].userSentSignature).toBe("string");
    unmount();
    const again = mount({ current: 1 });
    await go(again, 2);
    expect(calls("/api/annotationSubmit")).toHaveLength(1);
    expect(sentBody().currentAnnotationCount).toBe(2);
  });

  it("does not send the furthest image, which was never sent: its edits stay in the cache, as before", async () => {
    session({ current: 3, reached: 3 });
    const tool = mount({ current: 3 });
    act(() => {
      tool.selectBoxById("a-car");
      tool.onSetOnSidewalk(true);
    });
    await go(tool, 1);
    expect(calls("/api/annotationSubmit")).toHaveLength(0);
    expect(readCurrentCount()).toBe(1);
    expect(readSessionData().imgRecords[2].annotationList.find((b: { id: string }) => b.id === "a-car")).toMatchObject({ onSidewalk: true });
  });

  it("never goes past the furthest image reached, outside the session or to the image on screen", async () => {
    session({ current: 1, reached: 2 });
    const tool = mount({ current: 1 });
    for (const target of [3, 4, 0, 1]) await go(tool, target);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readCurrentCount()).toBe(1);
    expect(Router.reload).not.toHaveBeenCalled();
  });

  it("asks an annotator to finish a changed image with Next Image before leaving it", async () => {
    session({ current: 1, reached: 2, isAnnotator: true });
    const tool = mount({ current: 1, isAnnotator: true });
    act(() => {
      tool.selectBoxById("a-car");
      tool.onMarkNotAnObject();
    });
    await go(tool, 2);
    expect(tool.state.error).toBe(FINISH_BEFORE_LEAVING);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readCurrentCount()).toBe(1);
  });

  it("moves the furthest image reached on when Next Image sends the furthest image", async () => {
    session({ current: 1, reached: 1 });
    const tool = mount({ current: 1 });
    act(() => {
      for (const id of ["a-car", "c-tree"]) {
        tool.selectBoxById(id);
        tool.onSetOnSidewalk(true);
        tool.onUnselectObstruction();
      }
      tool.setState({ sceneLevel: NO_SIDEWALK });
    });
    await act(async () => { await tool.submit(); });
    expect(sentBody().currentAnnotationCount).toBe(2);
    expect(readCurrentCount()).toBe(2);
    expect(readReachedCount()).toBe(2);
  });
});
