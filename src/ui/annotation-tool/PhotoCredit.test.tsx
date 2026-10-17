// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import ReactPictureAnnotation from "./ReactPictureAnnotation";
import PhotoCredit, { photoCredit, mapillaryImageUrl, CC_BY, CC_BY_SA } from "./PhotoCredit";
import { writeSession } from "@/util/sessionCache";
import TUTORIAL_IMAGES from "@/data/tutorialImages";

/**
 * Each photo on the annotation screen is credited (16 Oct 2026, Rans):
 * Mapillary's images are CC BY-SA 4.0 and ask for a link to the image, ATLAS-3
 * is CC BY 4.0. Same stand-in canvas as ReactPictureAnnotation.labels.test.tsx.
 */
describe("photoCredit", () => {
  it("credits a Mapillary photo with its license and a link to the image", () => {
    const c = photoCredit({ source: "mapillary", sourceImageId: "1234567890" })!;
    expect(c.license).toEqual(CC_BY_SA);
    expect(c.view).toEqual({ label: "View on Mapillary", href: "https://www.mapillary.com/app/?pKey=1234567890" });
    expect(mapillaryImageUrl("a b")).toBe("https://www.mapillary.com/app/?pKey=a%20b");
    // Without an id, the credit and license still show
    expect(photoCredit({ source: "mapillary", sourceImageId: "" })!.view).toBeNull();
  });

  it("credits an ATLAS-3 frame to an earlier research group, without naming the collection, with its license", () => {
    const c = photoCredit({ source: "atlas3", sourceImageId: "makati_0001" })!;
    expect(c.text).toBe("Photo from an earlier research group,");
    expect(c.text).not.toMatch(/atlas/i);
    expect(c.license).toEqual(CC_BY);
    expect(c.view).toBeNull();
  });

  it("shows nothing for a photo of unknown source", () => {
    expect(photoCredit(null)).toBeNull();
    expect(photoCredit({ source: "other" })).toBeNull();
    expect(renderToStaticMarkup(<PhotoCredit photo={{}} />)).toBe("");
  });

  it("opens its links in a new tab, and has no em dashes or semicolons", () => {
    const html = renderToStaticMarkup(<PhotoCredit photo={{ source: "mapillary", sourceImageId: "9" }} />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toMatch(/[—;]/);
  });

  it("marks the tutorial's three frames as ATLAS-3", () => {
    expect(TUTORIAL_IMAGES.map((i) => i.source)).toEqual(["atlas3", "atlas3", "atlas3"]);
  });
});

describe("the credit in the tool", () => {
  beforeAll(() => {
    const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean; ResizeObserver: unknown };
    g.IS_REACT_ACT_ENVIRONMENT = true;
    g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    const store: Record<string | symbol, unknown> = {};
    const ctx = new Proxy(store, {
      get: (target, prop) => (prop in target ? target[prop] : prop === "measureText" ? () => ({ width: 40 }) : () => undefined),
      set: (target, prop, value) => { target[prop] = value; return true; },
    });
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  });

  let root: Root | null = null;
  let host: HTMLDivElement;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
  });

  function mount(isAnnotator: boolean) {
    window.localStorage.clear();
    writeSession({ total: 1, current: 1, data: { imgRecords: [{ imageID: "IMG", url: "/p.jpg", annotationList: [] }], isAnnotator } });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <ReactPictureAnnotation
          image="/p.jpg"
          photoSource={{ source: "mapillary", sourceImageId: "42" }}
          onSelect={() => undefined}
          onChange={() => undefined}
          width={960}
          height={600}
          annotationData={[]}
          imageID="IMG"
          city="manila"
          currentAnnotationCount={1}
          totalAnnotationCount={1}
          username="test"
          isAnnotator={isAnnotator}
        />
      );
    });
    return host;
  }

  it("sits under the photo for contributors and annotators on a laptop", () => {
    for (const isAnnotator of [false, true]) {
      const el = mount(isAnnotator);
      const credit = el.querySelector("[data-photo-credit]");
      expect(credit, `annotator ${isAnnotator}`).not.toBeNull();
      expect(credit!.querySelector('a[href="https://www.mapillary.com/app/?pKey=42"]')).not.toBeNull();
      // Right after the photo, in the photo's own card
      expect(credit!.previousElementSibling?.querySelector(".rp-stage")).not.toBeNull();
      act(() => root?.unmount());
      host.remove();
      root = null;
    }
  });
});
