// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation, { SHEET_EVENT } from "./ReactPictureAnnotation";
import { readSessionData, writeSession } from "@/util/sessionCache";
import { FINISH_TUTORIAL_LABEL } from "@/util/tutorialVersion";

vi.mock("next/router", () => ({ default: { reload: vi.fn() } }));
import Router from "next/router";

/**
 * S30 (14 Nov 2026), in the real tool: the tutorial's last photo reads
 * Finish Tutorial, which is refused while a question is unanswered as on any
 * photo (after Skip practice the contributor answers the photo on their own),
 * the form is told while a photo is being saved, a contributor's session
 * adds the tour's opens and time to the photo's telemetry, and the tour
 * closing an open box on a phone keeps its answers and the zoom. Same
 * stand-in canvas as the navigation tests.
 */
type Tool = {
  state: { error: string | null; submitting: boolean; showInput: boolean };
  selectedId: string | null;
  currentAnnotationData: Array<Record<string, unknown>>;
  view: { zoom: number; panX: number; panY: number };
  submit(): Promise<void>;
  selectBoxById(id: string): void;
  onSetOnSidewalk(onSidewalk: boolean): void;
  onUnselectObstruction(): void;
};

const mark = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h, type: "RECT" });
const COMPLETE_SCENE = { sidewalkWidth: "two_people", overallAccessibility: 5, surfaceEvenness: 3, surfaceType: "concrete", surfaceCondition: 3, roadBarrier: false };
const suggestion = (id: string, comment: string, m: ReturnType<typeof mark>) => ({ id, comment, mark: m, editable: false, selected: false, isRejected: false });
/** A photo with Step 1 and Step 3 answered and its two suggestions not yet */
const record = () => ({
  imageID: "IMG-1",
  url: "/photo-1.jpg",
  city: "manila",
  userHasSidewalk: true,
  userSceneLevel: COMPLETE_SCENE,
  userSceneScale: 2,
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

type Extra = Partial<React.ComponentProps<typeof ReactPictureAnnotation>>;
function mount({ current = 1, total = 1, ...extra }: { current?: number; total?: number } & Extra = {}) {
  window.localStorage.clear();
  writeSession({ total, current, data: { imgRecords: Array.from({ length: total }, record), isAnnotator: false } });
  const rec = readSessionData().imgRecords[current - 1];
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
        totalAnnotationCount={total}
        username="test"
        {...extra}
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
const submitButton = () => host.querySelector<HTMLButtonElement>("button[type='submit']");
/** On the path and not obstructing: a full answer */
const answer = (tool: Tool, id: string) =>
  act(() => {
    tool.selectBoxById(id);
    tool.onSetOnSidewalk(true);
    tool.onUnselectObstruction();
  });
const submit = (tool: Tool) => act(async () => { await tool.submit(); });

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

describe("the tutorial's last photo (S30)", () => {
  it("reads Finish Tutorial when the tutorial says so, Finish Session in a session, and Next Image before the last", () => {
    mount({ finishLabel: FINISH_TUTORIAL_LABEL });
    expect(submitButton()?.textContent).toBe("Finish Tutorial");
    unmount();
    mount();
    expect(submitButton()?.textContent).toBe("Finish Session");
    unmount();
    mount({ current: 1, total: 3, finishLabel: FINISH_TUTORIAL_LABEL });
    expect(submitButton()?.textContent).toBe("Next Image");
  });

  it("refuses Finish Tutorial while a question is unanswered, and sends the photo once all are answered", async () => {
    const tool = mount({ finishLabel: FINISH_TUTORIAL_LABEL });
    answer(tool, "a-car");
    await submit(tool);
    expect(calls("/api/annotationSubmit")).toHaveLength(0);
    expect(tool.state.error).toBeTruthy();
    expect(Router.reload).not.toHaveBeenCalled();

    answer(tool, "c-tree");
    await submit(tool);
    expect(calls("/api/annotationSubmit")).toHaveLength(1);
    // Past the last photo, which the tutorial page reads as finished
    expect(sentBody().currentAnnotationCount).toBe(2);
    expect(Router.reload).toHaveBeenCalledTimes(1);
  });
});

describe("saving, for the tour's ? button (S30)", () => {
  it("tells the form when a photo starts and stops being saved", async () => {
    const onSavingChange = vi.fn();
    const tool = mount({ onSavingChange });
    answer(tool, "a-car");
    answer(tool, "c-tree");
    // The save waits on the server, here until it answers with an error
    let answerSave: (res: unknown) => void = () => undefined;
    fetchMock.mockImplementation((url: string) => (url === "/api/annotationSubmit"
      ? new Promise((resolve) => { answerSave = resolve; })
      : Promise.resolve({ status: 200, ok: true, json: async () => ({}) })));
    let sent: Promise<void> | undefined;
    act(() => { sent = tool.submit(); });
    expect(tool.state.submitting).toBe(true);
    expect(onSavingChange.mock.calls.map(([saving]) => saving)).toEqual([true]);
    await act(async () => {
      answerSave({ status: 500, ok: false, json: async () => ({}) });
      await sent;
    });
    expect(onSavingChange.mock.calls.map(([saving]) => saving)).toEqual([true, false]);
  });
});

describe("the tour's telemetry (S30)", () => {
  it("adds the tour's opens and time on the photo when the page gives them", async () => {
    const tourTelemetry = vi.fn(() => ({ tourOpens: 2, msTourOpen: 31500 }));
    const tool = mount({ tourTelemetry });
    answer(tool, "a-car");
    answer(tool, "c-tree");
    await submit(tool);
    expect(tourTelemetry).toHaveBeenCalledTimes(1);
    expect(sentBody().telemetry).toMatchObject({ tourOpens: 2, msTourOpen: 31500 });
    // Beside the step timings, which are not changed
    expect(typeof sentBody().telemetry.imageDurationMs).toBe("number");
  });

  it("adds nothing without them (annotators, the tutorial)", async () => {
    const tool = mount();
    answer(tool, "a-car");
    answer(tool, "c-tree");
    await submit(tool);
    expect(sentBody().telemetry).not.toHaveProperty("tourOpens");
    expect(sentBody().telemetry).not.toHaveProperty("msTourOpen");
  });
});

// The tour opens with moveSheet("collapsed") (useTour), which closes an open box on a phone
describe("the tour closing an open box (S30)", () => {
  it("keeps the box's answers as they were, and the photo's zoom", () => {
    const tool = mount({ layout: "sheet" });
    answer(tool, "c-tree");
    // The car open, half answered: on the path, the obstruction question not yet
    act(() => {
      tool.selectBoxById("a-car");
      tool.onSetOnSidewalk(true);
    });
    expect(tool.selectedId).toBe("a-car");
    tool.view = { zoom: 2.5, panX: 40, panY: -30 };
    const before = JSON.parse(JSON.stringify(tool.currentAnnotationData));
    act(() => { window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail: "collapsed" })); });
    expect(tool.selectedId).toBeNull();
    expect(JSON.parse(JSON.stringify(tool.currentAnnotationData))).toEqual(before);
    expect(tool.currentAnnotationData.find((b) => b.id === "a-car")).toMatchObject({ onSidewalk: true });
    expect(tool.view.zoom).toBe(2.5);
    // And in the cached batch, which a reload reads
    act(() => vi.advanceTimersByTime(1000));
    const cached = readSessionData().imgRecords[0].annotationList.find((b: { id: string }) => b.id === "a-car");
    expect(cached).toMatchObject({ onSidewalk: true });
  });

  it("is not heard on a laptop, where the tour leaves an open box open", () => {
    const tool = mount();
    act(() => tool.selectBoxById("a-car"));
    act(() => { window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail: "collapsed" })); });
    expect(tool.selectedId).toBe("a-car");
  });
});
