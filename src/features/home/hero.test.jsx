// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-map /> }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

import { useSession } from "next-auth/react";
import Hero from "./hero";
import { HERO_COPY } from "./heroCopy";
import { obstructionLabel } from "./cityStatsItems";
import { stickyTop, progressFromRect } from "./howItWorks/useScrollProgress";
import { useScrolled } from "@/hooks/useScrolled";

/**
 * The landing page's hero and its helpers after the redesign (16 Oct 2026).
 */
describe("hero", () => {
  const html = (status) => {
    useSession.mockReturnValue({ status, data: status === "authenticated" ? { user: {} } : null });
    return renderToStaticMarkup(<Hero selectedCity={null} onCitySelect={() => {}} />);
  };

  it("keeps the welcome and its line, as a platform rather than one study", () => {
    const h = html("unauthenticated");
    expect(h).toContain(`id="hero-title"`);
    expect(h).toContain(`Welcome to <span class="text-primary">Imprint</span>`);
    expect(h).toContain(HERO_COPY.lead);
    expect(HERO_COPY.lead).toMatch(/^We aim to accelerate crowdsourced streetscape data collection/);
    // Safety is not something Imprint asks about (§7n). Obstructions are.
    expect(HERO_COPY.lead).not.toMatch(/safety/i);
    expect(HERO_COPY.lead).toContain("obstructions");
    // No eyebrow and no second paragraph about the research
    expect(h).not.toContain("Sidewalk obstructions in Metro Manila");
    expect(h).not.toContain("The same pole");
    expect(HERO_COPY.secondary).toBe("Learn more");
  });

  it("has one filled button, which follows the session like the join card's", () => {
    expect(html("unauthenticated")).toContain(HERO_COPY.ctaSignedOut);
    expect(html("authenticated")).toContain(HERO_COPY.ctaSignedIn);
    const loading = html("loading");
    expect(loading).not.toContain(HERO_COPY.ctaSignedOut);
    expect(loading).not.toContain(HERO_COPY.ctaSignedIn);
    expect(loading).toContain(HERO_COPY.secondary);
  });

  it("has no hint under the map (Rans, 17 Oct 2026)", () => {
    expect(html("unauthenticated")).not.toContain("Select a city");
    expect(Object.values(HERO_COPY).join(" ")).not.toContain("Select a city");
  });
});

describe("obstructionLabel", () => {
  it("names a category as the category list does, and shows a typed label as typed", () => {
    expect(obstructionLabel("street_vendor_cart")).toBe("Street Vendor Cart");
    expect(obstructionLabel("utility_post")).toBe("Utility Post");
    expect(obstructionLabel("sari_sari extension")).toBe("sari sari extension");
    expect(obstructionLabel(undefined)).toBe("");
  });
});

describe("the preview frame under the sticky navbar", () => {
  it("reads where the frame sticks, and counts anything that is not a length as 0", () => {
    const frame = document.createElement("div");
    frame.style.position = "sticky";
    frame.style.top = "64px";
    document.body.appendChild(frame);
    expect(stickyTop(frame)).toBe(64);
    frame.style.top = "auto";
    expect(stickyTop(frame)).toBe(0);
    expect(stickyTop(null)).toBe(0);
    frame.remove();
  });

  it("starts the scroll when the track reaches the frame's sticky line, not the window's top", () => {
    // A track 4000 tall, a frame 836 tall sticking 64 px down: at the moment
    // the track's top meets the line, the preview is at its start. This is
    // what useScrollProgress passes: the track's top less the frame's top.
    const line = 64;
    expect(progressFromRect(64 - line, 4000, 836)).toBe(0);
    expect(progressFromRect(-936 - line, 4000, 836)).toBeCloseTo(1000 / (4000 - 836));
  });
});

describe("useScrolled", () => {
  let root;
  let host;
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    window.scrollY = 0;
  });

  it("is false at the top and true once the page scrolls", () => {
    let seen = null;
    function Probe() {
      seen = useScrolled(0);
      return null;
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Probe />));
    expect(seen).toBe(false);
    act(() => {
      window.scrollY = 120;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(seen).toBe(true);
    act(() => {
      window.scrollY = 0;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(seen).toBe(false);
  });
});
