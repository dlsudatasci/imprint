// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { writeSession, writeTutorialFlag, readSessionData, readTutorialFlag } from "@/util/sessionCache";

// One object, as next-auth hands back between renders: a new one each time re-runs the page's effects forever
const sessionValue = { status: "authenticated", update: async () => {} };
vi.mock("next-auth/react", () => ({ useSession: () => sessionValue }));
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

/** 23 Oct 2026: the tutorial wrote its practice photos over a real session's saved copy */
let host;
let root;
async function open() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<TutorialPage />));
  await act(async () => {});
}

beforeEach(() => {
  window.localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
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
    await open();
    expect(Router.replace).not.toHaveBeenCalled();
    expect(readTutorialFlag()).toBe(true);
    expect(readSessionData().imgRecords.length).toBe(3);
    act(() => root.unmount());
    host.remove();

    writeSession({ total: 3, current: 1, data: { imgRecords: [{ imageID: 9 }] } });
    writeTutorialFlag(true);
    await open();
    expect(Router.replace).not.toHaveBeenCalled();
  });
});

// S16b (3 Nov 2026): no beacons on a laptop, the ? button in their place, as on a phone
describe("the tour's ? button on a laptop", () => {
  it("is passed to the form on the desktop layout", async () => {
    await open();
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
    await open();
    // The page looks for the photo's stage every 100 ms before starting the tour
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
    const steps = joyride.props?.steps;
    expect(steps?.length).toBe(6);
    for (const step of steps) {
      expect(typeof step.before, step.title).toBe("function");
      const result = step.before();
      expect(typeof result?.then, step.title).toBe("function");
      await result;
    }
  });
});
