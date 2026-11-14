// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { writeSession, writeTutorialFlag, readSessionData, readTutorialFlag, readCurrentCount, readReachedCount, writeReachedCount } from "@/util/sessionCache";

// One object, as next-auth hands back between renders: a new one each time re-runs the page's effects forever.
// A test swaps it for one with a new `update`, as a session fetched again gives (6 Nov 2026).
const sessionHolder = vi.hoisted(() => ({ value: { status: "authenticated", update: async () => {} } }));
vi.mock("next-auth/react", () => ({ useSession: () => sessionHolder.value }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next/router", () => ({ default: { replace: vi.fn(), reload: vi.fn() } }));
// The tour's props, for its steps (S16b)
const joyride = vi.hoisted(() => ({ props: null }));
vi.mock("react-joyride", () => ({
  Joyride: (props) => {
    joyride.props = props;
    return null;
  },
}));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
// The form's props, for the ? button (S16b)
const seen = vi.hoisted(() => ({ form: null }));
vi.mock("@/features/annotate/form", () => ({
  default: (props) => {
    seen.form = props;
    // The tour starts once the photo's stage is on the page
    return <p className="rp-stage">practice photo</p>;
  },
}));
vi.mock("@/features/layout/contentSkeleton", () => ({ default: () => <p>loading</p> }));
vi.mock("@/hooks/useAnnotateLayout", () => ({ useAnnotateLayout: () => "desktop" }));
vi.mock("@/hooks/useIsPhone", () => ({ useIsPhone: () => false }));
vi.mock("@/ui/annotation-tool/index", () => ({ SHEET_EVENT: "imprint:answer-sheet" }));

import Router from "next/router";
import TutorialPage from "@/pages/contribute/tutorial";
import TUTORIAL_IMAGES from "@/data/tutorialImages";
import DefaultInputSection from "@/ui/annotation-tool/DefaultInputSection";
import { ids } from "@/features/home/howItWorks/demoScript";
import { practiceLockFor, PRACTICE_STEPS } from "@/features/tutorial/practiceSteps";
import { emptySceneLevel } from "@/util/validators/sceneQuestions.mjs";

/** 23 Oct 2026: the tutorial wrote its practice photos over a real session's saved copy */
let host;
let root;
async function open(props = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<TutorialPage {...props} />));
  await act(async () => {});
}
/** Arrives at `current` the way Next Image, Previous and the strip do. Annotators' three photos unless said. */
function arriveAt(current, reached, data = { imgRecords: TUTORIAL_IMAGES }) {
  writeSession({ total: data.imgRecords.length, current, data });
  writeTutorialFlag(true);
  if (reached) writeReachedCount(reached);
  sessionStorage.setItem("isNavigatingImages", "true");
}
// The page looks for the photo's stage every 100 ms before starting the tour or the practice
const stageWait = () => act(async () => new Promise((resolve) => setTimeout(resolve, 250)));

beforeEach(() => {
  window.localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  joyride.props = null;
  seen.form = null;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("the tutorial and a real session's saved copy", () => {
  it("leaves a real session's copy alone and sends the person to the dashboard", async () => {
    const real = { imgRecords: [{ _id: "a", imageID: 1 }], isAnnotator: true };
    writeSession({ total: 1, current: 1, data: real });
    await open();
    expect(Router.replace).toHaveBeenCalledWith("/contribute");
    expect(readSessionData()).toEqual(real);
    expect(readTutorialFlag()).toBe(false);
  });

  it("starts as before when there is no session, or the copy is its own", async () => {
    // A contributor's tutorial is the first photo alone (S30), an annotator's three
    await open();
    expect(Router.replace).not.toHaveBeenCalled();
    expect(readTutorialFlag()).toBe(true);
    expect(readSessionData().imgRecords.length).toBe(1);
    act(() => root.unmount());
    host.remove();
    await open({ isAnnotator: true });
    expect(readSessionData().imgRecords.length).toBe(3);
    act(() => root.unmount());
    host.remove();

    writeSession({ total: 3, current: 1, data: { imgRecords: [{ imageID: 9 }] } });
    writeTutorialFlag(true);
    await open();
    expect(Router.replace).not.toHaveBeenCalled();
  });
});

// S16b (3 Nov 2026): no beacons on a laptop, the ? button in their place, as on a phone.
// An annotator's photos from S30: a contributor's tutorial is the practice photo alone.
describe("the tour's ? button on a laptop", () => {
  it("is passed to the form on the desktop layout", async () => {
    arriveAt(2, 2);
    await open({ isAnnotator: true });
    expect(typeof seen.form.onShowTour).toBe("function");
  });

  it("draws no beacons", async () => {
    await open();
    expect(document.querySelector(".animate-ping")).toBeNull();
  });
});

// S16b (3 Nov 2026): the tour library calls .then on what a step's `before`
// returns, and an undefined one stopped the whole page
describe("the tour's steps", () => {
  it("each give the tour library a promise before they show", async () => {
    // An annotator's tour from the ? button, on the second image. The
    // contributor tour's are checked in a session (sessionTour.test.jsx, S30).
    arriveAt(2, 2);
    await open({ isAnnotator: true });
    await stageWait();
    await act(async () => seen.form.onShowTour());
    const steps = joyride.props?.steps;
    // The Objects tour's four
    expect(steps?.length).toBe(4);
    for (const step of steps) {
      expect(typeof step.before, step.title).toBe("function");
      const result = step.before();
      expect(typeof result?.then, step.title).toBe("function");
      await result;
    }
  });
});

// 6 Nov 2026: going back in the tutorial, and the tab coming back into view.
// An annotator's three photos from S30.
describe("the tutorial's place", () => {
  const PRACTICE = { imgRecords: [{ imageID: "T1", answered: true }, { imageID: "T2", answered: true }, { imageID: "T3" }] };
  const arriveWith = (current, reached) => arriveAt(current, reached, PRACTICE);
  const tourWait = stageWait;

  it("keeps the image and the answers when the session is fetched again, which gives a new update", async () => {
    arriveWith(3, 3);
    await open({ isAnnotator: true });
    expect(seen.form.current).toBe(3);
    // The tab comes back into view: next-auth fetches the session and hands out a new update
    sessionHolder.value = { ...sessionHolder.value, update: async () => {} };
    await act(async () => root.render(<TutorialPage isAnnotator />));
    await act(async () => {});
    expect(seen.form.current).toBe(3);
    expect(readCurrentCount()).toBe(3);
    expect(readSessionData()).toEqual(PRACTICE);
    expect(seen.form.data).toEqual({ imageID: "T3" });
  });

  it("passes the furthest image reached to the form, kept when going back", async () => {
    arriveWith(1, 3);
    await open({ isAnnotator: true });
    expect(seen.form.current).toBe(1);
    expect(seen.form.reached).toBe(3);
    expect(readReachedCount()).toBe(3);
  });

  it("counts the image on screen as reached, never past the last, and starts again at 1", async () => {
    arriveWith(2, 1);
    await open({ isAnnotator: true });
    expect(seen.form.reached).toBe(2);
    act(() => root.unmount());
    host.remove();

    // A fresh start: the furthest is the first image again
    writeReachedCount(3);
    await open({ isAnnotator: true });
    expect(seen.form.current).toBe(1);
    expect(seen.form.reached).toBe(1);
    expect(readReachedCount()).toBe(1);
  });

  // Annotators: contributors practise on a fresh start instead (S19)
  it("runs the tour by itself on a fresh start, not on coming back to the first image", async () => {
    await open({ isAnnotator: true });
    await tourWait();
    expect(joyride.props?.run).toBe(true);
    act(() => root.unmount());
    host.remove();
    joyride.props = null;

    arriveWith(1, 3);
    await open({ isAnnotator: true });
    await tourWait();
    expect(seen.form.current).toBe(1);
    expect(joyride.props).toBeNull();
    // The ? button still runs it
    await act(async () => seen.form.onShowTour());
    expect(joyride.props?.run).toBe(true);
  });
});

// S20 (7 Nov 2026): the laptop's message pill and the tour hint sit in the same place
describe("the tour hint and the message pill", () => {
  const hint = () => Array.from(host.querySelectorAll("[role='status']")).find((el) => /see the tour again/.test(el.textContent));
  // An annotator's tour from the ? button, on the second image (S30: a contributor has no second)
  async function openTour() {
    arriveAt(2, 2);
    await open({ isAnnotator: true });
    await stageWait();
    await act(async () => seen.form.onShowTour());
  }
  async function endTour() {
    await openTour();
    await act(async () => joyride.props.callback({ status: "finished" }));
  }

  it("hides the hint at once when a message shows", async () => {
    await endTour();
    expect(hint()).toBeTruthy();
    await act(async () => seen.form.onDesktopMessage(true));
    expect(hint()).toBeUndefined();
    // Gone for good: the message going does not bring it back
    await act(async () => seen.form.onDesktopMessage(false));
    expect(hint()).toBeUndefined();
  });

  it("does not show the hint while a message shows", async () => {
    await openTour();
    await act(async () => seen.form.onDesktopMessage(true));
    await act(async () => joyride.props.callback({ status: "finished" }));
    expect(hint()).toBeUndefined();
  });
});

// S19 (7 Nov 2026): contributors practise on the first image instead of the tour
describe("the practice on the first image", () => {
  const card = () => document.querySelector("[data-practice-card]");
  const cardText = () => card()?.textContent ?? "";
  const tree = (extra = {}) => ({ id: ids.tree, comment: "tree", editable: false, mark: { x: 471, y: 71, width: 60, height: 159 }, severity: null, ...extra });
  const car = (extra = {}) => ({ id: ids.car, comment: "car", editable: false, mark: { x: 330, y: 173, width: 72, height: 64 }, severity: null, ...extra });
  // Step 1 answered Yes unless a test says otherwise (S15)
  const toolState = ({ treeBox = tree(), carBox = car(), openId = null, hasSidewalk = true } = {}) => ({
    boxes: [treeBox, carBox],
    openId,
    scene: emptySceneLevel(),
    hasSidewalk,
  });
  const send = (state, type = "open") => act(async () => seen.form.onPracticeEvent({ type, id: null, state }));
  const step = () => Number(/Practice (\d+) of 11/.exec(cardText())?.[1]);
  const lockAt = (key) => practiceLockFor(PRACTICE_STEPS.findIndex((s) => s.key === key));
  let realMatchMedia;
  /** Reduced motion: each step moves on at once, without the check mark's half second */
  function reduceMotion() {
    realMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({ matches: /reduced-motion/.test(query), media: query, addEventListener() {}, removeEventListener() {} });
  }
  afterEach(() => {
    if (realMatchMedia !== undefined) window.matchMedia = realMatchMedia;
    realMatchMedia = undefined;
  });
  async function start(props) {
    await open(props);
    await stageWait();
  }
  /** Steps 1 to 4: the tree open, on the path, Yes or No, a severity after a Yes */
  async function throughTheTree(obstructs) {
    await send(toolState({ openId: ids.tree }));
    await send(toolState({ openId: ids.tree, treeBox: tree({ onSidewalk: true }) }), "onSidewalk");
    await send(toolState({ openId: ids.tree, treeBox: tree({ onSidewalk: true, obstructs, selected: obstructs, isRejected: !obstructs }) }), "obstructs");
    if (obstructs) await send(toolState({ treeBox: tree({ onSidewalk: true, obstructs: true, selected: true, severity: 2 }) }), "severity");
  }

  it("starts on a contributor's fresh start, not the tour", async () => {
    await start();
    expect(card()).toBeTruthy();
    // Step 1 first (S15): only its Yes, no box open and no outline
    expect(cardText()).toMatch(/Practice 1 of 11/);
    expect(cardText()).toMatch(/Step 1: this photo has a sidewalk raised on a curb\. Choose Yes\./);
    expect(cardText()).toMatch(/Skip practice/);
    expect(joyride.props).toBeNull();
    expect(seen.form.practiceLock).toBe(lockAt("presence"));
    expect(seen.form.practiceHighlight).toBeNull();
    // Answered Yes: the tree, as before
    await send(toolState(), "presence");
    expect(cardText()).toMatch(/Practice 2 of 11/);
    expect(cardText()).toMatch(/Click the dashed box on the tree\./);
    expect(seen.form.practiceLock).toBe(lockAt("openTree"));
    expect(seen.form.practiceHighlight).toMatchObject({ boxId: ids.tree });
    expect(typeof seen.form.onPracticeEvent).toBe("function");
    // No ? button during the practice, and no Next on the card
    expect(seen.form.onShowTour).toBeUndefined();
    expect(Array.from(card().querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Skip practice"]);
  });

  it("does not start on coming back to the first image", async () => {
    arriveAt(1, 3);
    await start();
    expect(card()).toBeNull();
    expect(seen.form.practiceLock).toBeNull();
    expect(seen.form.onPracticeEvent).toBeUndefined();
    expect(joyride.props).toBeNull();
  });

  // At once from 8 Nov 2026 (Rans: the half second on the old line was a drag), the check mark on the new line
  it("moves on as soon as the step is done, with a check mark for half a second", async () => {
    await start();
    // Step 1 not answered yet: nothing moves on
    await send(toolState({ openId: ids.car, hasSidewalk: null }));
    expect(step()).toBe(1);
    expect(card().querySelector("[data-practice-done]")).toBeNull();
    await send(toolState({ openId: ids.tree }));
    expect(step()).toBe(3);
    expect(cardText()).toMatch(/If it is, choose Yes\./);
    expect(card().querySelector("[data-practice-done]")).toBeTruthy();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(step()).toBe(3);
    expect(card().querySelector("[data-practice-done]")).toBeNull();
    // Pointing at Question 1's Yes now the panel is open, with no outline on the tree
    expect(seen.form.practiceHighlight).toMatchObject({ avoidBoxIds: [ids.tree] });
    expect(seen.form.practiceHighlight.boxId).toBeUndefined();
  });

  it("at step 3 leaves Yes and No to the contributor, and the model's line shows", async () => {
    reduceMotion();
    await start();
    await send(toolState({ openId: ids.tree }));
    await send(toolState({ openId: ids.tree, treeBox: tree({ onSidewalk: true }) }), "onSidewalk");
    expect(step()).toBe(4);
    expect(cardText()).toMatch(/You decide\. The model can be wrong\./);
    // The lock the page hands the tool, on the tree's own panel at Question 2
    const panelHost = document.createElement("div");
    document.body.appendChild(panelHost);
    const panelRoot = createRoot(panelHost);
    const noop = () => {};
    const treeRecord = TUTORIAL_IMAGES[0].annotationList.find((b) => b.id === ids.tree);
    await act(async () => panelRoot.render(
      <DefaultInputSection
        value="tree" onChange={noop} onDelete={noop} onSelectObstruction={noop} onUnselectObstruction={noop}
        onMarkNotAnObject={noop} onSetSeverity={noop} onSetObstructs={noop} onClose={noop} onClearObstruction={noop}
        onRestoreObject={noop} editable={false} selected={false} isRejected={false} onSidewalk
        proposedObstructs={treeRecord.proposedObstructs}
        allowAnswers={seen.form.practiceLock.allowAnswers}
      />
    ));
    expect(panelHost.querySelector("[data-control='yes']").disabled).toBe(false);
    expect(panelHost.querySelector("[data-control='no']").disabled).toBe(false);
    expect(panelHost.querySelector("[data-proposal-hint]").textContent).toBe("The model thinks this obstructs the sidewalk.");
    act(() => panelRoot.unmount());
    panelHost.remove();
  });

  it("goes from a Yes to the severity, and from a No at step 3 straight to step 5", async () => {
    reduceMotion();
    await start();
    await throughTheTree(true);
    expect(step()).toBe(6);
    act(() => root.unmount());
    host.remove();

    await start();
    await send(toolState({ openId: ids.tree }));
    await send(toolState({ openId: ids.tree, treeBox: tree({ onSidewalk: true }) }), "onSidewalk");
    await send(toolState({ openId: ids.tree, treeBox: tree({ onSidewalk: true, obstructs: true, selected: true }) }), "obstructs");
    expect(step()).toBe(5);
    expect(cardText()).toMatch(/Rate how much it blocks you, then Confirm\./);
    act(() => root.unmount());
    host.remove();

    await start();
    await throughTheTree(false);
    expect(step()).toBe(6);
    expect(cardText()).toMatch(/Now for the car\./);
    expect(seen.form.practiceLock).toBe(lockAt("carOff"));
  });

  it("unlocks everything on Skip practice, and says the button at the top does it again", async () => {
    await start();
    await send(toolState({ openId: ids.tree }));
    const skip = Array.from(card().querySelectorAll("button")).find((b) => b.textContent === "Skip practice");
    await act(async () => skip.click());
    expect(card()).toBeNull();
    expect(seen.form.practiceLock).toBeNull();
    expect(seen.form.practiceHighlight).toBeNull();
    expect(seen.form.onPracticeEvent).toBeUndefined();
    expect(joyride.props).toBeNull();
    // The image is still the first, to finish freely
    expect(seen.form.current).toBe(1);
    // The button at the top is Practice on the first image (8 Nov 2026)
    expect(typeof seen.form.onShowTour).toBe("function");
    expect(seen.form.tourButton).toEqual({ label: "Practice", title: "Redo the practice" });
    const hint = Array.from(host.querySelectorAll("[role='status']")).find((el) => /redo the practice/.test(el.textContent));
    expect(hint?.textContent).toBe("Click the Practice button at the top of the page to redo the practice.");
  });

  it("does the practice again from the button on the first image, never the tour, on the image's boxes as they started", async () => {
    reduceMotion();
    await start();
    await throughTheTree(true);
    expect(step()).toBe(6);
    await act(async () => Array.from(card().querySelectorAll("button")).find((b) => b.textContent === "Skip practice").click());
    // What the tool saved: the tree answered on the photo (the tutorial's only one, S30)
    const saved = readSessionData();
    saved.imgRecords[0] = { ...saved.imgRecords[0], annotationList: saved.imgRecords[0].annotationList.map((b) => (b.id === ids.tree ? { ...b, onSidewalk: true, obstructs: true, severity: 2 } : b)), userSceneLevel: { sidewalkWidth: "two_people" } };
    writeSession({ data: saved });
    const formBefore = seen.form;

    await act(async () => seen.form.onShowTour());
    await act(async () => {});
    expect(joyride.props).toBeNull();
    expect(step()).toBe(1);
    expect(cardText()).toMatch(/Step 1: this photo has a sidewalk/);
    // No hint while it runs, and no button
    expect(Array.from(host.querySelectorAll("[role='status']")).some((el) => /redo the practice/.test(el.textContent))).toBe(false);
    expect(seen.form.onShowTour).toBeUndefined();
    // The form back with the photo as it started
    expect(seen.form).not.toBe(formBefore);
    const cached = readSessionData();
    expect(cached.imgRecords).toHaveLength(1);
    expect(cached.imgRecords[0]).toEqual(JSON.parse(JSON.stringify(TUTORIAL_IMAGES[0])));
    expect(cached.imgRecords[0].userSceneLevel).toBeUndefined();
    expect(seen.form.data.annotationList.find((b) => b.id === ids.tree).onSidewalk).toBeUndefined();
    // And it runs as before
    await send(toolState({ openId: ids.tree }));
    expect(step()).toBe(3);
  });

  it("does the practice again from the button on coming back to the first image too", async () => {
    arriveAt(1, 1, { imgRecords: TUTORIAL_IMAGES.slice(0, 1) });
    await start();
    expect(card()).toBeNull();
    expect(seen.form.tourButton).toEqual({ label: "Practice", title: "Redo the practice" });
    await act(async () => seen.form.onShowTour());
    await act(async () => {});
    expect(step()).toBe(1);
    expect(joyride.props).toBeNull();
  });

  it("keeps the tour button on an annotator's photos", async () => {
    await start({ isAnnotator: true });
    expect(seen.form.tourButton).toBeNull();
    act(() => root.unmount());
    host.remove();
    arriveAt(2, 2);
    await start({ isAnnotator: true });
    expect(seen.form.tourButton).toBeNull();
    expect(typeof seen.form.onShowTour).toBe("function");
  });

  it("pulses the target once more on a press anywhere but the card", async () => {
    await start();
    // Past Step 1 (S15), which outlines nothing on the photo
    await send(toolState(), "presence");
    expect(seen.form.practiceHighlight.pulse).toBe(0);
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(seen.form.practiceHighlight.pulse).toBe(1);
    await act(async () => card().dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(seen.form.practiceHighlight.pulse).toBe(1);
    // No message
    expect(cardText()).toMatch(/Click the dashed box on the tree\.$|Skip practice$/);
  });

  it("restarts from step 1 on a reload, with the first image's boxes as at the start", async () => {
    reduceMotion();
    await start();
    await throughTheTree(true);
    expect(step()).toBe(6);
    // What the tool saved of the tree before the reload
    const saved = readSessionData();
    saved.imgRecords[0] = { ...saved.imgRecords[0], annotationList: [{ ...saved.imgRecords[0].annotationList[1], onSidewalk: true, obstructs: true, severity: 2 }] };
    writeSession({ total: 3, current: 1, data: saved });
    act(() => root.unmount());
    host.remove();

    // A reload: no move between images, so a fresh start
    await start();
    expect(step()).toBe(1);
    expect(readSessionData().imgRecords[0].annotationList.map((b) => b.id)).toEqual(TUTORIAL_IMAGES[0].annotationList.map((b) => b.id));
    expect(readSessionData().imgRecords[0].annotationList.find((b) => b.id === ids.tree).onSidewalk).toBeUndefined();
    expect(seen.form.data.imageID).toBe("TUTORIAL-001");
  });

  it("keeps its step when the tab comes back into view", async () => {
    reduceMotion();
    await start();
    await send(toolState({ openId: ids.tree }));
    expect(step()).toBe(3);
    sessionHolder.value = { ...sessionHolder.value, update: async () => {} };
    await act(async () => root.render(<TutorialPage />));
    await stageWait();
    expect(step()).toBe(3);
  });

  // S30 (14 Nov 2026): the practice photo is the whole tutorial
  it("allows Finish Tutorial at its last step only, and finishing completes the tutorial with no photo 2", async () => {
    reduceMotion();
    await start();
    await throughTheTree(true);
    expect(seen.form.practiceLock.canSubmit).toBe(false);
    const post = { id: "drawn-1", comment: "lamp_post", editable: true, mark: { x: 428, y: 96, width: 22, height: 120 }, severity: 4, onSidewalk: true, obstructs: true };
    const answered = (extra = {}) => ({ onSidewalk: false, obstructs: false, isRejected: true, ...extra });
    const done = {
      boxes: [
        tree({ onSidewalk: true, obstructs: true, selected: true, severity: 2 }),
        car(answered()),
        { id: ids.moto, comment: "motorcycle", editable: false, mark: { x: 206, y: 176, width: 25, height: 35 }, onSidewalk: true, obstructs: false, isRejected: true, severity: null },
        { id: ids.lamp, comment: "lamp_post", editable: false, mark: { x: 112, y: 15, width: 69, height: 145 }, ...answered(), severity: null },
        { ...post, comment: "---", onSidewalk: undefined, obstructs: undefined, severity: null },
      ],
      openId: null,
      scene: emptySceneLevel(),
      hasSidewalk: true,
    };
    await send({ ...done, boxes: done.boxes.slice(0, 2) }, "onSidewalk");
    expect(step()).toBe(7);
    await send(done, "drawn");
    expect(step()).toBe(8);
    expect(seen.form.practiceLock.canDraw).toBe(true);
    // The drawn box deleted at step 7: back to step 6
    await send({ ...done, boxes: done.boxes.slice(0, 4) }, "deleted");
    expect(step()).toBe(7);
    const withPost = { ...done, boxes: [...done.boxes.slice(0, 4), post] };
    await send(withPost, "severity");
    expect(step()).toBe(10);
    await send({ ...withPost, scene: { sidewalkWidth: "two_people", overallAccessibility: 5, surfaceEvenness: 3, surfaceType: "concrete", surfaceCondition: 3, roadBarrier: true } }, "scene");
    expect(step()).toBe(11);
    expect(cardText()).toMatch(/All done\. Click Finish Tutorial\./);
    expect(seen.form.practiceLock.canSubmit).toBe(true);
    // The photo's button says so, and the strip and counter count one photo
    expect(seen.form.finishLabel).toBe("Finish Tutorial");
    expect(seen.form.total).toBe(1);
    expect(seen.form.current).toBe(1);
    expect(seen.form.allImages).toHaveLength(1);
    // The reminder of photo 2 went with photo 2: nothing is kept for it
    expect(Object.keys(sessionStorage).filter((k) => /practice/i.test(k))).toEqual([]);
    act(() => root.unmount());
    host.remove();

    // Finish Tutorial: the tool sends the photo (nothing saved) and moves on
    // past it, the tutorial completes once, and the dashboard opens
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const realFetch = window.fetch;
    window.fetch = fetchMock;
    try {
      seen.form = null;
      arriveAt(2, 1, { imgRecords: TUTORIAL_IMAGES.slice(0, 1) });
      await start();
      expect(fetchMock.mock.calls.filter(([url]) => url === "/api/user/completeTutorial")).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/user/completeTutorial", { method: "POST" });
      // No photo 2, no reminder, and the saved copy cleared
      expect(seen.form).toBeNull();
      expect(Array.from(host.querySelectorAll("[role='status']"))).toEqual([]);
      expect(readSessionData()).toBeNull();
    } finally {
      window.fetch = realFetch;
    }
  });

  it("after Skip practice, finishes only through the photo's own Finish Tutorial, with nothing completed before", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const realFetch = window.fetch;
    window.fetch = fetchMock;
    try {
      await start();
      await act(async () => Array.from(card().querySelectorAll("button")).find((b) => b.textContent === "Skip practice").click());
      // Unlocked to answer on their own: the tool's own checks refuse Finish
      // Tutorial while a question is unanswered (ReactPictureAnnotation.finishTutorial.test.tsx)
      expect(seen.form.practiceLock).toBeNull();
      expect(seen.form.finishLabel).toBe("Finish Tutorial");
      expect(seen.form.total).toBe(1);
      expect(fetchMock.mock.calls.some(([url]) => url === "/api/user/completeTutorial")).toBe(false);
      // A reload is the photo again, not the end
      act(() => root.unmount());
      host.remove();
      await start();
      expect(seen.form.current).toBe(1);
      expect(fetchMock.mock.calls.some(([url]) => url === "/api/user/completeTutorial")).toBe(false);
    } finally {
      window.fetch = realFetch;
    }
  });

  // Someone mid-tutorial when S30 is deployed: Next Image or Previous loads a copy saved by the three-photo tutorial
  it("completes a contributor's tutorial once from an old three-photo copy saved past photo 1", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const realFetch = window.fetch;
    window.fetch = fetchMock;
    // Leaving the page is not implemented in jsdom: a stand-in location shows where it goes
    const realLocation = Object.getOwnPropertyDescriptor(window, "location");
    Object.defineProperty(window, "location", { configurable: true, value: { href: "http://localhost/contribute/tutorial", search: "" } });
    try {
      arriveAt(3, 3);
      await start();
      expect(fetchMock.mock.calls.filter(([url]) => url === "/api/user/completeTutorial")).toHaveLength(1);
      expect(window.location.href).toBe("/contribute");
      expect(seen.form).toBeNull();
      expect(readSessionData()).toBeNull();
    } finally {
      window.fetch = realFetch;
      Object.defineProperty(window, "location", realLocation);
    }
  });

  it("shows a contributor's old three-photo copy saved on photo 1 as one photo", async () => {
    arriveAt(1, 3);
    await start();
    expect(seen.form.current).toBe(1);
    expect(seen.form.total).toBe(1);
    expect(seen.form.allImages).toHaveLength(1);
    expect(seen.form.data.imageID).toBe(TUTORIAL_IMAGES[0].imageID);
    expect(seen.form.reached).toBe(1);
    // The saved copy too, which the Practice button reads again
    expect(readSessionData().imgRecords).toHaveLength(1);
    await act(async () => seen.form.onShowTour());
    await act(async () => {});
    expect(seen.form.allImages).toHaveLength(1);
  });

  it("opens an annotator's tour from the ? button on photo 3, which reads Finish Tutorial", async () => {
    arriveAt(3, 3);
    await start({ isAnnotator: true });
    expect(card()).toBeNull();
    expect(joyride.props).toBeNull();
    expect(seen.form.total).toBe(3);
    expect(seen.form.finishLabel).toBe("Finish Tutorial");
    await act(async () => seen.form.onShowTour());
    expect(joyride.props?.run).toBe(true);
    expect(joyride.props.steps).toHaveLength(4);
  });

  it("completes an annotator's tutorial after photo 3, not before", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const realFetch = window.fetch;
    window.fetch = fetchMock;
    try {
      arriveAt(2, 2);
      await start({ isAnnotator: true });
      expect(seen.form.current).toBe(2);
      expect(fetchMock.mock.calls.some(([url]) => url === "/api/user/completeTutorial")).toBe(false);
      act(() => root.unmount());
      host.remove();
      seen.form = null;
      arriveAt(4, 3);
      await start({ isAnnotator: true });
      expect(fetchMock.mock.calls.filter(([url]) => url === "/api/user/completeTutorial")).toHaveLength(1);
      expect(seen.form).toBeNull();
    } finally {
      window.fetch = realFetch;
    }
  });

  it("leaves an annotator's tutorial as it was: the tour starts, no practice", async () => {
    await start({ isAnnotator: true });
    expect(joyride.props?.run).toBe(true);
    expect(seen.form.total).toBe(3);
    expect(seen.form.allImages).toHaveLength(3);
    expect(card()).toBeNull();
    expect(seen.form.practiceLock).toBeNull();
    expect(seen.form.onPracticeEvent).toBeUndefined();
    expect(typeof seen.form.onShowTour).toBe("function");
  });
});
