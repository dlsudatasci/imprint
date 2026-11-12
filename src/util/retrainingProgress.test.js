import { describe, it, expect, vi } from "vitest";
import { readRetrainingProgress, retrainingProgress, RETRAINING_INCREMENT, INITIAL_MODEL_VERSION } from "./retrainingProgress.js";
import * as route from "@/pages/api/admin/retraining.js";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

/**
 * S26 (12 Nov 2026): the counting moved out of /api/admin/retraining so the
 * retraining-ready email reads the same numbers. The route's own tests cover
 * the counting rules unchanged.
 */
describe("retrainingProgress module (S26)", () => {
  it("is what the admin route still exports", () => {
    expect(route.RETRAINING_INCREMENT).toBe(RETRAINING_INCREMENT);
    expect(route.INITIAL_MODEL_VERSION).toBe(INITIAL_MODEL_VERSION);
    expect(route.retrainingProgress).toBe(retrainingProgress);
  });

  it("readRetrainingProgress returns the counts and the progress, reading the model versions itself", async () => {
    const box = { id: "b1", label: "car", editable: true, mark: { x: 10, y: 10, width: 200, height: 200 }, obstructs: false };
    const telemetryFind = vi.fn(() => ({ toArray: async () => [{ modelVersion: "v1-xgboost" }, { modelVersion: "v2-xgboost" }] }));
    const db = {
      collection: (name) => ({
        annotations: { find: () => ({ toArray: async () => [{ imageID: 1, source: "contributor", selectedObjectsID: [], newObjects: [box] }] }) },
        Image: { find: () => ({ toArray: async () => [{ imageID: 1, isReference: false, width: 1920, height: 1080 }] }) },
        telemetry_logs: { find: telemetryFind },
      })[name],
    };

    expect(await readRetrainingProgress(db)).toEqual({
      contributorJudgments: 1,
      contributorAnnotations: 1,
      contributorAnnotationsOnReference: 0,
      retrainingCyclesRun: 1,
      retrainingIncrement: 2000,
      nextRetrainingAt: 4000,
      judgmentsUntilNext: 3999,
    });
    expect(telemetryFind.mock.calls[0][0]).toEqual({ event: "MODEL_PREDICTIONS_UPDATED" });
  });
});
