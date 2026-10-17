// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const router = { pathname: "/about", events: { on: vi.fn(), off: vi.fn() } };
vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next-auth/react", () => ({ useSession: vi.fn(), signOut: vi.fn() }));
vi.mock("@/util/sessionCache", () => ({
  clearSession: vi.fn(),
  readTotalCount: () => null,
  readCurrentCount: () => null,
  readTutorialFlag: () => false,
}));

import { useSession } from "next-auth/react";
import Nav from "./index";
import { NAV_COPY, annotateShortcut, notificationHistory, historyDate, NOTIFICATION_HISTORY_LIMIT } from "./navCopy";

/**
 * The navbar after the public-pages redesign (16 Oct 2026,
 * IMPRINT_public_redesign.md).
 */
let root;
let host;
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
// The user's activity feed, as /api/extractUser returns it
let feed = [];
beforeEach(() => {
  router.pathname = "/about";
  feed = [];
  globalThis.fetch = vi.fn((url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url === "/api/extractUser" ? { annotationCount: 0, userActivities: feed } : { isExistingSession: false }),
  }));
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

function render({ sticky = false, session = null } = {}) {
  useSession.mockReturnValue(session ? { status: "authenticated", data: session } : { status: "unauthenticated", data: null });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Nav sticky={sticky} />));
  return host;
}

const user = (extra = {}) => ({ user: { username: "rans", email: "rans@example.com", hasCompletedTutorial: true, isProfileIncomplete: false, ...extra } });

describe("navbar", () => {
  it("floats as a sticky translucent bar only when asked (the public layout), in the page otherwise", () => {
    const bar = render({ sticky: true }).querySelector("[data-navbar-bar]");
    expect(bar.className).toContain("sticky");
    expect(bar.className).toContain("nav-material");
    act(() => root.unmount());
    host.remove();
    const inPage = render({ sticky: false }).querySelector("[data-navbar-bar]");
    expect(inPage.className).not.toContain("sticky");
    expect(inPage.className).not.toContain("nav-material");
  });

  it("marks the current page with aria-current and no other", () => {
    const el = render();
    const current = [...el.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute("href"));
    // Once in the bar and once in the phone menu
    expect(new Set(current)).toEqual(new Set(["/about"]));
  });

  it("offers Volunteer to visitors, but not on the login and register pages", () => {
    expect(render().textContent).toContain(NAV_COPY.volunteer);
    act(() => root.unmount());
    host.remove();
    router.pathname = "/login";
    expect(render().textContent).not.toContain(NAV_COPY.volunteer);
  });

  it("shows the profile reminder only while the profile is unfinished, and No new notifications otherwise", () => {
    let el = render({ session: user() });
    expect(el.querySelector("#nav-notifications").textContent).toContain(NAV_COPY.noNotifications);
    expect(el.querySelector("[data-notification-dot]")).toBeNull();
    act(() => root.unmount());
    host.remove();
    el = render({ session: user({ isProfileIncomplete: true }) });
    expect(el.querySelector("[data-notification-dot]")).not.toBeNull();
    expect(el.querySelector('#nav-notifications a[href="/complete-profile"]').textContent).toContain(NAV_COPY.profileTitle);
  });

  it("lists the user's own last three activities under Earlier, read once when the tray first opens", async () => {
    feed = [
      { activity: "Registered to Imprint", tag: "register", date: "2026-10-01T02:00:00Z" },
      { activity: "Completed your profile", tag: "profile", date: "2026-10-01T03:00:00Z" },
      { activity: "You finished 10 annotations", tag: "Annotation Session Done", date: "2026-10-05T03:00:00Z" },
      { activity: "Abandoned session (2 annotations finished)", tag: "Session Abandoned", date: "2026-10-07T03:00:00Z" },
    ];
    const el = render({ session: user() });
    expect(el.querySelector("[data-notification-history]")).toBeNull();
    const bell = el.querySelector('[aria-controls="nav-notifications"]');
    await act(async () => { bell.click(); });
    const history = el.querySelector("[data-notification-history]");
    expect(history.textContent).toContain(NAV_COPY.earlier);
    const items = [...history.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("Session stopped");
    expect(items[0]).toContain("2 annotations finished");
    expect(items[1]).toContain("Session finished");
    expect(items[2]).toContain("Profile completed");
    expect(history.textContent).not.toContain("Welcome to Imprint!");
    // Once only: closing and opening again does not ask again
    await act(async () => { bell.click(); });
    await act(async () => { bell.click(); });
    expect(globalThis.fetch.mock.calls.filter(([u]) => u === "/api/extractUser")).toHaveLength(1);
  });

  it("opens the phone menu from its button, keeps it inert while closed, and closes it on Escape", () => {
    const el = render();
    const toggle = el.querySelector('[aria-controls="nav-mobile"]');
    const panel = el.querySelector("#nav-mobile");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(true);
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(false);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes its menus when the page changes", () => {
    render();
    const [event, handler] = router.events.on.mock.calls[0];
    expect(event).toBe("routeChangeStart");
    expect(typeof handler).toBe("function");
  });

  it("says Log out, not Logout", () => {
    const el = render({ session: user() });
    expect(el.textContent).toContain("Log out");
    expect(el.textContent).not.toContain("Logout");
  });
});

describe("notificationHistory", () => {
  it("keeps the newest entries first, at most three by default", () => {
    expect(NOTIFICATION_HISTORY_LIMIT).toBe(3);
    const many = Array.from({ length: 6 }, (_, i) => ({ activity: `You finished ${i} annotations`, tag: "Annotation Session Done", date: `2026-10-0${i + 1}T00:00:00Z` }));
    const out = notificationHistory(many);
    expect(out.map((h) => h.text)).toEqual(["You finished 5 annotations", "You finished 4 annotations", "You finished 3 annotations"]);
  });

  it("words registration and the profile as the old tray did, and skips entries it cannot place", () => {
    const out = notificationHistory([
      { activity: "Registered to Imprint", tag: "register", date: "2026-10-01T00:00:00Z" },
      { activity: "Completed your profile", tag: "profile", date: "2026-10-02T00:00:00Z" },
      { activity: "Something new", tag: "other", date: "2026-09-01T00:00:00Z" },
      { activity: "", tag: "register", date: "2026-10-03T00:00:00Z" },
      { activity: "No date", tag: "register" },
      null,
    ], 10);
    expect(out.map(({ title, text }) => ({ title, text }))).toEqual([
      { title: "Profile completed", text: "You're all set to start mapping." },
      { title: "Welcome to Imprint!", text: "Thanks for joining our community." },
      { title: "Something new", text: "" },
    ]);
    expect(notificationHistory(undefined)).toEqual([]);
  });

  it("dates an entry in Philippine time", () => {
    // 16:30 UTC on 16 Oct is already 17 Oct in Manila
    expect(historyDate(Date.parse("2026-10-16T16:30:00Z"))).toMatch(/17/);
  });
});

describe("annotateShortcut", () => {
  const base = { pathname: "/about", profileIncomplete: false, hasCompletedDemo: true, isTutorialSession: false, hasActiveSession: false };

  it("is hidden until the profile and tutorial are done, and on the pages that already lead into annotating", () => {
    expect(annotateShortcut({ ...base, profileIncomplete: true })).toBeNull();
    expect(annotateShortcut({ ...base, hasCompletedDemo: false })).toBeNull();
    for (const pathname of ["/contribute", "/contribute/annotate", "/contribute/tutorial"]) {
      expect(annotateShortcut({ ...base, pathname })).toBeNull();
    }
  });

  it("resumes the tutorial or the session, or starts one, in the dashboard's words", () => {
    expect(annotateShortcut({ ...base, isTutorialSession: true })).toEqual({ href: "/contribute/tutorial", label: "Resume Tutorial" });
    expect(annotateShortcut({ ...base, hasActiveSession: true })).toEqual({ href: "/contribute/annotate", label: "Resume Session" });
    expect(annotateShortcut(base)).toEqual({ href: "/contribute/annotate", label: "Let's Annotate!" });
  });
});
