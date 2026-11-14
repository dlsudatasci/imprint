// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// The tool is not under test: its props are kept, for the saving signal (S30)
const tool = vi.hoisted(() => ({ props: null }));
vi.mock("@/ui/annotation-tool/index", () => ({
  ReactPictureAnnotation: (props) => {
    tool.props = props;
    return <div data-tool />;
  },
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { username: "test" } }, status: "authenticated" }) }));

import AnnotateForm from "./index";

/**
 * S30 (14 Nov 2026): the tour's ? button in a contributor's session. It does
 * nothing while the photo is being saved or while Pause or Stop asks, and the
 * form hands the tool the tutorial's button label and the tour's telemetry.
 */
let root;
let host;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = () => {};
});

const images = [{ imageID: "A", url: "/a.jpg" }, { imageID: "B", url: "/b.jpg" }];
function render(props = {}) {
  host = document.createElement("main");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<AnnotateForm data={images[0]} current={1} total={2} allImages={images} {...props} />);
  });
}

beforeEach(() => {
  tool.props = null;
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const click = (text) => act(() => button(text).click());

describe("the tour's ? button in a session", () => {
  it("shows Tour beside Pause and Stop and opens the tour", () => {
    const onShowTour = vi.fn();
    render({ onShowTour });
    expect(button("Tour")).toBeDefined();
    click("Tour");
    expect(onShowTour).toHaveBeenCalledTimes(1);
  });

  it("is not there without a tour (annotators)", () => {
    render();
    expect(button("Tour")).toBeUndefined();
  });

  it("does nothing while the photo is being saved", () => {
    const onShowTour = vi.fn();
    render({ onShowTour });
    act(() => tool.props.onSavingChange(true));
    click("Tour");
    expect(onShowTour).not.toHaveBeenCalled();
    act(() => tool.props.onSavingChange(false));
    click("Tour");
    expect(onShowTour).toHaveBeenCalledTimes(1);
  });

  it("does nothing while Pause or Stop asks", () => {
    const onShowTour = vi.fn();
    render({ onShowTour });
    click("Pause Session");
    click("Tour");
    click("Cancel");
    click("Stop Session");
    click("Tour");
    expect(onShowTour).not.toHaveBeenCalled();
    click("Cancel");
    click("Tour");
    expect(onShowTour).toHaveBeenCalledTimes(1);
  });

  it("hands the tool the last photo's label and the tour's telemetry as given", () => {
    const tourTelemetry = () => ({ tourOpens: 0, msTourOpen: 0 });
    render({ finishLabel: "Finish Tutorial", tourTelemetry });
    expect(tool.props.finishLabel).toBe("Finish Tutorial");
    expect(tool.props.tourTelemetry).toBe(tourTelemetry);
    act(() => root.unmount());
    host.remove();
    render();
    expect(tool.props.finishLabel).toBeUndefined();
    expect(tool.props.tourTelemetry).toBeUndefined();
  });
});
