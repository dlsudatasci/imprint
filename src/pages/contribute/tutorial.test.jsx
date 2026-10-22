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
vi.mock("react-joyride", () => ({ Joyride: () => null }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/features/annotate/form", () => ({ default: () => <p>practice photo</p> }));
vi.mock("@/features/layout/contentSkeleton", () => ({ default: () => <p>loading</p> }));
vi.mock("@/hooks/useAnnotateLayout", () => ({ useAnnotateLayout: () => "desktop" }));
vi.mock("@/hooks/useIsPhone", () => ({ useIsPhone: () => false }));
vi.mock("@/ui/annotation-tool/index", () => ({ SHEET_EVENT: "imprint:answer-sheet" }));

import Router from "next/router";
import TutorialPage from "./tutorial";

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
