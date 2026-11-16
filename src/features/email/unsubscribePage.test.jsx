// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a> }));
// eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in tests
vi.mock("next/image", () => ({ default: ({ alt }) => <img alt={alt} /> }));
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div>{children}</div> }));

import Unsubscribe, { getServerSideProps } from "@/pages/unsubscribe";
import { UNSUBSCRIBE_COPY as COPY } from "./unsubscribeCopy";
import { unsubscribeToken } from "@/util/emailLinks.mjs";

/** The /unsubscribe page (S29, 16 Nov 2026), opened from the stop link in a campaign email. */
const SECRET = "test-secret";
const U = "aaaaaaaaaaaaaaaaaaaaaaaa";
const T = unsubscribeToken(U, SECRET);
let root;
let host;

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", SECRET);
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const buttons = () => [...host.querySelectorAll("button")];
const button = (label) => buttons().find((b) => b.textContent.trim() === label);

async function mount(props) {
  await act(async () => root.render(<Unsubscribe {...props} />));
  await act(async () => {});
}

describe("/unsubscribe, on the server", () => {
  it("passes a valid link's pair to the page", async () => {
    expect(await getServerSideProps({ query: { u: U, t: T } })).toEqual({ props: { valid: true, u: U, t: T } });
  });

  it("marks a bad link invalid and passes nothing of it", async () => {
    for (const query of [{}, { u: U }, { u: U, t: "0".repeat(64) }, { u: "bbbbbbbbbbbbbbbbbbbbbbbb", t: T }, { u: [U], t: T }]) {
      expect(await getServerSideProps({ query })).toEqual({ props: { valid: false } });
    }
  });
});

describe("/unsubscribe, in the browser", () => {
  it("shows the question and the button, and does not opt out on load", async () => {
    await mount({ valid: true, u: U, t: T });
    expect(host.textContent).toContain(COPY.title);
    expect(button(COPY.stop)).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("posts the pair once the button is pressed, then shows the done text and the button to turn emails back on", async () => {
    await mount({ valid: true, u: U, t: T });
    await act(async () => { button(COPY.stop).click(); });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("/api/email/unsubscribe");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ u: U, t: T });
    expect(host.textContent).toContain(COPY.done);
    expect(button(COPY.turnOn)).toBeTruthy();
    expect(button(COPY.stop)).toBeUndefined();
  });

  it("turns the emails back on with on: true, and offers to stop them again", async () => {
    await mount({ valid: true, u: U, t: T });
    await act(async () => { button(COPY.stop).click(); });
    await act(async () => { button(COPY.turnOn).click(); });
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({ u: U, t: T, on: true });
    expect(host.textContent).toContain(COPY.on);
    expect(button(COPY.stop)).toBeTruthy();
  });

  it("says when the request failed, and stays on the question", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await mount({ valid: true, u: U, t: T });
    await act(async () => { button(COPY.stop).click(); });
    expect(host.textContent).toContain(COPY.failed);
    expect(host.textContent).not.toContain(COPY.done);
    expect(button(COPY.stop)).toBeTruthy();
  });

  it("says only that an invalid link does not work, with no button to stop and nothing about any account", async () => {
    await mount({ valid: false });
    expect(host.textContent).toContain(COPY.invalid);
    expect(button(COPY.stop)).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("has no em dashes and no semicolons in its words", () => {
    for (const text of Object.values(COPY)) {
      expect(text).not.toMatch(/[—;]/);
    }
  });
});
