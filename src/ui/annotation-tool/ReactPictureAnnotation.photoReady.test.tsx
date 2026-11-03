// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation from "./ReactPictureAnnotation";

vi.mock("next/router", () => ({ default: { reload: vi.fn() } }));

/**
 * The photo first (S16, 3 Nov 2026): the tool asks for its photo at high
 * priority, and says when the photo has loaded and been painted
 * (onPhotoReady), which AnnotateForm waits for before the strip's upcoming
 * thumbnails and the next photos.
 *
 * jsdom has no canvas, so the 2D context here takes every call and does
 * nothing, which lets the tool create its photo's <img>.
 */
const context = new Proxy({}, {
  get: (_target, key) => (key === "canvas" ? document.createElement("canvas") : () => ({ width: 0 })),
  set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
const realCreateElement = document.createElement.bind(document);

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean; ResizeObserver: unknown };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  HTMLCanvasElement.prototype.getContext = (() => context) as unknown as HTMLCanvasElement["getContext"];
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
});

/** Mounts the tool and gives back the photo's <img> and the order its fields were set in */
function mount(onPhotoReady?: () => void) {
  const order: string[] = [];
  let photo: HTMLImageElement | null = null;
  vi.spyOn(document, "createElement").mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    const el = realCreateElement(tag, options);
    if (tag === "img" && !photo) {
      photo = el as HTMLImageElement;
      for (const field of ["fetchPriority", "src"] as const) {
        let value = "";
        Object.defineProperty(el, field, {
          get: () => value,
          set: (v: string) => { order.push(field); value = v; },
        });
      }
    }
    return el;
  }) as typeof document.createElement);
  const host = realCreateElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ReactPictureAnnotation
        image="/corpus-images/1.jpg"
        onSelect={() => undefined}
        onChange={() => undefined}
        width={960}
        height={600}
        annotationData={[]}
        imageID="IMG-1"
        city="manila"
        currentAnnotationCount={1}
        totalAnnotationCount={3}
        username="test"
        onPhotoReady={onPhotoReady}
      />
    );
  });
  return { photo: photo as HTMLImageElement | null, order };
}

describe("the tool's photo", () => {
  it("is asked for at high priority, before its url is set", () => {
    const { photo, order } = mount();
    expect(photo).not.toBeNull();
    expect(photo!.fetchPriority).toBe("high");
    expect(photo!.src).toBe("/corpus-images/1.jpg");
    expect(order).toEqual(["fetchPriority", "src"]);
  });

  it("calls onPhotoReady once the photo has loaded, and not before", () => {
    const onPhotoReady = vi.fn();
    const { photo } = mount(onPhotoReady);
    expect(onPhotoReady).not.toHaveBeenCalled();
    act(() => {
      photo!.dispatchEvent(new Event("load"));
    });
    expect(onPhotoReady).toHaveBeenCalledTimes(1);
  });

  it("loads the photo without onPhotoReady, as for any other caller", () => {
    const { photo } = mount();
    expect(() => act(() => {
      photo!.dispatchEvent(new Event("load"));
    })).not.toThrow();
  });
});
