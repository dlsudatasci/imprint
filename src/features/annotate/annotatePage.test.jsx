// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { writeSession, writeTutorialFlag, readSessionData, readTutorialFlag, readCurrentCount, readReachedCount, writeReachedCount, SESSION_KEYS } from "@/util/sessionCache";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { username: "rans" } } }) }));
vi.mock("next/router", () => ({ default: { reload: vi.fn() } }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/features/layout/contentSkeleton", () => ({ default: () => <p>loading</p> }));
// The picker's and the form's props, for the session started in place (S16)
const seen = vi.hoisted(() => ({ picker: null, form: null }));
vi.mock("@/features/annotate/selection", () => ({
  default: (props) => {
    seen.picker = props;
    return <p>picker</p>;
  },
}));
vi.mock("@/features/annotate/form", () => ({
  default: (props) => {
    seen.form = props;
    const { data, current, tau } = props;
    return <p>photo {data?._id} ({current}){tau === undefined ? "" : ` tau ${tau}`}</p>;
  },
}));
vi.mock("@/features/annotate/done", () => ({ default: () => <p>done</p> }));

import Router from "next/router";
import AnnotatePage from "@/pages/contribute/annotate";

/**
 * The annotate page checks the phone's saved copy of a session against the
 * server's on a cold visit (23 Oct 2026): a phone left overnight held a copy
 * of a session that was no longer the account's, and Next was refused.
 */
const batch = (...ids) => ({ imgRecords: ids.map((_id, i) => ({ _id, imageID: i + 1 })), isAnnotator: true });
let host;
let root;

async function open({ server, navigating = false } = {}) {
  if (navigating) sessionStorage.setItem("isNavigatingImages", "true");
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => server }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AnnotatePage />));
  await act(async () => {});
  return host;
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

describe("the saved copy on a cold visit", () => {
  it("is kept when it is still the account's current session", async () => {
    writeSession({ total: 2, current: 2, data: batch("a", "b") });
    const el = await open({ server: { isExistingSession: true, currentCount: 2, ...batch("a", "b") } });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/annotationGet", expect.objectContaining({ body: "{}" }));
    expect(el.textContent).toBe("photo b (2)");
    expect(Router.reload).not.toHaveBeenCalled();
    expect(readSessionData().imgRecords.map((i) => i._id)).toEqual(["a", "b"]);
  });

  it("is replaced by the account's current session when that is another one", async () => {
    writeSession({ total: 2, current: 2, data: batch("a", "b") });
    await open({ server: { isExistingSession: true, currentCount: 3, ...batch("c", "d", "e") } });
    expect(readSessionData().imgRecords.map((i) => i._id)).toEqual(["c", "d", "e"]);
    expect(readCurrentCount()).toBe(3);
    expect(Router.reload).toHaveBeenCalledTimes(1);
  });

  it("is cleared when the account has no session any more", async () => {
    writeSession({ total: 2, current: 1, data: batch("a", "b") });
    await open({ server: { imgRecords: [], sessionSizes: [10, 25, 50], isAnnotator: true } });
    expect(readSessionData()).toBeNull();
    expect(Router.reload).toHaveBeenCalledTimes(1);
  });

  it("is kept when the server cannot be asked", async () => {
    writeSession({ total: 2, current: 1, data: batch("a", "b") });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    globalThis.fetch = vi.fn(async () => { throw new Error("offline"); });
    await act(async () => root.render(<AnnotatePage />));
    await act(async () => {});
    expect(host.textContent).toBe("photo a (1)");
    expect(readSessionData()).not.toBeNull();
    expect(Router.reload).not.toHaveBeenCalled();
  });

  it("is not checked when moving between images, or on the finished screen", async () => {
    writeSession({ total: 2, current: 2, data: batch("a", "b") });
    await open({ navigating: true, server: {} });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    act(() => root.unmount());
    host.remove();

    writeSession({ total: 2, current: 3, data: batch("a", "b") });
    const el = await open({ server: { imgRecords: [] } });
    expect(el.textContent).toBe("done");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("the tutorial's practice photos", () => {
  it("are never opened as a session: the server is asked, and its session replaces them", async () => {
    writeSession({ total: 3, current: 2, data: { imgRecords: [{ imageID: 1 }, { imageID: 2 }, { imageID: 3 }] } });
    writeTutorialFlag(true);
    const el = await open({ server: { isExistingSession: true, currentCount: 1, ...batch("a", "b") } });
    expect(el.textContent).toBe("photo a (1)");
    expect(readSessionData().imgRecords.map((i) => i._id)).toEqual(["a", "b"]);
    expect(readTutorialFlag()).toBe(false);
  });

  it("are left for the tutorial when there is no session, and the picker shows", async () => {
    writeSession({ total: 3, current: 2, data: { imgRecords: [{ imageID: 1 }] } });
    writeTutorialFlag(true);
    const el = await open({ server: { imgRecords: [], sessionSizes: [10, 25, 50] } });
    expect(el.textContent).toBe("picker");
    expect(readTutorialFlag()).toBe(true);
    expect(readSessionData()).not.toBeNull();
  });
});

// The suggestion threshold τ comes with the batch (S2, 29 Oct 2026)
describe("the batch's suggestion threshold", () => {
  it("is passed to the form from the saved batch", async () => {
    writeSession({ total: 2, current: 1, data: { ...batch("a", "b"), tau: 0.38 } });
    const el = await open({ server: { isExistingSession: true, currentCount: 1, ...batch("a", "b"), tau: 0.38 }, navigating: true });
    expect(el.textContent).toBe("photo a (1) tau 0.38");
  });

  it("is kept in the saved copy when a session is restored from the server", async () => {
    const el = await open({ server: { isExistingSession: true, currentCount: 1, ...batch("a"), tau: 0.43 } });
    expect(readSessionData().tau).toBe(0.43);
    expect(el.textContent).toBe("photo a (1) tau 0.43");
  });
});

// S16 (3 Nov 2026): Start Session shows image 1 without reloading the page
describe("a session started from the picker", () => {
  it("shows the form on image 1 of the served count, with no reload, no second annotationGet and no cold-visit check", async () => {
    window.scrollTo = vi.fn();
    const el = await open({ server: { imgRecords: [], sessionSizes: [5, 10, 20, 40], isAnnotator: false } });
    expect(el.textContent).toBe("picker");
    const asked = globalThis.fetch.mock.calls.length;

    // What the picker does: the cache first, then the batch handed over
    const json = { ...batch("a", "b", "c"), isAnnotator: false, isExistingSession: false, tau: 0.41 };
    writeSession({ total: 3, current: 1, data: json });
    writeTutorialFlag(false);
    await act(async () => seen.picker.onStarted(json));
    await act(async () => {});

    expect(el.textContent).toBe("photo a (1) tau 0.41");
    expect(seen.form).toMatchObject({ current: 1, total: 3, allImages: json.imgRecords, isAnnotator: false });
    expect(Router.reload).not.toHaveBeenCalled();
    // The effect runs again as the page renders, and asks the server nothing
    await act(async () => root.render(<AnnotatePage />));
    expect(globalThis.fetch).toHaveBeenCalledTimes(asked);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(readCurrentCount()).toBe(1);
  });

  it("is offered only on the picker", async () => {
    await open({ server: { imgRecords: [], sessionSizes: [5, 10, 20, 40] } });
    expect(typeof seen.picker.onStarted).toBe("function");
  });
});

// 6 Nov 2026: the progress strip opens any image up to the furthest reached
describe("the furthest image reached", () => {
  it("is passed to the form from the saved copy, after going back", async () => {
    writeSession({ total: 3, current: 1, data: batch("a", "b", "c"), reached: 3 });
    await open({ navigating: true });
    expect(seen.form.current).toBe(1);
    expect(seen.form.reached).toBe(3);
  });

  it("is the image on screen for a copy saved without one", async () => {
    writeSession({ total: 3, current: 2, data: batch("a", "b", "c") });
    window.localStorage.removeItem(SESSION_KEYS.REACHED_KEY);
    await open({ navigating: true });
    expect(seen.form.reached).toBe(2);
  });

  it("comes from the server on a resume with nothing saved", async () => {
    await open({ server: { isExistingSession: true, currentCount: 1, reachedCount: 3, ...batch("a", "b", "c") } });
    expect(seen.form.current).toBe(1);
    expect(seen.form.reached).toBe(3);
    expect(readReachedCount()).toBe(3);
  });

  it("takes a further one the server knows of on a cold visit, from another device", async () => {
    writeSession({ total: 3, current: 1, data: batch("a", "b", "c"), reached: 1 });
    await open({ server: { isExistingSession: true, currentCount: 1, reachedCount: 3, ...batch("a", "b", "c") } });
    expect(readReachedCount()).toBe(3);
    expect(seen.form.reached).toBe(3);
  });

  it("is the first image for a session started from the picker", async () => {
    writeReachedCount(3);
    await open({ server: { imgRecords: [], sessionSizes: [5] } });
    await act(async () => seen.picker.onStarted(batch("x", "y")));
    expect(seen.form.reached).toBe(1);
  });
});
