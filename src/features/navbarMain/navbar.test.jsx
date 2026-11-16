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
import { NAV_COPY, annotateShortcut, notificationHistory, trayEntries, historyDate, NOTIFICATION_HISTORY_LIMIT } from "./navCopy";
import { isUnreadMessage, hasUnreadMessage } from "@/util/notifications.mjs";

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
    // (The load's own call asks only whether a message is unread, S29)
    expect(globalThis.fetch.mock.calls.filter(([u, init]) => u === "/api/extractUser" && !JSON.parse(init.body).unread)).toHaveLength(1);
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

  // Email verification (S9): written by /api/auth/verify-email
  it("words the email confirmation", () => {
    const out = notificationHistory([{ activity: "Confirmed your email", tag: "email", date: "2026-10-25T00:00:00Z" }]);
    expect(out.map(({ title, text }) => ({ title, text }))).toEqual([
      { title: "Email confirmed", text: "Your email address is confirmed." },
    ]);
  });

  it("dates an entry in Philippine time", () => {
    // 16:30 UTC on 16 Oct is already 17 Oct in Manila
    expect(historyDate(Date.parse("2026-10-16T16:30:00Z"))).toMatch(/17/);
  });
});

/**
 * Messages in the bell (S29, 16 Nov 2026): a campaign email's copy in the
 * feed, `{ tag: "message", title, activity, date, campaign }`, with a dot
 * until the tray is opened.
 */
const SEEN = "2026-11-16T01:00:00Z";
const message = (date, extra = {}) => ({ tag: "message", title: "Your first session is waiting", activity: "Start with 5 photos, about 5 minutes.", date, campaign: "welcome-nudge", ...extra });

describe("ACTIVITY_VIEWS.message, through notificationHistory and trayEntries", () => {
  it("shows a message's title and text, and its text as the title when the title is missing", () => {
    const out = notificationHistory([message("2026-11-16T02:00:00Z"), message("2026-11-15T02:00:00Z", { title: undefined, activity: "No title here." })]);
    expect(out.map(({ title, text }) => ({ title, text }))).toEqual([
      { title: "Your first session is waiting", text: "Start with 5 photos, about 5 minutes." },
      { title: "No title here.", text: "" },
    ]);
  });

  it("puts messages newer than notificationsSeenAt under New and leaves them out of Earlier", () => {
    const feed = [
      { activity: "Registered to Imprint", tag: "register", date: "2026-11-10T00:00:00Z" },
      message("2026-11-14T02:00:00Z", { title: "Old message" }),
      message("2026-11-16T02:00:00Z"),
    ];
    const { unread, earlier } = trayEntries(feed, SEEN);
    expect(unread.map((m) => m.title)).toEqual(["Your first session is waiting"]);
    expect(earlier.map((m) => m.title)).toEqual(["Old message", "Welcome to Imprint!"]);
    // Never seen: every message is new
    expect(trayEntries(feed, null).unread).toHaveLength(2);
  });
});

describe("isUnreadMessage and hasUnreadMessage", () => {
  it("is true only for a message newer than notificationsSeenAt", () => {
    expect(isUnreadMessage(message("2026-11-16T02:00:00Z"), SEEN)).toBe(true);
    expect(isUnreadMessage(message("2026-11-16T00:00:00Z"), SEEN)).toBe(false);
    expect(isUnreadMessage(message(SEEN), SEEN)).toBe(false);
    expect(isUnreadMessage(message("2026-11-16T00:00:00Z"), null)).toBe(true);
    expect(isUnreadMessage({ tag: "register", activity: "x", date: "2026-11-16T02:00:00Z" }, SEEN)).toBe(false);
    expect(isUnreadMessage(message("not a date"), SEEN)).toBe(false);
    expect(hasUnreadMessage([message("2026-11-14T00:00:00Z"), message("2026-11-16T02:00:00Z")], SEEN)).toBe(true);
    expect(hasUnreadMessage([message("2026-11-14T00:00:00Z")], SEEN)).toBe(false);
    expect(hasUnreadMessage(undefined, SEEN)).toBe(false);
  });
});

describe("the bell's dot for messages", () => {
  // The load asks { unread: true }, the tray's first open asks for the feed
  function serve({ unread, activities = [], seenAt = SEEN }) {
    globalThis.fetch = vi.fn((url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : {};
      let data = { isExistingSession: false };
      if (url === "/api/extractUser") data = body.unread ? { hasUnreadMessage: unread } : { userActivities: activities, notificationsSeenAt: seenAt, hasUnreadMessage: unread };
      if (url === "/api/notifications/seen") data = { ok: true };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
    });
  }
  const seenCalls = () => globalThis.fetch.mock.calls.filter(([u]) => u === "/api/notifications/seen");

  it("shows for a message newer than notificationsSeenAt, and not for an older one", async () => {
    serve({ unread: true });
    let el;
    await act(async () => { el = render({ session: user() }); });
    expect(el.querySelector("[data-notification-dot]")).not.toBeNull();
    expect(globalThis.fetch.mock.calls.some(([u, init]) => u === "/api/extractUser" && JSON.parse(init.body).unread === true)).toBe(true);
    act(() => root.unmount());
    host.remove();
    serve({ unread: false });
    await act(async () => { el = render({ session: user() }); });
    expect(el.querySelector("[data-notification-dot]")).toBeNull();
  });

  it("clears at once when the bell opens, lists the message under New, and then calls the seen route", async () => {
    serve({ unread: true, activities: [message("2026-11-16T02:00:00Z"), { activity: "Registered to Imprint", tag: "register", date: "2026-11-10T00:00:00Z" }] });
    let el;
    await act(async () => { el = render({ session: user() }); });
    const bell = el.querySelector('[aria-controls="nav-notifications"]');
    act(() => { bell.click(); });
    expect(el.querySelector("[data-notification-dot]")).toBeNull();
    await act(async () => {});
    const fresh = el.querySelector("[data-notification-new]");
    expect(fresh.textContent).toContain(NAV_COPY.newMessages);
    expect(fresh.textContent).toContain("Your first session is waiting");
    expect(fresh.textContent).toContain("Start with 5 photos, about 5 minutes.");
    expect(el.querySelector("#nav-notifications").textContent).not.toContain(NAV_COPY.noNotifications);
    expect(el.querySelector("[data-notification-history]").textContent).toContain("Welcome to Imprint!");
    expect(el.querySelector("[data-notification-history]").textContent).not.toContain("Your first session is waiting");
    expect(seenCalls()).toHaveLength(1);
    expect(seenCalls()[0][1].method).toBe("POST");
    // The seen route is called after the feed is read, so the tray knew which were new
    const order = globalThis.fetch.mock.calls.map(([u, init]) => (u === "/api/extractUser" ? (JSON.parse(init.body).unread ? "load" : "feed") : u));
    expect(order.indexOf("feed")).toBeLessThan(order.indexOf("/api/notifications/seen"));
  });

  it("does not call the seen route when nothing was unread", async () => {
    serve({ unread: false, activities: [message("2026-11-14T02:00:00Z")] });
    let el;
    await act(async () => { el = render({ session: user() }); });
    await act(async () => { el.querySelector('[aria-controls="nav-notifications"]').click(); });
    expect(seenCalls()).toHaveLength(0);
    expect(el.querySelector("[data-notification-new]")).toBeNull();
    expect(el.querySelector("#nav-notifications").textContent).toContain(NAV_COPY.noNotifications);
  });

  describe("on a phone, in the menu", () => {
    const menuButton = (el) => el.querySelector('[aria-controls="nav-mobile"]');
    const menuPart = (el) => el.querySelector("#nav-mobile [data-menu-notifications]");

    it("shows the dot on the menu button for a message newer than notificationsSeenAt, and not for an older one", async () => {
      serve({ unread: true });
      let el;
      await act(async () => { el = render({ session: user() }); });
      expect(menuButton(el).querySelector("[data-menu-dot]")).not.toBeNull();
      act(() => root.unmount());
      host.remove();
      serve({ unread: false });
      await act(async () => { el = render({ session: user() }); });
      expect(menuButton(el).querySelector("[data-menu-dot]")).toBeNull();
    });

    it("lists the message under New and the rest under Earlier, clears the dot at once, then calls the seen route", async () => {
      serve({ unread: true, activities: [message("2026-11-16T02:00:00Z"), { activity: "Registered to Imprint", tag: "register", date: "2026-11-10T00:00:00Z" }] });
      let el;
      await act(async () => { el = render({ session: user() }); });
      act(() => { menuButton(el).click(); });
      // Closed again, the button's dot stays gone: the message is seen
      expect(menuButton(el).querySelector("[data-menu-dot]")).toBeNull();
      await act(async () => {});
      const part = menuPart(el);
      expect(part.textContent).toContain(NAV_COPY.notifications);
      const fresh = part.querySelector("[data-notification-new]");
      expect(fresh.textContent).toContain(NAV_COPY.newMessages);
      expect(fresh.textContent).toContain("Your first session is waiting");
      const earlier = part.querySelector("[data-notification-history]");
      expect(earlier.textContent).toContain(NAV_COPY.earlier);
      expect(earlier.textContent).toContain("Welcome to Imprint!");
      expect(earlier.textContent).not.toContain("Your first session is waiting");
      expect(part.textContent).not.toContain(NAV_COPY.noNotifications);
      expect(seenCalls()).toHaveLength(1);
      act(() => { menuButton(el).click(); });
      expect(menuButton(el).querySelector("[data-menu-dot]")).toBeNull();
      // The bell's own dot is gone too, and opening the bell after does not read the feed again
      expect(el.querySelector("[data-notification-dot]")).toBeNull();
      await act(async () => { el.querySelector('[aria-controls="nav-notifications"]').click(); });
      expect(globalThis.fetch.mock.calls.filter(([u, init]) => u === "/api/extractUser" && !JSON.parse(init.body).unread)).toHaveLength(1);
      expect(seenCalls()).toHaveLength(1);
    });

    it("says No new notifications and does not call the seen route when nothing was unread", async () => {
      serve({ unread: false, activities: [message("2026-11-14T02:00:00Z")] });
      let el;
      await act(async () => { el = render({ session: user() }); });
      await act(async () => { menuButton(el).click(); });
      expect(menuPart(el).textContent).toContain(NAV_COPY.noNotifications);
      expect(menuPart(el).querySelector("[data-notification-new]")).toBeNull();
      expect(menuPart(el).querySelector("[data-notification-history]").textContent).toContain("Your first session is waiting");
      expect(seenCalls()).toHaveLength(0);
    });

    it("keeps the profile row and the dot for it, with or without a message", async () => {
      serve({ unread: true, activities: [message("2026-11-16T02:00:00Z")] });
      let el;
      await act(async () => { el = render({ session: user({ isProfileIncomplete: true }) }); });
      await act(async () => { menuButton(el).click(); });
      expect(el.querySelector('#nav-mobile a[href="/complete-profile"]').textContent).toContain(NAV_COPY.profileTitle);
      expect(menuPart(el).querySelector("[data-notification-new]").textContent).toContain("Your first session is waiting");
      act(() => { menuButton(el).click(); });
      expect(menuButton(el).querySelector("[data-menu-dot]")).not.toBeNull();
    });

    it("has no Notifications part for a visitor, and reads nothing", async () => {
      serve({ unread: true });
      let el;
      await act(async () => { el = render(); });
      await act(async () => { menuButton(el).click(); });
      expect(menuPart(el)).toBeNull();
      expect(menuButton(el).querySelector("[data-menu-dot]")).toBeNull();
      expect(globalThis.fetch.mock.calls.some(([u]) => u === "/api/extractUser")).toBe(false);
    });
  });

  it("keeps the profile reminder and its dot, with or without a message", async () => {
    serve({ unread: true, activities: [message("2026-11-16T02:00:00Z")] });
    let el;
    await act(async () => { el = render({ session: user({ isProfileIncomplete: true }) }); });
    await act(async () => { el.querySelector('[aria-controls="nav-notifications"]').click(); });
    // The profile still needs doing, so its dot stays after the tray is opened
    expect(el.querySelector("[data-notification-dot]")).not.toBeNull();
    expect(el.querySelector('#nav-notifications a[href="/complete-profile"]').textContent).toContain(NAV_COPY.profileTitle);
    expect(el.querySelector("[data-notification-new]").textContent).toContain("Your first session is waiting");
    expect(el.querySelector("#nav-notifications").textContent).not.toContain(NAV_COPY.noNotifications);
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

  // Email verification (S9): a session cannot start yet, the tutorial can
  it("offers only Resume Tutorial while the email address is not confirmed", () => {
    expect(annotateShortcut({ ...base, needsEmailVerification: true })).toBeNull();
    expect(annotateShortcut({ ...base, needsEmailVerification: true, hasActiveSession: true })).toBeNull();
    expect(annotateShortcut({ ...base, needsEmailVerification: true, isTutorialSession: true })).toEqual({
      href: "/contribute/tutorial", label: "Resume Tutorial",
    });
    expect(annotateShortcut({ ...base, needsEmailVerification: false })).toEqual({ href: "/contribute/annotate", label: "Let's Annotate!" });
  });
});
