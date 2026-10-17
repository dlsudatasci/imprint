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
    expect(accessWord(1)).toBe(answers[0]);
    expect(accessWord("2.4")).toBe("Mostly accessible");
    expect(accessWord(4.6)).toBe("Not accessible");
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
  const finished = { date: "2026-10-16T20:00:00Z", location: "Quezon City", totalImages: 5, imageUrls: ["a.jpg"], chartData: [2, 0, 1], averageScore: "2.4" };

  it("shows obstructions per photo and the Accessible to Me average with its word", () => {
    const html = renderToStaticMarkup(<ul><RecentSessionItem sessionData={finished} /></ul>);
    expect(html).toContain("Oct 17, 2026 · Quezon City");
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
