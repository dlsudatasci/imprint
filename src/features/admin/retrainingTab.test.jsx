// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import AdminDashboard from "@/pages/admin/index";

/**
 * S24 (12 Nov 2026): the Retraining tab shows contributor judgments, the
 * cycles run without the starting model, and the next cycle from those.
 */
const retraining = (extra = {}) => ({
  retrainingCycles: [
    { modelVersion: "v1-xgboost", timestamp: "2026-10-30T00:00:00Z", decisionThreshold: 0.5 },
  ],
  cycleCount: 1,
  versionDistribution: [{ version: "v1-xgboost", count: 1200 }],
  totalImages: 1200,
  contributorJudgments: 766,
  contributorAnnotations: 195,
  contributorAnnotationsOnReference: 26,
  retrainingCyclesRun: 0,
  retrainingIncrement: 2000,
  nextRetrainingAt: 2000,
  judgmentsUntilNext: 1234,
  tau: { value: 0.5, isDefault: true, modelVersion: null },
  ...extra,
});

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
let host;
let root;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

async function openRetrainingTab(data) {
  // The Overview tab opens first: its request never answers, so it stays loading
  vi.stubGlobal("fetch", vi.fn(async (url) => String(url).includes("/api/admin/stats") ? new Promise(() => {}) : ({
    json: async () => (String(url).includes("/api/admin/retraining") ? data : {}),
  })));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AdminDashboard />));
  const tab = [...host.querySelectorAll("button")].find((b) => b.textContent === "Retraining");
  await act(async () => tab.click());
}

/** Each stat card as [label, value, sub], in order. */
function cards() {
  return [...host.querySelectorAll(".space-y-3 > .grid p.text-3xl")].map((value) => {
    const card = value.parentElement;
    return [card.querySelector("p.text-sm")?.textContent, value.textContent, card.querySelector("p.text-xs")?.textContent ?? null];
  });
}

describe("Retraining tab (S24)", () => {
  it("shows the cycles run, the contributor judgments with their annotations, and the judgments to go", async () => {
    await openRetrainingTab(retraining());
    expect(cards()).toEqual([
      ["Retraining Cycles", "0", null],
      ["Total Images", (1200).toLocaleString(), null],
      ["Contributor Judgments", "766", "from 195 contributor annotations"],
      ["Next Cycle At", (2000).toLocaleString(), `${(1234).toLocaleString()} to go`],
    ]);
    expect(host.textContent).not.toContain("Completed Annotations");
  });

  it("says Ready now once the count has reached the next cycle", async () => {
    await openRetrainingTab(retraining({ contributorJudgments: 2050, judgmentsUntilNext: 0 }));
    expect(cards()[3]).toEqual(["Next Cycle At", (2000).toLocaleString(), "Ready now"]);
  });

  it("says one annotation, not annotations, for a single one", async () => {
    await openRetrainingTab(retraining({ contributorJudgments: 3, contributorAnnotations: 1 }));
    expect(cards()[2][2]).toBe("from 1 contributor annotation");
  });

  it("says what is counted and that flagged contributors are removed later, with no em dashes or semicolons", async () => {
    await openRetrainingTab(retraining());
    expect(host.textContent).toContain(
      "Counts the contributor judgments the retraining export would use. Contributors flagged by quality control are removed later, at each cycle, so the number used will be a little lower."
    );
    const cardsText = host.querySelector(".space-y-3 > .grid").parentElement.textContent;
    expect(cardsText).not.toMatch(/[—;]/);
  });
});
