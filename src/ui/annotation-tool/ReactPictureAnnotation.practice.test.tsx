// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation, { type PracticeEvent, type PracticeLock, type PracticeHighlight } from "./ReactPictureAnnotation";
import { writeSession } from "@/util/sessionCache";
import TUTORIAL_IMAGES from "@/data/tutorialImages";
import { ids } from "@/features/home/howItWorks/demoScript";
import { DRAW_TARGET } from "@/features/tutorial/practiceSteps";
import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";
import { applyView, fitImage, type Fit, type View } from "./viewTransform";
import { TOUCH_HANDLE_HIT_PX } from "./touchGeometry";

/**
 * The tutorial's practice on its first photo (S19, 7 Nov 2026): the tool says
 * what changed, with its state (onPracticeEvent), locks what is not yet the
 * practice's step (practiceLock) and outlines what is (practiceHighlight).
 * Without those props it behaves exactly as before, for contributors and
 * annotators. Same stand-in canvas as ReactPictureAnnotation.panel.test.tsx.
 */
type Box = { id: string; comment?: string; editable?: boolean; onSidewalk?: boolean; obstructs?: boolean; severity?: number | null; mark: { x: number; y: number; width: number; height: number } };
type Tool = {
  shapes: { getAnnotationData(): Box }[];
  selectedId: string | null;
  currentImageElement: { width: number; height: number };
  selectBoxById(id: string): void;
  addBoxFromButton(): void;
  onMouseDown(event: { nativeEvent: { offsetX: number; offsetY: number } }): void;
  onMouseMove(event: { nativeEvent: { offsetX: number; offsetY: number } }): void;
  onMouseUp(): void;
  onSetOnSidewalk(v: boolean): void;
  onMarkNotAnObject(): void;
  onSceneAnswer(updates: Record<string, unknown>): void;
  submit(): Promise<void> | undefined;
  setState(state: Record<string, unknown>): void;
  state: { showInput: boolean; sceneLevel: Record<string, unknown>; error: string | null; hasSidewalk: boolean | null };
};

const PHOTO = TUTORIAL_IMAGES[0];
const boxesOf = () => JSON.parse(JSON.stringify(PHOTO.annotationList));
const markOf = (id: string) => PHOTO.annotationList.find((b) => b.id === id)!.mark;
const centre = (id: string): [number, number] => {
  const m = markOf(id);
  return [m.x + m.width / 2, m.y + m.height / 2];
};
// Empty photo, clear of every box (scale 1 in jsdom, no photo loaded)
const EMPTY: [number, number] = [580, 300];

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
let ref: React.RefObject<ReactPictureAnnotation | null>;

type Props = {
  isAnnotator?: boolean;
  /** A contributor's Step 1 (S15) is answered Yes on mounting, as the practice's first step does, unless this is false */
  answerStep1?: boolean;
  onPracticeEvent?: (event: PracticeEvent) => void;
  practiceLock?: PracticeLock | null;
  practiceHighlight?: PracticeHighlight | null;
  /** S23 B: the phone and tablet layout */
  layout?: "desktop" | "sheet";
};
let lastProps: Props = {};

function render({ answerStep1, ...props }: Props) {
  void answerStep1;
  lastProps = props;
  act(() => {
    root!.render(
      <ReactPictureAnnotation
        ref={ref}
        image="/images/tutorial/tutorial-1.jpg"
        onSelect={() => undefined}
        onChange={() => undefined}
        width={960}
        height={600}
        annotationData={boxes}
        imageID="TUTORIAL-001"
        city="laspinas"
        currentAnnotationCount={1}
        totalAnnotationCount={3}
        username="test"
        {...props}
      />
    );
  });
}
let boxes: ReturnType<typeof boxesOf> = [];

function mount(props: Props = {}): Tool {
  window.localStorage.clear();
  window.sessionStorage.clear();
  boxes = boxesOf();
  writeSession({ total: 3, current: 1, data: { imgRecords: [{ ...PHOTO, annotationList: boxesOf() }], isAnnotator: props.isAnnotator ?? false } });
  ref = React.createRef<ReactPictureAnnotation>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  render(props);
  const tool = ref.current as unknown as Tool;
  tool.currentImageElement = { width: 640, height: 360 };
  // Step 2 waits for Step 1 (S15): the tutorial photo has a sidewalk
  if (!props.isAnnotator && props.answerStep1 !== false) {
    act(() => (host.querySelector("[data-presence-option='true']") as HTMLButtonElement).click());
  }
  return tool;
}

const at = (x: number, y: number) => ({ nativeEvent: { offsetX: x, offsetY: y } });
const press = (tool: Tool, path: Array<[number, number]>) =>
  act(() => {
    tool.onMouseDown(at(...path[0]));
    for (const p of path.slice(1)) tool.onMouseMove(at(...p));
    tool.onMouseUp();
  });
const button = (control: string) => host.querySelector(`[data-control='${control}']`) as HTMLButtonElement | null;
const buttonByText = (text: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = (element: HTMLElement | null | undefined) => {
  expect(element).toBeTruthy();
  act(() => element!.click());
};
const choose = (select: HTMLSelectElement | null, value: string) => {
  expect(select).toBeTruthy();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(select, value);
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const boxIn = (tool: Tool, id: string) => tool.shapes.find((s) => s.getAnnotationData().id === id)!.getAnnotationData();
const drawnBoxes = (tool: Tool) => tool.shapes.map((s) => s.getAnnotationData()).filter((b) => b.editable);

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.restoreAllMocks();
});

const OPEN: PracticeLock = { openable: "all", canDraw: true, allowAnswers: null };

describe("onPracticeEvent", () => {
  it("fires after each change, of every type, with the tool's state after it", () => {
    const events: PracticeEvent[] = [];
    const tool = mount({ onPracticeEvent: (e) => events.push(e) });
    const last = () => events[events.length - 1];
    const types = () => events.map((e) => e.type);

    // open, onSidewalk, obstructs, severity, close: the tree, Yes, Yes, severity 2
    press(tool, [centre(ids.tree)]);
    expect(last()).toMatchObject({ type: "open", id: ids.tree });
    expect(last().state.openId).toBe(ids.tree);
    click(button("on-sidewalk-yes"));
    expect(events.find((e) => e.type === "onSidewalk")).toMatchObject({ id: ids.tree, value: true });
    expect(events.find((e) => e.type === "onSidewalk")!.state.boxes.find((b) => b.id === ids.tree)!.onSidewalk).toBe(true);
    click(button("yes"));
    expect(last()).toMatchObject({ type: "obstructs", id: ids.tree, value: true });
    click(button("confirm"));
    const severity = events.find((e) => e.type === "severity")!;
    expect(severity).toMatchObject({ id: ids.tree, value: 3 });
    expect(severity.state.boxes.find((b) => b.id === ids.tree)).toMatchObject({ obstructs: true, severity: 3 });
    expect(last()).toMatchObject({ type: "close", id: ids.tree });
    expect(last().state.openId).toBeNull();

    // notAnObject and restore: the motorcycle
    act(() => tool.selectBoxById(ids.moto));
    click(buttonByText("Not an object"));
    expect(events.find((e) => e.type === "notAnObject")).toMatchObject({ id: ids.moto });
    expect(events.find((e) => e.type === "notAnObject")!.state.boxes.find((b) => b.id === ids.moto)!.comment).toBe(NOT_AN_OBJECT);
    act(() => tool.selectBoxById(ids.moto));
    click(buttonByText("Restore"));
    expect(last()).toMatchObject({ type: "restore", id: ids.moto });

    // drawn, category, deleted: a box around the white post
    press(tool, [[428, 96], [450, 216]]);
    const drawn = events.find((e) => e.type === "drawn")!;
    expect(drawn).toBeTruthy();
    const drawnId = drawn.id!;
    expect(drawn.state.boxes.find((b) => b.id === drawnId)).toMatchObject({ editable: true, mark: { x: 428, y: 96, width: 22, height: 120 } });
    choose(host.querySelector("select[data-control='category']"), "lamp_post");
    expect(last()).toMatchObject({ type: "category", id: drawnId, value: "lamp_post" });
    click(buttonByText("Delete box"));
    expect(events.find((e) => e.type === "deleted")).toMatchObject({ id: drawnId });
    expect(events.find((e) => e.type === "deleted")!.state.boxes.some((b) => b.id === drawnId)).toBe(false);

    // scene: Step 3's state comes with it
    act(() => tool.onSceneAnswer({ sidewalkWidth: "two_people" }));
    expect(last()).toMatchObject({ type: "scene", value: { sidewalkWidth: "two_people" } });
    expect(last().state.scene.sidewalkWidth).toBe("two_people");

    // presence (S15): Step 1, answered Yes on mounting, with its state
    expect(events[0]).toMatchObject({ type: "presence", id: null, value: true });
    expect(events[0].state.hasSidewalk).toBe(true);

    expect(new Set(types())).toEqual(new Set(["presence", "open", "close", "onSidewalk", "obstructs", "severity", "notAnObject", "restore", "category", "drawn", "deleted", "scene"]));
  });

  it("sends a drawn box fitted again, and a No, with their state", () => {
    const events: PracticeEvent[] = [];
    const tool = mount({ onPracticeEvent: (e) => events.push(e) });
    act(() => tool.selectBoxById(ids.car));
    click(button("on-sidewalk-no"));
    expect(events.find((e) => e.type === "onSidewalk")).toMatchObject({ id: ids.car, value: false });
    expect(events.find((e) => e.type === "onSidewalk")!.state.boxes.find((b) => b.id === ids.car)).toMatchObject({ onSidewalk: false, obstructs: false });
    act(() => tool.selectBoxById(ids.moto));
    click(button("on-sidewalk-yes"));
    click(button("no"));
    expect(events.filter((e) => e.type === "obstructs").pop()).toMatchObject({ id: ids.moto, value: false });
  });

  it("is never called without the prop, and nothing fails", () => {
    const tool = mount();
    press(tool, [centre(ids.tree)]);
    click(button("on-sidewalk-yes"));
    expect(boxIn(tool, ids.tree).onSidewalk).toBe(true);
  });
});

// S15 (9 Nov 2026): no box opens and none is drawn or added until Step 1 is answered
describe("Step 2 waits for Step 1", () => {
  const FIRST = "First, answer Step 1: is there a sidewalk?";

  it("opens no box from the photo or the lists, draws none and adds none, with the message, until Step 1 is answered", () => {
    const tool = mount({ answerStep1: false });
    expect(tool.state.hasSidewalk).toBeNull();
    press(tool, [centre(ids.tree)]);
    expect(tool.selectedId).toBeNull();
    expect(tool.state.showInput).toBe(false);
    expect(tool.state.error).toBe(FIRST);
    act(() => tool.setState({ error: null }));
    press(tool, [EMPTY, [EMPTY[0] + 40, EMPTY[1] + 40]]);
    expect(drawnBoxes(tool)).toEqual([]);
    expect(tool.state.error).toBe(FIRST);
    act(() => tool.addBoxFromButton());
    expect(drawnBoxes(tool)).toEqual([]);
    act(() => tool.selectBoxById(ids.tree));
    expect(tool.selectedId).toBeNull();
    const chip = Array.from(host.querySelectorAll("#box-review-section button")).find((b) => /^Tree/.test(b.textContent?.trim() ?? "")) as HTMLButtonElement;
    act(() => tool.setState({ error: null }));
    click(chip);
    expect(tool.selectedId).toBeNull();
    expect(tool.state.error).toBe(FIRST);
    // Step 1 answered: the message goes, and the tree opens
    click(host.querySelector<HTMLButtonElement>("[data-presence-option='true']"));
    expect(tool.state.hasSidewalk).toBe(true);
    expect(tool.state.error).toBeNull();
    press(tool, [centre(ids.tree)]);
    expect(tool.selectedId).toBe(ids.tree);
  });

  it("brings Step 1 into view on a laptop", () => {
    const tool = mount({ answerStep1: false });
    const section = host.querySelector("#sidewalk-presence-section") as HTMLElement;
    const scroll = vi.fn();
    section.scrollIntoView = scroll;
    press(tool, [centre(ids.tree)]);
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
  });

  it("allows only Yes at Step 1 under a lock that says so, and the tool refuses No too", () => {
    const tool = mount({ answerStep1: false, practiceLock: { openable: [], canDraw: false, canSubmit: false, allowAnswers: {}, allowPresence: true } });
    const no = host.querySelector<HTMLButtonElement>("[data-presence-option='false']")!;
    expect(no.disabled).toBe(true);
    act(() => (tool as unknown as { onPresenceAnswer(v: boolean): void }).onPresenceAnswer(false));
    expect(tool.state.hasSidewalk).toBeNull();
    click(host.querySelector<HTMLButtonElement>("[data-presence-option='true']"));
    expect(tool.state.hasSidewalk).toBe(true);
  });
});

describe("practiceLock", () => {
  const TREE_ONLY: PracticeLock = { openable: [ids.tree], canDraw: false, canSubmit: false, allowAnswers: { onSidewalk: true } };

  it("keeps every other box shut, from the photo and from the lists", () => {
    const tool = mount({ practiceLock: TREE_ONLY });
    press(tool, [centre(ids.car)]);
    expect(tool.selectedId).toBeNull();
    expect(tool.state.showInput).toBe(false);
    act(() => tool.selectBoxById(ids.moto));
    expect(tool.selectedId).toBeNull();
    // The car's name in the list under the photo
    const chip = Array.from(host.querySelectorAll("#box-review-section button")).find((b) => /^Car/.test(b.textContent?.trim() ?? "")) as HTMLButtonElement;
    click(chip);
    expect(tool.selectedId).toBeNull();
    // The tree opens
    press(tool, [centre(ids.tree)]);
    expect(tool.selectedId).toBe(ids.tree);
    expect(tool.state.showInput).toBe(true);
  });

  it("draws nothing before drawing is allowed, and a press on empty photo still closes the panel", () => {
    const tool = mount({ practiceLock: TREE_ONLY });
    press(tool, [centre(ids.tree)]);
    expect(tool.state.showInput).toBe(true);
    press(tool, [EMPTY, [EMPTY[0] + 40, EMPTY[1] + 40]]);
    expect(drawnBoxes(tool)).toEqual([]);
    expect(tool.selectedId).toBeNull();
    expect(tool.state.showInput).toBe(false);
    act(() => tool.addBoxFromButton());
    expect(drawnBoxes(tool)).toEqual([]);
    // Allowed: the box is drawn and its panel opens, though no box is openable by id
    render({ practiceLock: { openable: [], canDraw: true, allowAnswers: {} } });
    press(tool, [[428, 96], [450, 216]]);
    expect(drawnBoxes(tool)).toHaveLength(1);
    expect(tool.selectedId).toBe(drawnBoxes(tool)[0].id);
    expect(tool.state.showInput).toBe(true);
  });

  it("disables the answer not allowed, and the tool refuses it too", () => {
    const tool = mount({ practiceLock: TREE_ONLY });
    act(() => tool.selectBoxById(ids.tree));
    expect(button("on-sidewalk-yes")!.disabled).toBe(false);
    expect(button("on-sidewalk-no")!.disabled).toBe(true);
    expect(buttonByText("Not an object")!.disabled).toBe(true);
    act(() => tool.onSetOnSidewalk(false));
    act(() => tool.onMarkNotAnObject());
    expect(boxIn(tool, ids.tree).onSidewalk).toBeUndefined();
    expect(boxIn(tool, ids.tree).comment).toBe("tree");
    // Question 2 is the contributor's own: both enabled, and the model's line shows
    click(button("on-sidewalk-yes"));
    expect(button("yes")!.disabled).toBe(false);
    expect(button("no")!.disabled).toBe(false);
    expect(host.querySelector("[data-proposal-hint]")?.textContent).toBe("The model thinks this obstructs the sidewalk.");
  });

  it("directs No for the car, with Yes disabled", () => {
    const tool = mount({ practiceLock: { openable: [ids.car], canDraw: false, canSubmit: false, allowAnswers: { onSidewalk: false } } });
    act(() => tool.selectBoxById(ids.car));
    expect(button("on-sidewalk-yes")!.disabled).toBe(true);
    expect(button("on-sidewalk-no")!.disabled).toBe(false);
    click(button("on-sidewalk-yes"));
    expect(boxIn(tool, ids.car).onSidewalk).toBeUndefined();
    click(button("on-sidewalk-no"));
    expect(boxIn(tool, ids.car).onSidewalk).toBe(false);
  });

  it("keeps Next Image for the step that allows it", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const tool = mount({ practiceLock: TREE_ONLY });
    await act(async () => {
      await tool.submit();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(tool.state.error).toBeNull();
    // Allowed: the tool goes on to check the image, which says what is missing
    render({ practiceLock: { ...OPEN, canSubmit: true } });
    await act(async () => {
      await tool.submit();
    });
    expect(tool.state.error).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

/**
 * Hiding a box in the practice (13 Nov 2026, a bug Rans found): the practice
 * darkens all but the photo, and the dark layer takes the clicks. A box hidden
 * from its panel's eye lost its outline and could not be pressed, and Show
 * all and the list's eyes were under the dark layer, so the step waiting on
 * that box could never be done. In the practice no box can be hidden: the
 * eyes and Hide all are not offered, the tool refuses a hide, and a box hidden
 * before the practice began comes back when it does.
 */
describe("hiding boxes in the practice", () => {
  const TREE_ONLY: PracticeLock = { openable: [ids.tree], canDraw: false, canSubmit: false, allowAnswers: { onSidewalk: true } };
  const HIDE = "Hide this box on the photo";
  type Hider = Tool & { isBoxHidden(id: string): boolean; hideOpenBox(): void; toggleBoxHidden(id: string): void; hideAllBoxes(): void; state: Tool["state"] & { hiddenBoxIds: string[] } };
  const hideButtons = () => Array.from(host.querySelectorAll("button")).filter((b) => [b.title, b.getAttribute("aria-label") ?? "", b.textContent?.trim() ?? ""].some((t) => /^Hide\b/.test(t)));

  it("offers no eye on the open box's panel, no eyes on the list and no Hide all", () => {
    const tool = mount({ practiceLock: TREE_ONLY });
    act(() => tool.selectBoxById(ids.tree));
    expect(tool.state.showInput).toBe(true);
    expect(host.querySelector(`.rp-selected-input button[title='${HIDE}']`)).toBeNull();
    expect(buttonByText("Hide all")).toBeUndefined();
    expect(hideButtons()).toEqual([]);
  });

  it("keeps the step's box on the photo and openable, whatever hide is asked for", () => {
    const tool = mount({ practiceLock: TREE_ONLY }) as Hider;
    act(() => tool.selectBoxById(ids.tree));
    act(() => tool.hideOpenBox());
    act(() => tool.toggleBoxHidden(ids.tree));
    act(() => tool.hideAllBoxes());
    expect(tool.state.hiddenBoxIds).toEqual([]);
    expect(tool.isBoxHidden(ids.tree)).toBe(false);
    // Closed and pressed again on the photo, it opens: the step can be done
    press(tool, [EMPTY]);
    expect(tool.selectedId).toBeNull();
    press(tool, [centre(ids.tree)]);
    expect(tool.selectedId).toBe(ids.tree);
    expect(tool.state.showInput).toBe(true);
  });

  it("shows again a box hidden before the practice began", () => {
    const tool = mount({}) as Hider;
    act(() => tool.selectBoxById(ids.tree));
    click(host.querySelector<HTMLButtonElement>(`.rp-selected-input button[title='${HIDE}']`));
    expect(tool.isBoxHidden(ids.tree)).toBe(true);
    render({ practiceLock: TREE_ONLY });
    expect(tool.state.hiddenBoxIds).toEqual([]);
    expect(tool.isBoxHidden(ids.tree)).toBe(false);
    press(tool, [centre(ids.tree)]);
    expect(tool.selectedId).toBe(ids.tree);
  });

  it("offers no Hide on the open box in the sheet either", () => {
    const tool = mount({ practiceLock: TREE_ONLY, layout: "sheet" });
    act(() => tool.selectBoxById(ids.tree));
    expect(tool.selectedId).toBe(ids.tree);
    expect(hideButtons()).toEqual([]);
  });

  it("still lets a box be hidden and shown again outside the practice", () => {
    const tool = mount({}) as Hider;
    act(() => tool.selectBoxById(ids.tree));
    click(host.querySelector<HTMLButtonElement>(`.rp-selected-input button[title='${HIDE}']`));
    expect(tool.isBoxHidden(ids.tree)).toBe(true);
    expect(buttonByText("Show all")).toBeTruthy();
    click(buttonByText("Show all"));
    expect(tool.isBoxHidden(ids.tree)).toBe(false);
    expect(buttonByText("Hide all")).toBeTruthy();
  });
});

describe("without the practice's props, nothing changes", () => {
  // The one difference a lock makes in a panel: no eye to hide the box (13 Nov 2026)
  const EYE = /<button[^>]*title="Hide this box on the photo"[^>]*>[\s\S]*?<\/button>/;
  const withoutEye = (html: string | undefined) => html?.replace(EYE, "");
  /** The same answers as the S12 panel tests: the tree Yes, Yes, severity; the car No */
  function run(props: Props) {
    const tool = mount(props);
    const panels: string[] = [];
    press(tool, [centre(ids.tree)]);
    panels.push(host.querySelector(".rp-selected-input")!.innerHTML);
    click(button("on-sidewalk-yes"));
    panels.push(host.querySelector(".rp-selected-input")!.innerHTML);
    click(button("yes"));
    panels.push(host.querySelector(".rp-selected-input")!.innerHTML);
    click(button("confirm"));
    act(() => tool.selectBoxById(ids.car));
    panels.push(host.querySelector(".rp-selected-input")!.innerHTML);
    click(button("on-sidewalk-no"));
    press(tool, [[428, 96], [450, 216]]);
    const result = {
      panels,
      boxes: tool.shapes.map((s) => {
        const { id, comment, onSidewalk, obstructs, severity, editable } = s.getAnnotationData();
        return { id: editable ? "drawn" : id, comment, onSidewalk, obstructs, severity };
      }),
      highlights: host.querySelectorAll("[data-practice-highlight]").length,
    };
    act(() => root?.unmount());
    host.remove();
    return result;
  }

  it("gives a contributor the same panels and answers with no lock and with a lock that allows everything, but for the eye", () => {
    const without = run({});
    const withOpen = run({ practiceLock: OPEN });
    expect(EYE.test(without.panels[0])).toBe(true);
    expect(withOpen.panels.some((html) => EYE.test(html))).toBe(false);
    expect({ ...withOpen, panels: withOpen.panels.map(withoutEye) }).toEqual({ ...without, panels: without.panels.map(withoutEye) });
    expect(without.highlights).toBe(0);
    expect(without.boxes.find((b) => b.id === ids.tree)).toMatchObject({ onSidewalk: true, obstructs: true, severity: 3 });
  });

  it("gives an annotator the same panel with no lock and with an open one, but for the eye", () => {
    const panel = (props: Props) => {
      const tool = mount({ isAnnotator: true, ...props });
      act(() => tool.selectBoxById(ids.tree));
      const html = host.querySelector(".rp-selected-input")?.innerHTML;
      act(() => root?.unmount());
      host.remove();
      return html;
    };
    const without = panel({});
    expect(without).toBeTruthy();
    expect(EYE.test(without!)).toBe(true);
    expect(panel({ practiceLock: OPEN })).toBe(withoutEye(without));
  });
});

describe("practiceHighlight", () => {
  it("outlines a box where it is on the photo, and a rectangle in image px", () => {
    mount({ practiceHighlight: { boxId: ids.tree } });
    const outline = host.querySelector(`[data-practice-highlight='${ids.tree}']`) as HTMLElement;
    expect(outline).toBeTruthy();
    const m = markOf(ids.tree);
    // 4 px outside the box, at scale 1
    expect(outline.style.left).toBe(`${m.x - 4}px`);
    expect(outline.style.top).toBe(`${m.y - 4}px`);
    expect(outline.style.width).toBe(`${m.width + 8}px`);
    expect(outline.closest(".rp-stage")).toBeTruthy();
    expect(outline.parentElement!.className).toMatch(/pointer-events-none/);

    render({ practiceHighlight: { rect: { x: 428, y: 96, width: 22, height: 120 } } });
    const rect = host.querySelector("[data-practice-highlight='rect']") as HTMLElement;
    expect(rect.style.left).toBe("424px");
    expect(rect.style.height).toBe("128px");
    // Dashed: no box there yet. A box's outline is solid.
    expect(rect.className).toMatch(/border-dashed/);
    expect(outline.className).not.toMatch(/border-dashed/);
  });

  it("outlines two boxes at once, and pulses only where motion is allowed", () => {
    mount({ practiceHighlight: { boxIds: [ids.moto, ids.lamp] } });
    const outlines = host.querySelectorAll("[data-practice-highlight]");
    expect(outlines).toHaveLength(2);
    for (const outline of Array.from(outlines)) {
      expect(outline.className).toMatch(/motion-safe:animate-practice-pulse\b/);
      expect(outline.className).not.toMatch(/(^|\s)animate-/);
    }
    // A press elsewhere: the pulse from the start again, a new element, still pulsing (8 Nov 2026: for as long as it shows)
    const before = host.querySelector("[data-practice-highlight]");
    render({ practiceHighlight: { boxIds: [ids.moto, ids.lamp], pulse: 1 } });
    const after = host.querySelector("[data-practice-highlight]")!;
    expect(after).not.toBe(before);
    expect(after.className).toMatch(/motion-safe:animate-practice-pulse\b/);
  });

  it("marks the open box for the card with nothing drawn", () => {
    mount({ practiceHighlight: { avoidBoxIds: [ids.tree] } });
    expect(host.querySelector("[data-practice-highlight]")).toBeNull();
    const mark = host.querySelector(`[data-practice-avoid='avoid:${ids.tree}']`) as HTMLElement;
    expect(mark).toBeTruthy();
    expect(mark.className).not.toMatch(/border/);
    expect(mark.style.left).toBe(`${markOf(ids.tree).x - 4}px`);
  });

  it("marks the photo the practice lights up, with the outlines inside it", () => {
    mount({ practiceHighlight: { boxId: ids.tree } });
    const photo = host.querySelector("[data-photo-area]");
    expect(photo).toBeTruthy();
    expect(photo!.contains(host.querySelector("[data-practice-highlight]"))).toBe(true);
    expect(photo!.querySelector("canvas.rp-shapes")).toBeTruthy();
  });

  it("lets presses through to the photo", () => {
    const tool = mount({ practiceHighlight: { boxId: ids.tree } });
    press(tool, [centre(ids.tree)]);
    expect(tool.selectedId).toBe(ids.tree);
  });

  // S22 (9 Nov 2026): while the new box is dragged out only it is on the
  // photo, and the white post's outline, which is not a box, stays
  it("keeps the white post's outline while a box is dragged out over it, with every other box hidden", () => {
    const tool = mount({ practiceLock: { openable: [], canDraw: true, allowAnswers: {} }, practiceHighlight: { rect: DRAW_TARGET } });
    const hidden = (id: string) => (tool as unknown as { isBoxHidden(id: string): boolean }).isBoxHidden(id);
    const outline = () => host.querySelector("[data-practice-highlight='rect']") as HTMLElement | null;
    act(() => {
      tool.onMouseDown(at(DRAW_TARGET.x, DRAW_TARGET.y));
      tool.onMouseMove(at(DRAW_TARGET.x + DRAW_TARGET.width, DRAW_TARGET.y + DRAW_TARGET.height));
    });
    const drawn = drawnBoxes(tool);
    expect(drawn).toHaveLength(1);
    expect(hidden(drawn[0].id)).toBe(false);
    for (const id of [ids.tree, ids.car, ids.moto, ids.lamp]) expect(hidden(id)).toBe(true);
    expect(outline()).toBeTruthy();
    expect(outline()!.style.display).not.toBe("none");
    expect(outline()!.style.left).toBe(`${DRAW_TARGET.x - 4}px`);
    act(() => tool.onMouseUp());
    expect(tool.selectedId).toBe(drawn[0].id);
    expect(outline()).toBeTruthy();
    expect(outline()!.style.display).not.toBe("none");
  });

  it("draws nothing for a box off the photo", () => {
    const tool = mount({ practiceHighlight: { boxId: ids.car } });
    act(() => tool.selectBoxById(ids.car));
    click(button("on-sidewalk-no"));
    render({ ...lastProps });
    expect(host.querySelector(`[data-practice-highlight='${ids.car}']`)).toBeNull();
  });
});

/**
 * S23 B (12 Nov 2026): on a phone the practice's outlines read as nothing
 * (Rans, testing production). In headless Chrome at five phone sizes they
 * were in the DOM, shown, on top and on their boxes, but 3 px of the brand
 * blue on a small dark photo, with nothing around them dimmed. The practice
 * now darkens the rest of the screen and lights only the outlined thing
 * (practiceSteps.js), which needs the outlines where the boxes are. These
 * check the sheet layout measures them there, zoomed or not, and that the
 * white post's outline stays after Add box.
 */
describe("practiceHighlight on the sheet layout (S23 B)", () => {
  type SheetTool = Tool & { fit: Fit | null; view: View; scaleState: Fit; isBoxHidden(id: string): boolean };
  const STAGE = { width: 390, height: 420 };
  const GAP = 4;

  /** The tool on the phone layout, the photo fitted to a 390 by 420 photo area, at a zoom */
  function mountSheet(props: Props, view: View = { zoom: 1, panX: 0, panY: 0 }) {
    const tool = mount({ layout: "sheet", ...props }) as SheetTool;
    act(() => tool.setState({ sheetStage: STAGE }));
    tool.fit = fitImage(640, 360, STAGE.width, STAGE.height);
    tool.view = view;
    tool.scaleState = applyView(tool.fit!, view);
    // A render reads the outlines' places again, as the tool's repaint does
    render({ ...lastProps });
    return tool;
  }

  /** Where a mark is on the photo area, in CSS px, from the photo's scale and origin alone */
  const onPhotoArea = (tool: SheetTool, m: { x: number; y: number; width: number; height: number }) => ({
    left: tool.scaleState.originX + m.x * tool.scaleState.scale,
    top: tool.scaleState.originY + m.y * tool.scaleState.scale,
    width: m.width * tool.scaleState.scale,
    height: m.height * tool.scaleState.scale,
  });
  const px = (n: number) => `${n}px`;
  const placed = (el: HTMLElement) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) });

  for (const view of [{ zoom: 1, panX: 0, panY: 0 }, { zoom: 2.5, panX: -300, panY: -120 }]) {
    it(`puts a box's outline on the box and the white post's on the post, ${view.zoom === 1 ? "fitted" : "pinch-zoomed"}`, () => {
      const tool = mountSheet({ practiceHighlight: { boxId: ids.tree } }, view);
      const box = host.querySelector(`[data-practice-highlight='${ids.tree}']`) as HTMLElement;
      expect(box).toBeTruthy();
      expect(box.style.display).not.toBe("none");
      const want = onPhotoArea(tool, markOf(ids.tree));
      const got = placed(box);
      expect(got.width).toBeGreaterThan(2 * GAP);
      expect(got.height).toBeGreaterThan(2 * GAP);
      expect(got.left).toBeCloseTo(want.left - GAP, 5);
      expect(got.top).toBeCloseTo(want.top - GAP, 5);
      expect(got.width).toBeCloseTo(want.width + 2 * GAP, 5);
      expect(got.height).toBeCloseTo(want.height + 2 * GAP, 5);
      // Not the laptop's stage scale: on the sheet layout the stage is the photo area itself
      expect(tool.scaleState.scale).not.toBe(1);

      render({ ...lastProps, practiceHighlight: { rect: DRAW_TARGET } });
      const post = host.querySelector("[data-practice-highlight='rect']") as HTMLElement;
      const target = onPhotoArea(tool, DRAW_TARGET);
      expect(placed(post).width).toBeGreaterThan(2 * GAP);
      expect(post.style.left).toBe(px(target.left - GAP));
      expect(post.style.top).toBe(px(target.top - GAP));
      expect(post.style.height).toBe(px(target.height + 2 * GAP));
    });
  }

  it("keeps the white post's outline after Add box, above the new box and with the other boxes hidden", () => {
    const tool = mountSheet({ practiceLock: { openable: [], canDraw: true, allowAnswers: {} }, practiceHighlight: { rect: DRAW_TARGET } });
    act(() => tool.addBoxFromButton());
    const drawn = drawnBoxes(tool);
    expect(drawn).toHaveLength(1);
    expect(tool.selectedId).toBe(drawn[0].id);
    // What the practice then passes on touch (practiceTargets): the post, the new box marked for the card
    render({ ...lastProps, practiceHighlight: { rect: DRAW_TARGET, avoidBoxIds: [drawn[0].id] } });
    const post = host.querySelector("[data-practice-highlight='rect']") as HTMLElement;
    expect(post).toBeTruthy();
    expect(post.style.display).not.toBe("none");
    expect(placed(post).width).toBeGreaterThan(2 * GAP);
    // After the canvases in the stage, so painted above the new box
    const shapes = host.querySelector("canvas.rp-shapes")!;
    expect(shapes.compareDocumentPosition(post) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector(`[data-practice-avoid='avoid:${drawn[0].id}']`)).toBeTruthy();
    // Lit on touch by its mark, which reaches a corner handle's whole touch area
    const mark = host.querySelector(`[data-practice-avoid='avoid:${drawn[0].id}']`) as HTMLElement;
    const box = onPhotoArea(tool, drawn[0].mark);
    expect(placed(mark).left).toBeCloseTo(box.left - TOUCH_HANDLE_HIT_PX, 5);
    expect(placed(mark).width).toBeCloseTo(box.width + 2 * TOUCH_HANDLE_HIT_PX, 5);
    // The focus on the open box (S17 B) hides the other boxes, never the outline
    for (const id of [ids.tree, ids.car, ids.moto, ids.lamp]) expect(tool.isBoxHidden(id), id).toBe(true);
  });

  it("keeps the same 3 px pulsing blue outline as a laptop's, dashed for the post", () => {
    mountSheet({ practiceHighlight: { boxIds: [ids.moto, ids.lamp] } });
    for (const outline of Array.from(host.querySelectorAll("[data-practice-highlight]"))) {
      expect(outline.className).toMatch(/border-\[3px\] border-primary/);
      expect(outline.className).not.toMatch(/shadow-/);
      expect(outline.className).toMatch(/motion-safe:animate-practice-pulse(\s|$)/);
      expect(outline.className).not.toMatch(/border-dashed/);
    }
    render({ ...lastProps, practiceHighlight: { rect: DRAW_TARGET } });
    expect(host.querySelector("[data-practice-highlight='rect']")!.className).toMatch(/border-dashed/);
  });
});
