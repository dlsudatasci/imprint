// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readSessionData, writeSession } from "@/util/sessionCache";

// The tool itself is not under test here. It counts its mounts, so a test can
// tell whether the form kept it or built a new one.
const toolMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/ui/annotation-tool/index", async () => {
  const { useEffect } = await import("react");
  return {
    ReactPictureAnnotation: (props) => {
      useEffect(() => {
        toolMounts.count += 1;
      }, []);
      return <div data-tool data-layout={props.layout} />;
    },
  };
});
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

// Contributors on a phone (9 Oct 2026): the top bar's Pause and Stop open the same dialogs
describe("Pause Session in the sheet layout", () => {
  const realMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("opens the same dialog from the top bar's Pause", async () => {
    act(() => root.unmount());
    window.matchMedia = (query) => ({
      matches: query === "(max-width: 1023.98px)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    root = createRoot(host);
    const data = readSessionData();
    act(() => {
      root.render(<AnnotateForm data={{ ...data.imgRecords[1], url: "/p.jpg" }} current={2} total={3} allImages={data.imgRecords} />);
    });
    // The phone screen: the top bar, no progress strip
    expect(document.body.textContent).toContain("Sidewalk 2 of 3");
    expect(document.body.textContent).not.toContain("Sidewalk #2");
    const pause = document.querySelector('button[aria-label="Pause Session"]');
    expect(pause).not.toBeNull();
    await act(async () => {
      pause.click();
    });
    expect(document.body.textContent).toContain("so is your work on this image on this device");
    await clickText("Pause & Exit");
    expect(readSessionData().imgRecords[1].annotationList).toEqual([{ id: "x", comment: "tree" }]);
    expect(window.location.href).toBe("/contribute");
  });
});

// An iPad turned mid-image (9 Oct 2026): the form keeps the same tool, so its
// selection, unsaved edits and timers carry over
describe("turning a tablet between the layouts", () => {
  const realMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("keeps the same tool and only changes its layout", () => {
    act(() => root.unmount());
    const listeners = [];
    let narrow = true;
    window.matchMedia = (query) => ({
      get matches() {
        return query === "(max-width: 1023.98px)" ? narrow : false;
      },
      media: query,
      addEventListener: (_, listener) => {
        if (query === "(max-width: 1023.98px)") listeners.push(listener);
      },
      removeEventListener: () => {},
    });
    toolMounts.count = 0;
    root = createRoot(host);
    const data = readSessionData();
    act(() => {
      root.render(<AnnotateForm data={{ ...data.imgRecords[1], url: "/p.jpg" }} current={2} total={3} allImages={data.imgRecords} />);
    });
    expect(document.querySelector("[data-tool]").dataset.layout).toBe("sheet");
    expect(toolMounts.count).toBe(1);
    // Turned to landscape: wider than 1024
    narrow = false;
    act(() => listeners.forEach((listener) => listener({ matches: false })));
    expect(document.querySelector("[data-tool]").dataset.layout).toBe("desktop");
    expect(document.body.textContent).toContain("Sidewalk #2");
    // And back
    narrow = true;
    act(() => listeners.forEach((listener) => listener({ matches: true })));
    expect(document.querySelector("[data-tool]").dataset.layout).toBe("sheet");
    expect(toolMounts.count).toBe(1);
  });
});
