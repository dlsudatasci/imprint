// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import AdminDashboard from "@/pages/admin/index";

/** S21 (8 Nov 2026): the Quality tab says how recall is counted and shows each contributor's in-task objects. */
const refData = (contributors) => ({
  contributors,
  referenceImageCount: 2,
  imagesWithGroundTruth: 2,
  answerKey: {
    objects: 4, objectsMostlyObstructing: 1, uncertain: 0, categoryTies: 0, boxesBelowMinimumSize: 0,
    annotatorsPerImage: { min: 3, max: 3 },
  },
  recallRule: "in-task",
});
const contributor = (extra = {}) => ({
  userId: "u1", username: "alice", referenceImagesScored: 2, avgPrecision: 1, avgRecall: 0.5, avgF1: 0.6667,
  avgObstructionAgreement: null, boxesOnUncertainObjects: 0, inTaskObjects: 7, outOfTaskObjects: 2,
  truePositivesOutOfTask: 1, imagesWithoutInTaskObjects: 1, suggestionsWithoutInitialState: 0, ...extra,
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

async function openQualityTab(ref) {
  // The Overview tab opens first: its request never answers, so it stays loading
  vi.stubGlobal("fetch", vi.fn(async (url) => String(url).includes("/api/admin/stats") ? new Promise(() => {}) : ({
    json: async () => (String(url).includes("reference-performance") ? ref
      : String(url).includes("degenerate") ? { flagged: [] }
      : String(url).includes("agreement") ? { pairs: [] }
      : String(url).includes("annotator-reference-progress") ? { annotators: [], referenceImageCount: 2 }
      : {}),
  })));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AdminDashboard />));
  const tab = [...host.querySelectorAll("button")].find((b) => b.textContent === "Quality");
  await act(async () => tab.click());
  return host.querySelector("table");
}

describe("Quality tab, Reference Performance (S21)", () => {
  it("says recall counts only objects within the task, and shows an In-task objects column", async () => {
    const table = await openQualityTab(refData([contributor()]));
    expect(host.textContent).toContain(
      "Recall counts only the reference objects within the contributor's task: those overlapping a suggestion they were shown, and those most annotators said obstruct. Precision counts every box."
    );
    const headers = [...table.querySelectorAll("th")].map((th) => th.textContent);
    expect(headers).toEqual(["Username", "Ref. Images", "In-task objects", "Precision", "Recall", "F1", "Obstruction"]);
    const cells = [...table.querySelectorAll("tbody td")].map((td) => td.textContent);
    expect(cells.slice(0, 6)).toEqual(["alice", "2", "7", "100.0%", "50.0%", "66.7%"]);
    expect(host.textContent).not.toContain("saved without the model's own box");
    expect(host.textContent).not.toMatch(/[—;]/);
  });

  it("says when suggestions saved before S5 were matched by their own box", async () => {
    await openQualityTab(refData([contributor({ suggestionsWithoutInitialState: 3 })]));
    expect(host.textContent).toContain("3 suggestions were saved without the model's own box, so their saved box was used instead.");
  });
});
