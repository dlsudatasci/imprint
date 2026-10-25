// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readSessionData, readTotalCount, readCurrentCount } from "@/util/sessionCache";

const reload = vi.fn();
const replace = vi.fn();
vi.mock("next/router", () => ({ useRouter: () => ({ reload, replace }) }));
vi.mock("next/link", () => ({ default: ({ children }) => children }));

import AnnotationSessionSelection from "./selection";

/**
 * Starting a session (8 Oct 2026): the length recorded is the images the
 * server served, which can be fewer than chosen when the pool runs short.
 * Recording the size chosen pointed the last position past the end.
 */
let root;
let host;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

function serve(served) {
  globalThis.fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    if (!body.annotationTotalCount) return { ok: true, json: async () => ({ imgRecords: [], sessionSizes: [10, 25, 50], isAnnotator: true }) };
    const imgRecords = Array.from({ length: served }, (_, i) => ({ imageID: i + 1 }));
    return { ok: true, json: async () => ({ imgRecords, isExistingSession: false, isAnnotator: true }) };
  });
}

beforeEach(() => {
  window.localStorage.clear();
  reload.mockClear();
  replace.mockClear();
  host = document.createElement("main");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function start(size) {
  await act(async () => {
    root.render(<AnnotationSessionSelection />);
  });
  const option = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(String(size)));
  await act(async () => option.click());
  const startButton = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Start Session");
  await act(async () => startButton.click());
}

describe("starting a session", () => {
  it("records the images served as the session's length when the pool runs short", async () => {
    serve(49);
    await start(50);
    expect(globalThis.fetch).toHaveBeenLastCalledWith("/api/annotationGet", expect.objectContaining({ body: JSON.stringify({ annotationTotalCount: 50 }) }));
    expect(readTotalCount()).toBe(49);
    expect(readCurrentCount()).toBe(1);
    expect(readSessionData().imgRecords).toHaveLength(49);
    expect(reload).toHaveBeenCalled();
  });

  it("records the size chosen when every image is served", async () => {
    serve(50);
    await start(50);
    expect(readTotalCount()).toBe(50);
  });
});

// Email verification before annotation (S9, decided 21 Oct 2026)
describe("a contributor whose email address is not confirmed", () => {
  const refuse = () => ({
    ok: false,
    status: 403,
    json: async () => ({ message: "Confirm your email address to start annotating.", code: "EMAIL_NOT_VERIFIED" }),
  });

  it("is sent to Check your inbox as the picker opens", async () => {
    globalThis.fetch = vi.fn(async () => refuse());
    await act(async () => {
      root.render(<AnnotationSessionSelection />);
    });
    expect(replace).toHaveBeenCalledWith("/check-email");
  });

  it("is sent to Check your inbox from Start, with no alert and no session saved", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      if (!body.annotationTotalCount) return { ok: true, json: async () => ({ imgRecords: [], sessionSizes: [5, 10, 20, 40], isAnnotator: false }) };
      return refuse();
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    await start(10);
    expect(replace).toHaveBeenCalledWith("/check-email");
    expect(alertSpy).not.toHaveBeenCalled();
    expect(readTotalCount()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("is not redirected by any other refusal", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ message: "Forbidden" }) }));
    await act(async () => {
      root.render(<AnnotationSessionSelection />);
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
