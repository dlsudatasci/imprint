// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ObjectId } from "mongodb";
import { createMockCollection, createMockDb } from "@/test-utils/api-helpers";

const router = { isReady: true, query: {}, replace: vi.fn() };
const update = vi.fn();
let sessionState = { data: null, status: "unauthenticated" };

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ ...sessionState, update }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a> }));
// eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in tests
vi.mock("next/image", () => ({ default: ({ alt }) => <img alt={alt} /> }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import { connectToDatabase } from "@/util/mongodb";
import { getServerSession } from "next-auth/next";
import VerifyEmail from "@/pages/verify-email";
import CheckEmail, { getServerSideProps } from "@/pages/check-email";
import { AUTH_COPY } from "./authCopy";

/**
 * The two email verification pages (S9, decided 21 Oct 2026): /verify-email,
 * which the emailed link opens, and /check-email, "Check your inbox".
 */
const USER_ID = "6ac4cfd8d52b60835699bbc4";
let root;
let host;

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  vi.clearAllMocks();
  router.query = {};
  sessionState = { data: null, status: "unauthenticated" };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const buttons = () => [...host.querySelectorAll("button")].map((b) => b.textContent.trim());
const links = () => [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));

async function mount(element) {
  await act(async () => root.render(element));
  await act(async () => {});
}

describe("/verify-email", () => {
  it("posts the link's token and address once, then says the address is confirmed", async () => {
    router.query = { token: "t0k", email: "new@example.com" };
    globalThis.fetch = vi.fn(async () => answer(200, { message: "Your email address is confirmed.", verified: true }));
    await mount(<VerifyEmail />);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("/api/auth/verify-email");
    expect(JSON.parse(init.body)).toEqual({ token: "t0k", email: "new@example.com" });
    expect(host.textContent).toContain(AUTH_COPY.verify.confirmedTitle);
    expect(host.textContent).toContain(AUTH_COPY.verify.confirmed);
    // Signed out: log in next, and nothing to refresh
    expect(links()).toContain("/login");
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes the sign-in when signed in, and offers the dashboard", async () => {
    router.query = { token: "t0k", email: "new@example.com" };
    sessionState = { data: { user: { needsEmailVerification: true } }, status: "authenticated" };
    globalThis.fetch = vi.fn(async () => answer(200, { verified: true }));
    await mount(<VerifyEmail />);
    expect(update).toHaveBeenCalledWith({ emailVerified: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(links()).toContain("/contribute");
  });

  it("explains an expired link and sends a new one when signed in", async () => {
    router.query = { token: "old", email: "new@example.com" };
    sessionState = { data: { user: {} }, status: "authenticated" };
    globalThis.fetch = vi.fn(async (url) =>
      url === "/api/auth/verify-email"
        ? answer(400, { code: "expired", message: "This link has expired. Links work for 24 hours. Send a new link to try again." })
        : answer(200, { message: "A new link is on its way. Use the newest link, older ones no longer work." })
    );
    await mount(<VerifyEmail />);
    expect(host.textContent).toContain(AUTH_COPY.verify.failedTitle);
    expect(host.textContent).toContain("This link has expired.");
    const resend = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === AUTH_COPY.verify.resend);
    await act(async () => resend.click());
    expect(globalThis.fetch).toHaveBeenLastCalledWith("/api/auth/resend-verification", { method: "POST" });
    expect(host.textContent).toContain("A new link is on its way.");
  });

  it("offers to log in and send a new link when a link is not valid and nobody is signed in", async () => {
    router.query = { token: "wrong", email: "new@example.com" };
    globalThis.fetch = vi.fn(async () => answer(400, { code: "invalid", message: "This link is not valid." }));
    await mount(<VerifyEmail />);
    expect(host.textContent).toContain("This link is not valid.");
    expect(host.textContent).toContain(AUTH_COPY.verify.loginToResend);
    expect(links()).toContain("/login");
    expect(buttons()).toEqual([AUTH_COPY.verify.loginToResend]);
  });

  it("says a reused link was already used, with no resend", async () => {
    router.query = { token: "t0k", email: "new@example.com" };
    globalThis.fetch = vi.fn(async () => answer(409, { code: "used", message: "This link has already been used, and your email address is confirmed." }));
    await mount(<VerifyEmail />);
    expect(host.textContent).toContain(AUTH_COPY.verify.usedTitle);
    expect(host.textContent).toContain("already been used");
    expect(host.textContent).not.toContain(AUTH_COPY.verify.resend);
  });

  it("does not post an incomplete link", async () => {
    router.query = { token: "t0k" };
    globalThis.fetch = vi.fn();
    await mount(<VerifyEmail />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(host.textContent).toContain(AUTH_COPY.verify.missing);
  });
});

describe("/check-email", () => {
  it("names the address, sends a new link and keeps the dashboard and the guide open", async () => {
    sessionState = { data: { user: { needsEmailVerification: true } }, status: "authenticated" };
    globalThis.fetch = vi.fn(async () => answer(429, { message: "You can ask for another link in 4 minutes.", retryAfter: 200 }));
    await mount(<CheckEmail email="new@example.com" confirmed={false} />);
    expect(host.textContent).toContain(AUTH_COPY.checkEmail.title);
    expect(host.textContent).toContain(AUTH_COPY.checkEmail.sentTo("new@example.com"));
    expect(host.textContent).toContain(AUTH_COPY.checkEmail.meanwhile);
    expect(links()).toEqual(expect.arrayContaining(["/contribute", "/contribute/help"]));
    const resend = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === AUTH_COPY.checkEmail.resend);
    await act(async () => resend.click());
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/resend-verification", { method: "POST" });
    expect(host.textContent).toContain("You can ask for another link in 4 minutes.");
    expect(update).not.toHaveBeenCalled();
  });

  it("says when the first link could not be sent", async () => {
    router.query = { unsent: "1" };
    await mount(<CheckEmail email="new@example.com" confirmed={false} />);
    expect(host.textContent).toContain(AUTH_COPY.checkEmail.notSent);
  });

  it("shows a confirmed address and refreshes a sign-in that still says otherwise", async () => {
    sessionState = { data: { user: { needsEmailVerification: true } }, status: "authenticated" };
    await mount(<CheckEmail email="new@example.com" confirmed />);
    expect(host.textContent).toContain(AUTH_COPY.checkEmail.confirmedTitle);
    expect(update).toHaveBeenCalledWith({ emailVerified: true });
    expect(buttons()).not.toContain(AUTH_COPY.checkEmail.resend);
  });
});

describe("/check-email on the server", () => {
  function setupDb(user) {
    getServerSession.mockResolvedValue({ user: { _id: USER_ID, email: "token@example.com" } });
    const users = createMockCollection({ findOne: vi.fn().mockResolvedValue(user) });
    connectToDatabase.mockResolvedValue({ db: createMockDb({ users }) });
    return users;
  }

  it("sends a signed-out visitor to log in", async () => {
    getServerSession.mockResolvedValue(null);
    expect(await getServerSideProps({ req: {}, res: {} })).toEqual({ redirect: { destination: "/login", permanent: false } });
  });

  it("reads the address and whether it is confirmed from the database", async () => {
    const users = setupDb({ _id: new ObjectId(USER_ID), email: "new@example.com", role: "user", emailVerifiedAt: null });
    expect(await getServerSideProps({ req: {}, res: {} })).toEqual({ props: { email: "new@example.com", confirmed: false } });
    expect(users.findOne).toHaveBeenCalledWith({ _id: new ObjectId(USER_ID) }, { projection: { email: 1, role: 1, emailVerifiedAt: 1 } });

    setupDb({ _id: new ObjectId(USER_ID), email: "new@example.com", role: "user", emailVerifiedAt: new Date() });
    expect(await getServerSideProps({ req: {}, res: {} })).toEqual({ props: { email: "new@example.com", confirmed: true } });
  });

  it("sends annotators and admins, who are never held back, to the dashboard", async () => {
    for (const role of ["annotator", "admin"]) {
      setupDb({ _id: new ObjectId(USER_ID), email: "a@example.com", role, emailVerifiedAt: null });
      expect(await getServerSideProps({ req: {}, res: {} })).toEqual({ redirect: { destination: "/contribute", permanent: false } });
    }
  });

  it("sends a Google sign-in with no account yet to the dashboard's onboarding", async () => {
    getServerSession.mockResolvedValue({ user: { email: "g@example.com", isNewGoogleUser: true } });
    expect(await getServerSideProps({ req: {}, res: {} })).toEqual({ redirect: { destination: "/contribute", permanent: false } });
  });

  it("still works from the sign-in when the database cannot be read", async () => {
    getServerSession.mockResolvedValue({ user: { _id: USER_ID, email: "token@example.com" } });
    connectToDatabase.mockRejectedValue(new Error("down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getServerSideProps({ req: {}, res: {} })).toEqual({ props: { email: "token@example.com", confirmed: false } });
    errorSpy.mockRestore();
  });
});
