// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { upcomingImageUrls, prefetchImages, resetPrefetched } from "./imagePrefetch";

/** The photos fetched ahead of when they are shown (S16, 3 Nov 2026) */
const images = (...urls) => urls.map((url, i) => ({ imageID: i + 1, url }));

describe("upcomingImageUrls", () => {
  it("gives the next two images' urls after the 1-based current one", () => {
    const batch = images("/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg");
    expect(upcomingImageUrls(batch, 1)).toEqual(["/2.jpg", "/3.jpg"]);
    expect(upcomingImageUrls(batch, 2)).toEqual(["/3.jpg", "/4.jpg"]);
    expect(upcomingImageUrls(batch, 1, 3)).toEqual(["/2.jpg", "/3.jpg", "/4.jpg"]);
  });

  it("gives one or none near the end of the batch", () => {
    const batch = images("/1.jpg", "/2.jpg", "/3.jpg");
    expect(upcomingImageUrls(batch, 2)).toEqual(["/3.jpg"]);
    expect(upcomingImageUrls(batch, 3)).toEqual([]);
  });

  it("skips missing urls and duplicates", () => {
    const batch = [{ url: "/1.jpg" }, { url: "/2.jpg" }, { url: "/2.jpg" }, {}, { url: "" }, null, { url: "/6.jpg" }];
    expect(upcomingImageUrls(batch, 1, 6)).toEqual(["/2.jpg", "/6.jpg"]);
    expect(upcomingImageUrls([{ url: "/1.jpg" }, {}, null], 1)).toEqual([]);
  });

  it("gives nothing out of range or without a batch", () => {
    const batch = images("/1.jpg", "/2.jpg");
    expect(upcomingImageUrls(batch, 5)).toEqual([]);
    expect(upcomingImageUrls(batch, -1)).toEqual([]);
    expect(upcomingImageUrls(batch, 1.5)).toEqual([]);
    expect(upcomingImageUrls(undefined, 1)).toEqual([]);
    expect(upcomingImageUrls(batch, 0)).toEqual(["/1.jpg", "/2.jpg"]);
  });
});

describe("prefetchImages", () => {
  let made;
  const realImage = globalThis.Image;
  beforeEach(() => {
    resetPrefetched();
    made = [];
    globalThis.Image = class {
      constructor() {
        made.push(this);
      }
    };
    Object.defineProperty(navigator, "connection", { value: undefined, configurable: true });
  });
  afterEach(() => {
    globalThis.Image = realImage;
    delete navigator.connection;
  });

  it("fetches each url once per page, at low priority, decoded off the main thread", () => {
    prefetchImages(["/2.jpg", "/3.jpg"]);
    prefetchImages(["/3.jpg", "/4.jpg"]);
    expect(made.map((img) => img.src)).toEqual(["/2.jpg", "/3.jpg", "/4.jpg"]);
    for (const img of made) {
      expect(img.fetchPriority).toBe("low");
      expect(img.decoding).toBe("async");
    }
  });

  it("sets the priority before the url, high when asked", () => {
    const order = [];
    globalThis.Image = class {
      set fetchPriority(v) { order.push(`priority ${v}`); }
      set decoding(v) { order.push(`decoding ${v}`); }
      set src(v) { order.push(`src ${v}`); }
    };
    prefetchImages(["/1.jpg"], { priority: "high" });
    expect(order).toEqual(["decoding async", "priority high", "src /1.jpg"]);
  });

  it("skips missing urls", () => {
    prefetchImages([undefined, "", null, "/1.jpg"]);
    prefetchImages(undefined);
    expect(made.map((img) => img.src)).toEqual(["/1.jpg"]);
  });

  it("fetches nothing when the browser asks to save data", () => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
    prefetchImages(["/1.jpg"], { priority: "high" });
    expect(made).toEqual([]);
    // Not remembered as fetched
    Object.defineProperty(navigator, "connection", { value: { saveData: false }, configurable: true });
    prefetchImages(["/1.jpg"]);
    expect(made).toHaveLength(1);
  });

  it("does nothing without Image, as on the server", () => {
    globalThis.Image = undefined;
    expect(() => prefetchImages(["/1.jpg"])).not.toThrow();
  });
});
