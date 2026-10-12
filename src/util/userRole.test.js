import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { isAnnotatorUser } from "./userRole";

/** The role for the annotate and tutorial pages, from the database (9 Oct 2026). */
const session = { user: { _id: "507f1f77bcf86cd799439011" } };

function withRole(role) {
  const findOne = vi.fn().mockResolvedValue(role === undefined ? null : { role });
  connectToDatabase.mockResolvedValue({ db: { collection: vi.fn(() => ({ findOne })) } });
  return findOne;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("isAnnotatorUser", () => {
  it("is true for role annotator, read by the account's id", async () => {
    const findOne = withRole("annotator");
    expect(await isAnnotatorUser(session)).toBe(true);
    expect(String(findOne.mock.calls[0][0]._id)).toBe("507f1f77bcf86cd799439011");
  });

  it("is false for role user and for a missing account", async () => {
    withRole("user");
    expect(await isAnnotatorUser(session)).toBe(false);
    withRole(undefined);
    expect(await isAnnotatorUser(session)).toBe(false);
  });

  it("is false with no session, without asking the database", async () => {
    expect(await isAnnotatorUser(null)).toBe(false);
    expect(await isAnnotatorUser({ user: {} })).toBe(false);
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("is false when the lookup throws", async () => {
    connectToDatabase.mockRejectedValue(new Error("down"));
    expect(await isAnnotatorUser(session)).toBe(false);
  });
});
