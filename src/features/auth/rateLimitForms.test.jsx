// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const router = { pathname: "/login", query: {}, isReady: true, push: vi.fn(), replace: vi.fn() };
const signIn = vi.fn();

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null, update: vi.fn() }),
  signIn: (...args) => signIn(...args),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a> }));
// eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in tests
vi.mock("next/image", () => ({ default: ({ alt }) => <img alt={alt} /> }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/ui/InteractiveObstructions", () => ({ default: () => <div data-scene /> }));
vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));

import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import CheckEmail from "@/pages/check-email";
import { AUTH_COPY } from "./authCopy";

/**
 * The forms when the request limit refuses them (S8, 26 Oct 2026): each shows
 * "Too many attempts. Please wait a minute and try again." on a 429, whether
 * the body is the JSON deploy/nginx.conf sends or nginx's own HTML page.
 */
const TOO_MANY = AUTH_COPY.tooManyAttempts;
const NGINX_JSON = JSON.stringify({ message: TOO_MANY, url: "http://localhost/login?error=TooManyAttempts" });
const NGINX_HTML = "<html><head><title>429 Too Many Requests</title></head><body>nginx</body></html>";
const reply = (status, body, type = "application/json") =>
  Promise.resolve(new Response(body, { status, headers: { "Content-Type": type } }));

let root;
let host;
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  vi.clearAllMocks();
  router.query = {};
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function mount(element) {
  await act(async () => root.render(element));
  await act(async () => {});
}

/** Sets a field the way typing does, for controlled and uncontrolled inputs alike. */
function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Submits as a browser does. The login and sign-up forms read their fields as
 * form.username and form["consent-agree"], the named access browsers give a
 * form and jsdom does not, so it is added here from form.elements first.
 */
async function submit(form) {
  for (const el of form.elements) {
    for (const key of [el.name, el.id]) {
      if (key && !(key in form)) Object.defineProperty(form, key, { get: () => form.elements.namedItem(key) });
    }
  }
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => {});
}

const alerts = () => [...host.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim());
const field = (name) => host.querySelector(`input[name="${name}"]`);

describe("log in (S8)", () => {
  async function logIn() {
    await mount(<Login />);
    type(field("username"), "rans_test");
    type(field("password"), "a-password");
    await submit(host.querySelector("form"));
  }

  it("shows the message when the limit refuses the sign-in, without calling it a wrong password", async () => {
    signIn.mockResolvedValue({ error: "TooManyAttempts", status: 429, ok: false, url: null });
    await logIn();
    expect(alerts()).toContain(TOO_MANY);
    expect(host.textContent).not.toContain(AUTH_COPY.login.invalid);
    expect(router.push).not.toHaveBeenCalled();
    // The button is usable again
    expect(host.querySelector('button[type="submit"]').disabled).toBe(false);
  });

  it("still says the password is wrong for a wrong password", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin", status: 401, ok: false, url: null });
    await logIn();
    expect(host.textContent).toContain(AUTH_COPY.login.invalid);
    expect(alerts()).not.toContain(TOO_MANY);
  });

  it("stops waiting and says so when signIn throws (a body it cannot read)", async () => {
    signIn.mockRejectedValue(new SyntaxError("Unexpected token '<'"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await logIn();
    errorSpy.mockRestore();
    expect(alerts()).toContain(AUTH_COPY.login.failed);
    expect(host.querySelector('button[type="submit"]').disabled).toBe(false);
  });

  it("shows the message when NextAuth sends a refused sign-in to /login?error=TooManyAttempts", async () => {
    router.query = { error: "TooManyAttempts" };
    await mount(<Login />);
    expect(alerts()).toContain(TOO_MANY);
  });
});

describe("create account (S8)", () => {
  async function register() {
    await mount(<Register />);
    type(field("username"), "new_person");
    type(field("email"), "new@example.com");
    type(field("password"), "a-long-password");
    type(field("confirmPassword"), "a-long-password");
    host.querySelector("#consent-agree").checked = true;
    host.querySelector("#consent-age").checked = true;
    await submit(host.querySelector("form"));
  }

  for (const [label, body, kind] of [["JSON", NGINX_JSON, "application/json"], ["HTML", NGINX_HTML, "text/html"]]) {
    it(`shows the message on a 429 with nginx's ${label} body, and does not sign in`, async () => {
      globalThis.fetch = vi.fn(() => reply(429, body, kind));
      await register();
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/register", expect.anything());
      expect(host.textContent).toContain(TOO_MANY);
      expect(signIn).not.toHaveBeenCalled();
    });
  }
});

describe("forgot password (S8)", () => {
  it("shows the message on a 429, even as nginx's HTML", async () => {
    globalThis.fetch = vi.fn(() => reply(429, NGINX_HTML, "text/html"));
    await mount(<ForgotPassword />);
    type(host.querySelector('input[type="email"]'), "user@example.com");
    await submit(host.querySelector("form"));
    expect(host.textContent).toContain(TOO_MANY);
    expect(host.textContent).not.toContain("If that email exists");
  });
});

describe("reset password (S8)", () => {
  beforeEach(() => { router.query = { token: "t".repeat(64), email: "user@example.com" }; });

  it("says to wait, not that the link expired, when the link check is refused, and checks again on Try again", async () => {
    globalThis.fetch = vi.fn()
      .mockImplementationOnce(() => reply(429, NGINX_HTML, "text/html"))
      .mockImplementationOnce(() => reply(200, '{"valid":true}'));
    await mount(<ResetPassword />);
    expect(alerts()).toContain(TOO_MANY);
    expect(host.textContent).not.toContain(AUTH_COPY.reset.invalid);

    const again = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === AUTH_COPY.reset.tryAgain);
    await act(async () => again.click());
    await act(async () => {});
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(host.querySelector('input[autocomplete="new-password"]')).not.toBeNull();
  });

  it("shows the message when saving the new password is refused", async () => {
    globalThis.fetch = vi.fn((url) =>
      url === "/api/auth/verify-reset-token" ? reply(200, '{"valid":true}') : reply(429, NGINX_JSON)
    );
    await mount(<ResetPassword />);
    const [first, second] = host.querySelectorAll('input[autocomplete="new-password"]');
    type(first, "a-new-long-password");
    type(second, "a-new-long-password");
    await submit(host.querySelector("form"));
    expect(globalThis.fetch).toHaveBeenLastCalledWith("/api/auth/reset-password", expect.anything());
    expect(host.textContent).toContain(TOO_MANY);
  });
});

describe("check your inbox (S8 with S9)", () => {
  async function resend() {
    await mount(<CheckEmail email="new@example.com" confirmed={false} />);
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === AUTH_COPY.checkEmail.resend);
    await act(async () => button.click());
    await act(async () => {});
  }

  it("shows the limit's message on a 429 from nginx, even as HTML", async () => {
    globalThis.fetch = vi.fn(() => reply(429, NGINX_HTML, "text/html"));
    await resend();
    expect(host.textContent).toContain(TOO_MANY);
    expect(host.textContent).not.toContain(AUTH_COPY.checkEmail.offline);
  });

  it("keeps the app's own five-minute wait message", async () => {
    globalThis.fetch = vi.fn(() => reply(429, '{"message":"You can ask for another link in 4 minutes.","retryAfter":200}'));
    await resend();
    expect(host.textContent).toContain("You can ask for another link in 4 minutes.");
    expect(host.textContent).not.toContain(TOO_MANY);
  });
});
