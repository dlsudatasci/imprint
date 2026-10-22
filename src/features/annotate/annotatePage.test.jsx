// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { writeSession, writeTutorialFlag, readSessionData, readTutorialFlag, readCurrentCount } from "@/util/sessionCache";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { username: "rans" } } }) }));
vi.mock("next/router", () => ({ default: { reload: vi.fn() } }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/features/layout/contentSkeleton", () => ({ default: () => <p>loading</p> }));
vi.mock("@/features/annotate/selection", () => ({ default: () => <p>picker</p> }));
vi.mock("@/features/annotate/form", () => ({ default: ({ data, current }) => <p>photo {data?._id} ({current})</p> }));
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
