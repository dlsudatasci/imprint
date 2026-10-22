// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a> }));

import InfoSection from "./infoSection";
import RecentSessionItem from "./recentSessionItem";
import { DASHBOARD_COPY, accessWord, sessionDate, secondsPerPhoto, labelStart } from "./dashboardCopy";
import { SCENE_QUESTIONS } from "@/features/contribute/help/taskFacts";

/**
 * The contributor dashboard (17 Oct 2026, IMPRINT_dashboard_audit.md).
 */

function strings(value) {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [String(value(2, 10)), String(value(1, "Quezon Bridge"))];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("dashboard copy", () => {
  it("has no em dashes or semicolons, and never calls the sidewalks safe", () => {
    for (const s of strings({ DASHBOARD_COPY })) {
      expect(s).not.toMatch(/[—;]/);
      expect(s).not.toMatch(/\bsafe\b/i);
    }
  });

  it("names a session's average with the Accessible to Me answer nearest it", () => {
    const answers = SCENE_QUESTIONS.find((q) => q.name === "Accessible to Me").answers;
    // 1 Not accessible to 5 Easily accessible from 22 Oct 2026
    expect(accessWord(1)).toBe(answers[0]);
    expect(accessWord(1)).toBe("Not accessible");
    expect(accessWord("3.6")).toBe("Mostly accessible");
    expect(accessWord(4.6)).toBe("Easily accessible");
    expect(accessWord(5)).toBe("Easily accessible");
    for (const v of [0, 6, null, "x"]) expect(accessWord(v)).toBeNull();
  });

  it("dates in Philippine time and rounds the time per photo", () => {
    expect(sessionDate("2026-10-16T20:00:00Z")).toBe("Oct 17, 2026");
    expect(sessionDate("nope")).toBe("");
    expect(secondsPerPhoto("23.41")).toBe(23);
    expect(secondsPerPhoto("0.00")).toBeNull();
  });
});

let root;
let host;
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  root = null;
});

async function mountInfo({ count, sessions = [], stats = { currentStreak: 1, averageTimePerImageSeconds: "23.41" }, failing = [] }) {
  globalThis.fetch = vi.fn(async (url) => {
    if (failing.includes(url)) return { ok: false, status: 500, json: async () => ({ message: "Internal Server Error" }) };
    const body = url === "/api/extractUser" ? { annotationCount: count, userActivities: [] } : url === "/api/telemetryStats" ? stats : { sessions };
    return { ok: true, json: async () => body };
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<InfoSection username="rans" userId="u1" />));
  await act(async () => {});
  return host;
}

describe("the lower dashboard", () => {
  it("counts photos, maps 10 m each, and names the next landmark once", async () => {
    const el = await mountInfo({ count: 40 });
    const text = el.textContent;
    expect(text).toContain("photos annotated");
    expect(text).not.toContain("obstructions annotated");
    expect(text).toContain(DASHBOARD_COPY.distanceLabel);
    expect(text).toContain("400 m");
    expect(text).toContain("47 m more to match the length of Quezon Bridge.");
    expect(text).not.toMatch(/length of the length|safe/);
    // The bar runs from the last landmark passed (Jones Bridge, 115 m) to the next (447 m)
    const bar = el.querySelector('[role="progressbar"]');
    expect(bar.getAttribute("aria-valuenow")).toBe(String(Math.round(((400 - 115) / (447 - 115)) * 100)));
    expect(bar.parentElement.textContent).toContain("Jones Bridge");
    expect(text).toContain("23 s");
  });

  // apple-design pass, 17 Oct 2026
  // Rans, 17 Oct 2026: recent sessions first, the more important of the two
  it("puts the session list before progress, with no solid blue block and no scroll box inside the page", async () => {
    const el = await mountInfo({ count: 40 });
    expect([...el.querySelectorAll("h2")].map((h) => h.textContent)).toEqual([DASHBOARD_COPY.recentTitle, DASHBOARD_COPY.progressTitle]);
    expect(el.innerHTML).not.toMatch(/\bbg-primary rounded-card\b|rounded-card[^"]*\bbg-primary\b/);
    expect(el.innerHTML).not.toMatch(/overflow-y-auto|max-h-\[/);
  });

  it("uses h2 for its headings and says so when there are no sessions yet", async () => {
    const el = await mountInfo({ count: 0 });
    expect(el.querySelectorAll("h2")).toHaveLength(2);
    expect(el.querySelector("h3")).toBeNull();
    expect(el.textContent).toContain(DASHBOARD_COPY.noSessions);
    expect(el.textContent).toContain("Jones Bridge");
  });
});

describe("a recent session", () => {
  const finished = { date: "2026-10-16T20:00:00Z", location: "Quezon City", totalImages: 5, imageUrls: ["a.jpg"], chartData: [2, 0, 1], averageScore: "3.6" };

  it("shows obstructions per photo and the Accessible to Me average with its word", () => {
    const html = renderToStaticMarkup(<ul><RecentSessionItem sessionData={finished} /></ul>);
    expect(html).toContain(">Oct 17, 2026<");
    expect(html).toContain(">Quezon City<");
    expect(html).toContain(DASHBOARD_COPY.chartLabel);
    expect(html).toContain(DASHBOARD_COPY.accessLabel);
    expect(html).toContain("Mostly accessible");
    expect(html).not.toMatch(/Avg Score|Obstruction Density|uppercase/);
    expect(html).toContain('alt=""');
  });

  it("shows an active session's progress and a way back in, without a second Stop", () => {
    const html = renderToStaticMarkup(<ul><RecentSessionItem sessionData={{ isActive: true, date: "2026-10-16T20:00:00Z", location: null, totalImages: 10, currentCount: 3, imageUrls: [] }} /></ul>);
    expect(html).toContain("In progress");
    expect(html).toContain("2 of 10 photos done");
    expect(html).toContain("data-session-progress");
    expect(html).toContain('href="/contribute/annotate"');
    expect(html).not.toContain("Stop Session");
  });
});

// The four small problems found on 17 Oct 2026 (IMPRINT_annotate_design_check.md §4)
describe("the dashboard when something goes wrong or runs long", () => {
  it("says a failed request failed, instead of a blank total, 0 m or \"no sessions yet\"", async () => {
    const el = await mountInfo({ count: 40, failing: ["/api/extractUser", "/api/recentSessions", "/api/telemetryStats"] });
    const text = el.textContent;
    expect(text).toContain(DASHBOARD_COPY.loadFailed);
    expect(text).not.toContain(DASHBOARD_COPY.noSessions);
    expect(text).not.toMatch(/\b0 m\b|0 days/);
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
    const totals = [...el.querySelectorAll("p")].filter((p) => p.textContent === "–");
    expect(totals.length).toBeGreaterThanOrEqual(3);
  });

  it("still shows what did load when only one request fails", async () => {
    const el = await mountInfo({ count: 40, failing: ["/api/recentSessions"] });
    expect(el.textContent).toContain(DASHBOARD_COPY.loadFailed);
    expect(el.textContent).toContain("400 m");
  });

  it("separates thousands in Total contributions", async () => {
    const el = await mountInfo({ count: 1284 });
    expect(el.textContent).toContain("1,284");
  });

  it("starts a landmark's label with a capital", async () => {
    expect(labelStart("the Pasig River")).toBe("The Pasig River");
    expect(labelStart("EDSA")).toBe("EDSA");
    // 500 photos is 5,000 m: past the San Juanico Bridge, toward Roxas Boulevard
    const el = await mountInfo({ count: 500 });
    const labels = el.querySelector('[role="progressbar"]').previousElementSibling.textContent;
    expect(labels).toContain("The San Juanico Bridge");
    expect(el.textContent).toContain("match the length of Roxas Boulevard.");
  });
});

// 22 Oct 2026: the cities named, one column per photo, five thumbnails, five sessions at a time
describe("a recent session, laid out again", () => {
  const row = (extra = {}, props = {}) =>
    renderToStaticMarkup(<ul><RecentSessionItem sessionData={{ date: "2026-10-16T20:00:00Z", location: "Makati, San Juan and 2 more", cities: ["Makati", "San Juan", "Pasig", "Quezon City"], totalImages: 8, imageUrls: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"], chartData: [0, 2, 1, 0, 3, 3, 0, 1], averageScore: "3.6", ...extra }} {...props} /></ul>);

  it("names the cities, with the whole list on hover", () => {
    const html = row();
    expect(html).toContain(">Makati, San Juan and 2 more<");
    expect(html).toContain('title="Makati, San Juan, Pasig, Quezon City"');
    expect(html).not.toContain("Several cities");
  });

  it("charts a compact column per photo, says what it counts, and labels only the tallest", () => {
    const host = document.createElement("div");
    host.innerHTML = row();
    const chart = host.querySelector("[data-session-chart]");
    expect(chart.textContent).toContain(DASHBOARD_COPY.chartLabel);
    expect(chart.querySelector("[data-chart-line]").textContent).toBe("10 in 8 photos");
    // Eight slots, one a photo, 16 px each with a 12 px column, in a plot ten slots wide
    const slots = chart.querySelectorAll("[data-chart-slot]");
    expect(slots).toHaveLength(8);
    expect(slots[0].className).toContain("max-w-4 flex-1");
    expect(slots[0].parentElement.className).toContain("justify-center");
    expect(slots[0].parentElement.parentElement.className).toContain("md:w-40");
    // The tallest in full blue, its count on its cap: the first of the two 3s, and only there
    expect([...slots].map((slot) => slot.querySelector(".bg-primary") !== null)).toEqual([false, false, false, false, true, false, false, false]);
    expect([...chart.querySelectorAll("[data-chart-peak]")].map((p) => p.textContent)).toEqual(["3"]);
    expect(slots[4].querySelector("[data-chart-peak]")).not.toBeNull();
    // The rest lighter, full blue on hover, fading in their count and photo
    expect(slots[1].firstElementChild.className).toContain("bg-primary/45 group-hover:bg-primary");
    const tip = slots[1].querySelector("[data-chart-tip]");
    expect(tip.textContent).toBe("2 obstructionsPhoto 2");
    expect(tip.className).toContain("opacity-0");
    expect(tip.className).toContain("group-hover:opacity-100");
    expect(tip.className).toContain("transition-opacity");
    // A photo with none has no column, but still its count on hover
    expect(slots[0].querySelector(".rounded-t-\\[4px\\]")).toBeNull();
    expect(slots[0].querySelector("[data-chart-tip]").textContent).toBe("0 obstructionsPhoto 1");
    // No Photo 1 to Photo n under it (Rans, 22 Oct 2026)
    expect(chart.querySelector(".justify-between")).toBeNull();
    // The same counts for screen readers
    const cells = [...chart.querySelectorAll("table td")].map((td) => td.textContent);
    expect(cells).toHaveLength(8);
    expect(cells[1]).toBe("2 obstructions");
    expect(chart.querySelector("table th").textContent).toBe("Photo 1");
  });

  it("keeps every count inside the plot: from the left in its first third, from the right in its last, centred between", () => {
    const host = document.createElement("div");
    host.innerHTML = row({ chartData: Array(10).fill(1), totalImages: 10 });
    const aligns = [...host.querySelectorAll("[data-chart-tip]")].map((t) => (t.className.includes("left-0") ? "L" : t.className.includes("right-0") ? "R" : "C")).join("");
    expect(aligns).toBe("LLLCCCCRRR");
    // Three photos sit in the middle slots, so their counts are centred
    host.innerHTML = row({ chartData: [1, 2, 1], totalImages: 3 });
    expect([...host.querySelectorAll("[data-chart-tip]")].every((t) => t.className.includes("-translate-x-1/2"))).toBe(true);
  });

  it("groups photos into ten columns past ten", () => {
    const host = document.createElement("div");
    host.innerHTML = row({ chartData: Array.from({ length: 25 }, (_, i) => (i < 5 ? 2 : 0)), totalImages: 25 });
    const chart = host.querySelector("[data-session-chart]");
    expect(chart.querySelectorAll("[data-chart-slot]")).toHaveLength(10);
    expect(chart.querySelector("[data-chart-line]").textContent).toBe("10 in 25 photos");
    expect(chart.querySelector("[data-chart-tip]").textContent).toBe("4 obstructionsPhotos 1 to 2");
    expect(chart.querySelector("table th").textContent).toBe("Photos 1 to 2");
    expect(chart.querySelector("table td").textContent).toBe("4 obstructions");
  });

  it("says when no photo had an obstruction, with nothing in full blue", () => {
    const host = document.createElement("div");
    host.innerHTML = row({ chartData: [0, 0, 0] });
    const chart = host.querySelector("[data-session-chart]");
    expect(chart.textContent).toContain("None in 3 photos");
    expect(chart.querySelectorAll(".bg-primary")).toHaveLength(0);
    expect(chart.querySelectorAll("[data-chart-peak]")).toHaveLength(0);
  });

  // 22 Oct 2026: 5 is Easily accessible, so the darkest tile is the highest
  it("colours Accessible to me darkest for the most accessible", () => {
    const tile = (averageScore) => {
      const host = document.createElement("div");
      host.innerHTML = row({ averageScore });
      return host.querySelector("[data-access-tile]");
    };
    expect(tile("4.6").className).toContain("bg-primary text-white");
    expect(tile("4.6").closest("[data-session-access]").textContent).toContain("Easily accessible");
    expect(tile("4.6").textContent).toBe("4.6");
    expect(tile("3.0").className).toContain("bg-primary-100");
    expect(tile("1.4").className).toContain("bg-line");
    expect(tile("1.4").closest("[data-session-access]").textContent).toContain("Not accessible");
  });

  // 22 Oct 2026 (Rans): the thumbnails and Accessible to me looked small beside
  // the chart, then the answer word hung below everything else
  it("gives every column a label, a 72 px picture and a caption under it, so they line up", () => {
    const host = document.createElement("div");
    host.innerHTML = row();
    const li = host.querySelector("li");
    const where = li.firstElementChild;
    const chart = host.querySelector("[data-session-chart]");
    const access = host.querySelector("[data-session-access]");
    // The date in the same label box as the other two, the cities under the thumbnails
    expect(where.firstElementChild.className).toBe("md:flex md:h-5 md:items-end");
    // On a phone the cities beside the date; from 768 px under the thumbnails
    expect(where.firstElementChild.textContent).toBe("Oct 17, 2026 · Makati, San Juan and 2 more");
    expect(where.firstElementChild.querySelector("span").className).toBe("md:hidden");
    expect(where.lastElementChild.textContent).toBe("Makati, San Juan and 2 more");
    expect(where.lastElementChild.className).toBe("mt-1 hidden text-xs text-muted md:block");
    expect(where.lastElementChild.getAttribute("title")).toBe("Makati, San Juan, Pasig, Quezon City");
    expect(chart.firstElementChild.className).toBe("flex h-5 items-end justify-center");
    expect(access.firstElementChild.className).toBe("flex h-5 items-end justify-center");
    expect(chart.firstElementChild.textContent).toBe(DASHBOARD_COPY.chartLabel);
    expect(access.firstElementChild.textContent).toBe(DASHBOARD_COPY.accessLabel);
    // The pictures 72 px tall
    // Thumbnails 72 px, in the plot's and the tile's band, on its floor
    expect(where.querySelector("img").parentElement.parentElement.className).toContain("grid-cols-[repeat(5,minmax(0,4.5rem))]");
    expect(where.querySelector("img").parentElement.parentElement.parentElement.className).toBe("mt-2 md:grid md:h-[4.5rem] md:content-end");
    expect(chart.querySelector("[data-chart-slot]").parentElement.parentElement.className).toContain("h-[4.5rem]");
    const tile = access.querySelector("[data-access-tile]");
    expect(tile.className).toContain("h-16 w-16");
    expect(tile.className).toContain("text-xl");
    // On the band's floor, level with the chart's baseline
    expect(tile.parentElement.className).toBe("flex w-full items-end justify-center h-[4.5rem]");
    // A caption under each: the total under the chart, the word under the number
    const total = chart.querySelector("[data-chart-line]");
    expect(total.textContent).toBe("10 in 8 photos");
    expect(chart.lastElementChild).toBe(total);
    expect(total.className).toContain("mt-1 text-center text-xs text-muted");
    expect(tile.parentElement.nextElementSibling.textContent).toBe("Mostly accessible");
    expect(tile.parentElement.nextElementSibling.className).toBe("mt-1 text-center text-xs text-muted");
    // Side by side from 768 px; on a phone Accessible to me beside the chart
    expect(li.className).toContain("md:grid-cols-[minmax(0,1fr)_10rem_8rem]");
    expect(access.parentElement.className).toContain("grid grid-cols-[minmax(7.25rem,10rem)_minmax(6.5rem,1fr)] items-start gap-2");
    expect(access.parentElement.className).toContain("md:contents");
  });

  it("leaves the session in progress as it was, as wide as the chart and the answer either way", () => {
    for (const showAccess of [true, false]) {
      const html = renderToStaticMarkup(<ul><RecentSessionItem showAccess={showAccess} sessionData={{ isActive: true, date: "2026-10-16T20:00:00Z", location: null, totalImages: 10, currentCount: 3, imageUrls: [] }} /></ul>);
      expect(html).toContain("Oct 17, 2026 · In progress");
      expect(html).toContain('class="flex flex-col gap-3 md:pt-7"');
      // 10 rem + the 2 rem gap + 8 rem: one line for its count and Resume Session
      expect(html).toContain("md:grid-cols-[minmax(0,1fr)_20rem]");
      expect(html).not.toContain("md:h-5");
    }
  });

  it("shows five thumbnails from 1024 px and four on a phone or tablet, the +n counting the rest", () => {
    const host = document.createElement("div");
    host.innerHTML = row();
    const imgs = host.querySelectorAll("img");
    expect(imgs).toHaveLength(5);
    expect(imgs[4].parentElement.className).toContain("hidden lg:block");
    const more = [...host.querySelectorAll("div")].filter((d) => /^\+\d+$/.test(d.textContent));
    expect(more.map((d) => [d.textContent, d.className.includes("lg:hidden") ? "phone and tablet" : "laptop"])).toEqual([["+4", "phone and tablet"], ["+3", "laptop"]]);
  });

  // 22 Oct 2026 (Rans): one photo was bigger than each of ten on a phone
  it("gives every thumbnail a slot of one size, however many photos there are", () => {
    const host = document.createElement("div");
    host.innerHTML = row({ imageUrls: ["1.jpg"], totalImages: 1 });
    const slots = host.querySelector("img").parentElement.parentElement;
    expect(slots.className).toBe("grid grid-cols-[repeat(5,minmax(0,4.5rem))] gap-2 lg:grid-cols-[repeat(6,minmax(0,4.5rem))]");
    expect(host.querySelector("img").parentElement.className).toContain("aspect-square w-full");
    expect(host.querySelector("img").parentElement.className).not.toMatch(/flex-1|max-w/);
  });

  it("leaves out Accessible to me when the list has none, and says why when this session has none", () => {
    expect(row({}, { showAccess: false })).not.toContain("data-session-access");
    const none = row({ averageScore: null });
    expect(none).toContain("data-session-access");
    expect(none).toContain(DASHBOARD_COPY.accessNone);
  });
});

describe("five sessions at a time", () => {
  const session = (i, averageScore = null) => ({ id: `s${i}`, date: "2026-10-16T20:00:00Z", location: "Makati", totalImages: 3, imageUrls: [], chartData: [1, 0, 2], averageScore });

  async function mountPaged({ averageScore = null } = {}) {
    const all = Array.from({ length: 12 }, (_, i) => session(i + 1, averageScore));
    globalThis.fetch = vi.fn(async (url) => {
      if (url === "/api/extractUser") return { ok: true, json: async () => ({ annotationCount: 36 }) };
      if (url === "/api/telemetryStats") return { ok: true, json: async () => ({ currentStreak: 1 }) };
      const params = new URLSearchParams(url.split("?")[1] || "");
      const offset = Number(params.get("offset") || 0);
      const limit = Number(params.get("limit") || 5);
      return { ok: true, json: async () => ({ sessions: all.slice(offset, offset + limit), hasMore: offset + limit < all.length }) };
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<InfoSection username="rans" userId="u1" />));
    await act(async () => {});
    return host;
  }
  const rows = () => host.querySelectorAll("li");
  const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);

  it("shows the five newest, then five more with Show more, and back with Show fewer", async () => {
    await mountPaged();
    expect(rows()).toHaveLength(5);
    expect(button(DASHBOARD_COPY.showFewer)).toBeUndefined();
    await act(async () => button(DASHBOARD_COPY.showMore).click());
    await act(async () => {});
    expect(globalThis.fetch).toHaveBeenLastCalledWith("/api/recentSessions?offset=5&limit=5");
    expect(rows()).toHaveLength(10);
    await act(async () => button(DASHBOARD_COPY.showMore).click());
    await act(async () => {});
    expect(rows()).toHaveLength(12);
    // None left: no Show more, and Show fewer goes back to five
    expect(button(DASHBOARD_COPY.showMore)).toBeUndefined();
    await act(async () => button(DASHBOARD_COPY.showFewer).click());
    expect(rows()).toHaveLength(5);
    expect(button(DASHBOARD_COPY.showMore)).toBeDefined();
  });

  it("says so when more could not be loaded, and keeps what is shown", async () => {
    await mountPaged();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await act(async () => button(DASHBOARD_COPY.showMore).click());
    await act(async () => {});
    expect(rows()).toHaveLength(5);
    expect(host.textContent).toContain(DASHBOARD_COPY.moreFailed);
  });

  it("has no Accessible to me column for a list without answers (annotators), and has it when one session has them", async () => {
    await mountPaged();
    expect(host.querySelector("[data-session-access]")).toBeNull();
    act(() => root.unmount());
    host.remove();
    await mountPaged({ averageScore: "2.0" });
    expect(host.querySelectorAll("[data-session-access]")).toHaveLength(5);
  });
});
