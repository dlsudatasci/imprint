// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { writeSession, readTotalCount } from "@/util/sessionCache";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/features/layout/contentSkeleton", () => ({ default: () => null }));
vi.mock("./infoSection", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a> }));

import { useSession } from "next-auth/react";
import ContributePage from "@/pages/contribute/index";
import * as copyModule from "./dashboardCopy";
import { DASHBOARD_COPY } from "./dashboardCopy";

/**
 * The dashboard's own buttons (17 Oct 2026, IMPRINT_dashboard_audit.md).
 * Stop Session used to end the session on the first click, and both Stop
 * buttons were a <Button> inside a <button>.
 */
let root;
let host;
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

// What /api/annotationGet says is active; every other call answers {}
function serverSession(body) {
  globalThis.fetch = vi.fn(async (url) => ({ ok: true, json: async () => (url === "/api/annotationGet" ? body : {}) }));
}
const user = (extra = {}) => ({ data: { user: { _id: "u1", username: "rans", hasCompletedTutorial: true, ...extra } }, status: "authenticated" });
const button = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

async function mount(session, liveUser) {
  useSession.mockReturnValue(session);
  await act(async () => root.render(<ContributePage liveUser={liveUser} />));
  await act(async () => {});
}

describe("the dashboard's buttons", () => {
  it("asks before stopping a session, and stops only on Yes", async () => {
    writeSession({ total: 10, current: 3, data: { imgRecords: [{ _id: "a" }] } });
    serverSession({ isExistingSession: true, currentCount: 3, imgRecords: [{ _id: "a" }] });
    await mount(user());
    await act(async () => button(DASHBOARD_COPY.stopSession).click());
    expect(globalThis.fetch).not.toHaveBeenCalledWith("/api/annotationAbandon", expect.anything());
    expect(document.body.textContent).toContain(DASHBOARD_COPY.stopDialog.title);

    const reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
    await act(async () => button(DASHBOARD_COPY.stopDialog.confirm).click());
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/annotationAbandon", { method: "POST" });
    expect(readTotalCount()).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  // 27 Oct 2026: finished on a phone, the laptop still said Resume Session until it was pressed
  it("stops offering Resume when the saved session was finished on another device", async () => {
    writeSession({ total: 10, current: 3, data: { imgRecords: [{ _id: "a" }] } });
    serverSession({ imgRecords: [] });
    await mount(user());
    expect(button(DASHBOARD_COPY.stopSession)).toBeUndefined();
    expect(button(DASHBOARD_COPY.annotate)).toBeDefined();
    expect(readTotalCount()).toBeNull();
  });

  it("never puts a button inside a button, and Tab stops once per action", async () => {
    writeSession({ total: 10, current: 3, data: { imgRecords: [] } });
    await mount(user());
    expect(document.querySelector("button button")).toBeNull();
    for (const a of host.querySelectorAll("a")) expect(a.getAttribute("tabindex")).toBe("-1");
  });

  it("offers one filled button and one outlined", async () => {
    await mount(user(), { isProfileIncomplete: false });
    const buttons = [...host.querySelectorAll("button")].map((b) => b.textContent.trim());
    expect(buttons).toEqual([DASHBOARD_COPY.annotate, DASHBOARD_COPY.replayTutorial]);
  });

  // Rans, 17 Oct 2026: the rotating facts are removed entirely
  it("welcomes a new contributor without \"back\", offers the tutorial, and shows no fact", async () => {
    await mount(user({ hasCompletedTutorial: false }));
    const text = host.textContent;
    expect(text).toContain(DASHBOARD_COPY.welcome);
    expect(text).not.toContain(DASHBOARD_COPY.welcomeBack);
    expect(text).toContain(DASHBOARD_COPY.startTutorial);
    expect(text).not.toMatch(/Did you know|fun fact/i);
    expect(copyModule.FACTS).toBeUndefined();
    expect(host.querySelector("[data-dashboard-fact]")).toBeNull();
  });
});
