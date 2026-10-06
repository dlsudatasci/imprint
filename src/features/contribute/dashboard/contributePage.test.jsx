import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ObjectId } from "mongodb";
import { createMockCollection, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/features/layout/contentSkeleton", () => ({ default: () => null }));
vi.mock("./infoSection", () => ({ default: () => <div data-testid="dashboard-info" /> }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import ContributePage, { getServerSideProps } from "@/pages/contribute/index";

const USER_ID = "6ac4cfd8d52b60835699bbc4";

// The login token as it was at sign-up: role "user". An admin has since made
// the account an annotator in the database.
const staleToken = () => ({
  user: { _id: USER_ID, username: "annotator-f", role: "user", hasCompletedTutorial: false },
});

function setupDb(dbUser) {
  getServerSession.mockResolvedValue(staleToken());
  const users = createMockCollection({ findOne: vi.fn().mockResolvedValue(dbUser) });
  connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
}

beforeEach(() => vi.clearAllMocks());

// 6 Oct 2026: _app passes `session` to SessionProvider and not to the page, so
// the dashboard read the token's role and showed the contributor dashboard to
// annotators once the token was refetched
describe("contributor dashboard (/contribute)", () => {
  it("returns the database values as liveUser, apart from the session", async () => {
    setupDb({ _id: new ObjectId(USER_ID), role: "annotator", hasCompletedTutorial: true, totalAnnotations: 4, age: 30 });
    const { props } = await getServerSideProps({ req: {}, res: {} });
    expect(props.liveUser).toEqual({
      role: "annotator", hasCompletedTutorial: true, totalAnnotations: 4, isProfileIncomplete: false,
    });
  });

  it("hides the lower dashboard for an annotator even when the browser's token still says contributor", async () => {
    setupDb({ _id: new ObjectId(USER_ID), role: "annotator", hasCompletedTutorial: true, age: 30 });
    const { props } = await getServerSideProps({ req: {}, res: {} });
    // What _app passes on: everything except `session`
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose, as _app does
    const { session, ...pageProps } = props;
    useSession.mockReturnValue({ data: staleToken(), status: "authenticated" });
    const html = renderToStaticMarkup(<ContributePage {...pageProps} />);
    expect(html).not.toContain("dashboard-info");
    expect(html).toContain("Annotator");
  });

  it("still shows the lower dashboard to contributors", async () => {
    setupDb({ _id: new ObjectId(USER_ID), role: "user", hasCompletedTutorial: true, age: 30 });
    const { props } = await getServerSideProps({ req: {}, res: {} });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose, as _app does
    const { session, ...pageProps } = props;
    useSession.mockReturnValue({ data: staleToken(), status: "authenticated" });
    expect(renderToStaticMarkup(<ContributePage {...pageProps} />)).toContain("dashboard-info");
  });

  it("falls back to the token when the database cannot be read", async () => {
    getServerSession.mockResolvedValue(staleToken());
    connectToDatabase.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { props } = await getServerSideProps({ req: {}, res: {} });
    expect(props.liveUser).toBeNull();
    useSession.mockReturnValue({ data: staleToken(), status: "authenticated" });
    expect(renderToStaticMarkup(<ContributePage liveUser={props.liveUser} />)).toContain("dashboard-info");
  });
});
