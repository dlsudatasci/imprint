// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readSessionData, writeSession } from "@/util/sessionCache";

// The tool itself is not under test here
vi.mock("@/ui/annotation-tool/index", () => ({ ReactPictureAnnotation: () => <div data-tool /> }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { username: "test" } }, status: "authenticated" }) }));

import AnnotateForm from "./index";

/**
 * Pause & Exit keeps the session cache (8 Oct 2026), which holds the current
 * image's unsubmitted boxes and answers, so Resume on this device brings them
 * back. Stop Session still clears it.
 */
let root;
let host;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  // The progress strip scrolls the current image into view
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  window.localStorage.clear();
  writeSession({ total: 3, current: 2, data: { imgRecords: [{ imageID: "A" }, { imageID: "B", annotationList: [{ id: "x", comment: "tree" }] }], isAnnotator: false } });
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  // Leaving the page is not implemented in jsdom
  Object.defineProperty(window, "location", { configurable: true, value: { href: "http://localhost/contribute/annotate" } });
  host = document.createElement("main");
  document.body.appendChild(host);
  root = createRoot(host);
  const data = readSessionData();
  act(() => {
    root.render(<AnnotateForm data={{ ...data.imgRecords[1], url: "/p.jpg" }} current={2} total={3} allImages={data.imgRecords} />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const clickText = async (text) => {
  const button = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  if (!button) throw new Error(`No button "${text}"`);
  await act(async () => {
    button.click();
  });
};

describe("Pause Session", () => {
  it("keeps the session cache, with the current image's edits, and leaves for the dashboard", async () => {
    await clickText("Pause Session");
    expect(document.body.textContent).toContain("so is your work on this image on this device");
    await clickText("Pause & Exit");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/updateSessionCount", expect.objectContaining({ method: "POST" }));
    expect(readSessionData().imgRecords[1].annotationList).toEqual([{ id: "x", comment: "tree" }]);
    expect(window.localStorage.getItem("annotationCurrentCount")).toBe("2");
    expect(window.location.href).toBe("/contribute");
  });
});

describe("Stop Session", () => {
  it("still clears the session cache", async () => {
    await clickText("Stop Session");
    await clickText("Yes, Stop Session");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/annotationAbandon", expect.objectContaining({ method: "POST" }));
    expect(readSessionData()).toBeNull();
  });
});
