// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a> }));

import LeaderboardView from "./LeaderboardView";
import { LEADERBOARD_COPY as COPY } from "./leaderboardCopy";

/**
 * S32 (17 Nov 2026): the leaderboard page's content, on a stand-in for
 * GET /api/leaderboard and POST /api/leaderboard/name that keeps the
 * viewer's choice, as the server does.
 */
let root;
let host;
let posts;

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  posts = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

const others = (n) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, name: `Imprint Contributor #${i + 1}`, photos: 100 - i, isYou: false }));

/**
 * The server: `viewer` is { rank, photos, nameChoice } (rank null for no
 * photos yet), or null for an admin. Their name follows their choice.
 */
function server({ viewer = { rank: 2, photos: 40, nameChoice: null }, rows = 3, getFails = false, postFails = false } = {}) {
  const state = viewer ? { ...viewer } : null;
  const board = () => {
    const top = others(rows);
    let you = null;
    if (state) {
      const name = state.nameChoice === "shown" ? "rans" : "Imprint Contributor #77";
      if (state.rank == null) you = { rank: null, photos: 0, nameChoice: state.nameChoice };
      else {
        you = { rank: state.rank, photos: state.photos, name, nameChoice: state.nameChoice };
        if (state.rank <= top.length) top[state.rank - 1] = { rank: state.rank, name, photos: state.photos, isYou: true };
      }
    }
    return { updatedAt: "2026-11-17T00:00:00.000Z", top, you };
  };
  globalThis.fetch = vi.fn(async (url, init) => {
    if (url === "/api/leaderboard/name") {
      posts.push(JSON.parse(init.body));
      if (postFails) return { ok: false, json: async () => ({}) };
      state.nameChoice = posts[posts.length - 1].show ? "shown" : "hidden";
      return { ok: true, json: async () => ({ nameChoice: state.nameChoice }) };
    }
    if (getFails) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => board() };
  });
}

async function mount() {
  await act(async () => { root.render(<LeaderboardView />); });
  await act(async () => {});
}
const dialog = () => document.querySelector('[role="dialog"]');
const button = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);
const click = async (el) => { await act(async () => { el.click(); }); await act(async () => {}); };
const rows = () => [...document.querySelectorAll("ol > li")];
const nameSwitch = () => document.querySelector('input[type="checkbox"]');
const yourRow = () => document.querySelector('[data-leaderboard-row="you"]');

describe("the one-time question", () => {
  it("shows before the board when the contributor has never chosen", async () => {
    server();
    await mount();
    expect(dialog()).not.toBeNull();
    expect(dialog().textContent).toContain(COPY.question.title);
    expect(dialog().textContent).toContain(COPY.question.description);
    expect(rows()).toHaveLength(0);
    expect(posts).toEqual([]);
  });

  it.each(["shown", "hidden"])("does not show once they have chosen (%s)", async (nameChoice) => {
    server({ viewer: { rank: 2, photos: 40, nameChoice } });
    await mount();
    expect(dialog()).toBeNull();
    expect(rows()).toHaveLength(3);
  });

  it("does not show for an admin, who has no place and no switch", async () => {
    server({ viewer: null });
    await mount();
    expect(dialog()).toBeNull();
    expect(rows()).toHaveLength(3);
    expect(nameSwitch()).toBeNull();
    expect(document.querySelector("[data-leaderboard-you]")).toBeNull();
  });

  it("Show my username saves the choice and shows the board with the username", async () => {
    server();
    await mount();
    await click(button(COPY.question.show));
    expect(posts).toEqual([{ show: true }]);
    expect(dialog()).toBeNull();
    expect(rows()).toHaveLength(3);
    expect(yourRow().textContent).toContain("rans");
    expect(nameSwitch().checked).toBe(true);
  });

  it("Keep it hidden saves the choice and shows the board with the number", async () => {
    server();
    await mount();
    await click(button(COPY.question.hide));
    expect(posts).toEqual([{ show: false }]);
    expect(dialog()).toBeNull();
    expect(yourRow().textContent).toContain("Imprint Contributor #77");
    expect(yourRow().textContent).not.toContain("rans");
    expect(nameSwitch().checked).toBe(false);
  });

  it.each([
    ["the close button", () => click(button(COPY.question.close))],
    ["Escape", () => act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); })],
    ["a click outside", () => click(dialog().parentElement)],
  ])("closed with %s, saves nothing and shows the board with them hidden", async (_, close) => {
    server();
    await mount();
    await close();
    expect(posts).toEqual([]);
    expect(dialog()).toBeNull();
    expect(rows()).toHaveLength(3);
    expect(yourRow().textContent).toContain("Imprint Contributor #77");
    expect(nameSwitch().checked).toBe(false);
  });

  it("a click inside it does not close it", async () => {
    server();
    await mount();
    await click(dialog());
    expect(dialog()).not.toBeNull();
  });

  it("shows the board and says so when the choice could not be saved", async () => {
    server({ postFails: true });
    await mount();
    await click(button(COPY.question.show));
    expect(dialog()).toBeNull();
    expect(rows()).toHaveLength(3);
    expect(document.body.textContent).toContain(COPY.nameSaveFailed);
  });
});

describe("the board", () => {
  it("lists rank, name and photos, with the viewer's row marked", async () => {
    server({ viewer: { rank: 2, photos: 40, nameChoice: "shown" } });
    await mount();
    expect(rows().map((r) => r.textContent)).toEqual([
      "#1Imprint Contributor #1100 photos",
      `#2rans${COPY.you}40 photos`,
      "#3Imprint Contributor #398 photos",
    ]);
    expect(document.querySelectorAll('[data-leaderboard-row="you"]')).toHaveLength(1);
    expect(document.querySelector("[data-leaderboard-you]").textContent).toContain("You: #2 with 40 photos");
  });

  it("shows the viewer's own row below the top 20 when they are not in it", async () => {
    server({ viewer: { rank: 31, photos: 4, nameChoice: "hidden" }, rows: 20 });
    await mount();
    expect(rows()).toHaveLength(20);
    expect(rows().some((r) => r.textContent.includes(COPY.you))).toBe(false);
    const own = document.querySelector(`[aria-label="${COPY.yourRowLabel}"]`);
    expect(own.textContent).toBe(`#31Imprint Contributor #77${COPY.you}4 photos`);
    // After the list in the page
    expect(document.querySelector("ol").compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector("[data-leaderboard-you]").textContent).toContain("You: #31 with 4 photos");
  });

  it("has no second row for a viewer in the top 20", async () => {
    server({ viewer: { rank: 20, photos: 81, nameChoice: "hidden" }, rows: 20 });
    await mount();
    expect(document.querySelector(`[aria-label="${COPY.yourRowLabel}"]`)).toBeNull();
    expect(document.querySelectorAll('[data-leaderboard-row="you"]')).toHaveLength(1);
  });

  it("the switch changes the viewer's row", async () => {
    server({ viewer: { rank: 2, photos: 40, nameChoice: "hidden" } });
    await mount();
    expect(yourRow().textContent).toContain("Imprint Contributor #77");
    await click(nameSwitch());
    expect(posts).toEqual([{ show: true }]);
    expect(yourRow().textContent).toContain("rans");
    expect(nameSwitch().checked).toBe(true);
    await click(nameSwitch());
    expect(posts).toEqual([{ show: true }, { show: false }]);
    expect(yourRow().textContent).toContain("Imprint Contributor #77");
    expect(nameSwitch().checked).toBe(false);
  });

  it("keeps the switch where it was and says so when the change could not be saved", async () => {
    server({ viewer: { rank: 2, photos: 40, nameChoice: "hidden" }, postFails: true });
    await mount();
    await click(nameSwitch());
    expect(nameSwitch().checked).toBe(false);
    expect(document.body.textContent).toContain(COPY.nameSaveFailed);
  });

  it("tells a contributor with no photos yet how to join, with the switch and no row", async () => {
    server({ viewer: { rank: null, photos: 0, nameChoice: "hidden" } });
    await mount();
    expect(document.querySelector("[data-leaderboard-you]").textContent).toContain(COPY.noPhotosYet);
    expect(nameSwitch()).not.toBeNull();
    expect(yourRow()).toBeNull();
    expect(rows()).toHaveLength(3);
  });

  it("says so when no one is on it yet", async () => {
    server({ viewer: { rank: null, photos: 0, nameChoice: "hidden" }, rows: 0 });
    await mount();
    expect(document.body.textContent).toContain(COPY.empty);
    expect(document.querySelector("ol")).toBeNull();
  });

  it("says so when it could not be loaded", async () => {
    server({ getFails: true });
    await mount();
    expect(document.body.textContent).toContain(COPY.loadFailed);
    expect(dialog()).toBeNull();
  });

  it("carries the title, one line under it and the switch's words, with no link back to the dashboard", async () => {
    server({ viewer: { rank: 2, photos: 40, nameChoice: "hidden" } });
    await mount();
    expect(document.querySelector("h1").textContent).toBe("Leaderboard");
    expect(document.body.textContent).toContain("Contributors ranked by the photos they have finished.");
    expect(document.body.textContent).not.toMatch(/too quickly|every few minutes|Back to dashboard/);
    expect(document.body.textContent).toContain("Show my username on the leaderboard");
    expect(document.querySelector('a[href="/contribute"]')).toBeNull();
  });
});

// Rans, 17 Nov 2026: a small card under the switch, as the landing page ends
describe("the card under the board", () => {
  const card = () => document.querySelector("[data-leaderboard-nudge]");
  const link = () => card().querySelector("a");

  it("asks whether they are ready to improve their ranking, with Let's Annotate! starting a session", async () => {
    server({ viewer: { rank: 2, photos: 40, nameChoice: "hidden" } });
    await mount();
    expect(card().querySelector("h2").textContent).toBe("Ready to improve your ranking?");
    expect(link().getAttribute("href")).toBe("/contribute/annotate");
    expect(link().textContent).toBe("Let's Annotate!");
    // One Tab stop: the link holds a button
    expect(link().getAttribute("tabindex")).toBe("-1");
    expect(document.querySelectorAll("a")).toHaveLength(1);
  });

  it("comes after the switch, which comes after the board", async () => {
    server({ viewer: { rank: 2, photos: 40, nameChoice: "hidden" } });
    await mount();
    const after = (a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(after(document.querySelector("ol"), nameSwitch())).toBeTruthy();
    expect(after(nameSwitch(), card())).toBeTruthy();
  });

  it("leaves the viewer's place a single line, with no button or switch in it", async () => {
    server({ viewer: { rank: 2, photos: 40, nameChoice: "hidden" } });
    await mount();
    const place = document.querySelector("[data-leaderboard-you]");
    expect(place.textContent).toBe("You: #2 with 40 photos");
    expect(place.querySelector("a, button, input")).toBeNull();
  });

  it("sends someone with no photos yet to the dashboard for their next step", async () => {
    server({ viewer: { rank: null, photos: 0, nameChoice: "hidden" } });
    await mount();
    expect(link().getAttribute("href")).toBe("/contribute");
    expect(link().textContent).toBe(COPY.annotate);
  });

  it("is not shown to an admin", async () => {
    server({ viewer: null });
    await mount();
    expect(card()).toBeNull();
    expect(document.body.textContent).not.toContain(COPY.annotate);
  });

  it("is not shown while the question is open", async () => {
    server();
    await mount();
    expect(card()).toBeNull();
  });
});

describe("the copy", () => {
  const strings = (value) =>
    typeof value === "string" ? [value]
      : typeof value === "function" ? [value(1, 1), value(2, 5)]
        : Object.values(value).flatMap(strings);

  it("has no em dashes and no semicolons", () => {
    for (const text of strings(COPY)) expect(text).not.toMatch(/[—;]/);
  });

  it("says photo for one and photos for more", () => {
    expect(COPY.yourPlace(3, 1)).toBe("You: #3 with 1 photo");
    expect(COPY.yourPlace(1, 12)).toBe("You: #1 with 12 photos");
    expect(COPY.photos(1)).toBe("1 photo");
    expect(COPY.photos(0)).toBe("0 photos");
  });
});
