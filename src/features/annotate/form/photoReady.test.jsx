// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// The tool and the strip are stand-ins: what is under test is what the form
// passes them. The tool's photo loads when the test says so.
const seen = vi.hoisted(() => ({ tool: null, strip: null }));
vi.mock("@/ui/annotation-tool/index", () => ({
  ReactPictureAnnotation: (props) => {
    seen.tool = props;
    return <div data-tool />;
  },
}));
vi.mock("@/features/annotate/ProgressStrip", () => ({
  default: (props) => {
    seen.strip = props;
    return <div data-strip />;
  },
}));
const prefetch = vi.hoisted(() => vi.fn());
vi.mock("@/features/annotate/imagePrefetch", async (importOriginal) => ({ ...(await importOriginal()), prefetchImages: prefetch }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { username: "test" } }, status: "authenticated" }) }));

import AnnotateForm, { PHOTO_READY_FALLBACK_MS } from "./index";

/**
 * The current photo first (S16, 3 Nov 2026): on a laptop the progress strip
 * holds the thumbnails of the images still to come until the photo is on
 * screen, or for 4 seconds if it never is, and then the next two photos are
 * fetched.
 */
const images = Array.from({ length: 5 }, (_, i) => ({ imageID: `I${i + 1}`, url: `/corpus-images/${i + 1}.jpg`, annotationList: [] }));
let root;
let host;
const realMatchMedia = window.matchMedia;

function mount(current = 2) {
  host = document.createElement("main");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<AnnotateForm data={images[current - 1]} current={current} total={images.length} allImages={images} />);
  });
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  vi.useFakeTimers();
  prefetch.mockClear();
  seen.tool = null;
  seen.strip = null;
  // A laptop: the desktop layout, with the strip
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
  window.matchMedia = realMatchMedia;
});

describe("the photo before the strip", () => {
  it("defers the upcoming thumbnails until the tool says the photo is ready, then fetches the next two photos", () => {
    mount(2);
    expect(seen.strip.deferUpcoming).toBe(true);
    expect(typeof seen.tool.onPhotoReady).toBe("function");
    expect(prefetch).not.toHaveBeenCalled();

    act(() => seen.tool.onPhotoReady());
    expect(seen.strip.deferUpcoming).toBe(false);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith(["/corpus-images/3.jpg", "/corpus-images/4.jpg"]);
  });

  it("releases the strip after 4 seconds when the photo never loads", () => {
    expect(PHOTO_READY_FALLBACK_MS).toBe(4000);
    mount(1);
    act(() => vi.advanceTimersByTime(PHOTO_READY_FALLBACK_MS - 1));
    expect(seen.strip.deferUpcoming).toBe(true);
    expect(prefetch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(seen.strip.deferUpcoming).toBe(false);
    expect(prefetch).toHaveBeenCalledWith(["/corpus-images/2.jpg", "/corpus-images/3.jpg"]);
  });

  it("fetches nothing more on the last image, and does not fetch twice when the photo loads after the fallback", () => {
    mount(5);
    act(() => vi.advanceTimersByTime(PHOTO_READY_FALLBACK_MS));
    act(() => seen.tool.onPhotoReady());
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith([]);
  });
});
