import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("./LeaderboardView", () => ({ default: () => null }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { getServerSideProps } from "@/pages/contribute/leaderboard";

/**
 * S32 (17 Nov 2026): who may open /contribute/leaderboard. The role is read
 * from the database, since the login token keeps the one from sign-in.
 */
function setup(role, hasSession = true) {
  getServerSession.mockResolvedValue(hasSession ? { user: { _id: "6ac4cfd8d52b60835699bbc4", role: "user" } } : null);
  const users = createMockCollection({ findOne: vi.fn().mockResolvedValue(role === undefined ? {} : { role }) });
  connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
}

beforeEach(() => vi.clearAllMocks());

describe("/contribute/leaderboard", () => {
  it("sends a signed-out visitor to log in", async () => {
    setup("user", false);
    expect(await getServerSideProps({ req: {}, res: {} })).toEqual({ redirect: { destination: "/login", permanent: false } });
  });

  it("sends an annotator back to the dashboard, whatever the login token says", async () => {
    setup("annotator");
    expect(await getServerSideProps({ req: {}, res: {} })).toEqual({ redirect: { destination: "/contribute", permanent: false } });
  });

  it.each([["a contributor", "user"], ["an account with no role", undefined], ["an admin", "admin"]])("opens for %s", async (_, role) => {
    setup(role);
    expect(await getServerSideProps({ req: {}, res: {} })).toEqual({ props: {} });
  });
});
