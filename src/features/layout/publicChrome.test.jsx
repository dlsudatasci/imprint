// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
// Head renders its children in place, so a <title> it was given would show up
vi.mock("next/head", () => ({ default: ({ children }) => <div data-head>{children}</div> }));
vi.mock("@/features/navbarMain", () => ({ default: ({ sticky }) => <nav data-navbar data-sticky={String(!!sticky)} /> }));
vi.mock("@/features/layout/contribute", () => ({ default: ({ children }) => <div data-contribute>{children}</div> }));

import MainLayout, { SKIP_LINK_TEXT } from "./main";
import Footer from "@/features/footerMain";
import { STUDY_LINKS, RESEARCHER_EMAIL } from "@/features/footerMain/footerCopy";
import Page, { DEFAULT_DESCRIPTION } from "@/ui/page";
import { AuthCard } from "@/ui";

/**
 * The public pages' shared chrome after the redesign (16 Oct 2026).
 */
let root;
let host;
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function mount(node) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(node));
  return host;
}

describe("public layout", () => {
  it("puts Skip to content first, pointing at the page's content, and makes the navbar sticky", () => {
    const el = mount(<MainLayout><p>Body</p></MainLayout>);
    const first = el.querySelector("a");
    expect(first.textContent).toBe(SKIP_LINK_TEXT);
    expect(first.getAttribute("href")).toBe("#content");
    expect(el.querySelector("#content").textContent).toBe("Body");
    expect(el.querySelector("[data-navbar]").dataset.sticky).toBe("true");
  });

  it("sets no title of its own, so the page's title is the one the tab shows", () => {
    const el = mount(<MainLayout><p>Body</p></MainLayout>);
    expect(el.querySelector("title")).toBeNull();
  });
});

describe("page shell", () => {
  it("links the icon from the site root, so pages under /contribute find it too", () => {
    const html = renderToStaticMarkup(<Page title="T" contribute={false}><p /></Page>);
    expect(html).toContain('rel="icon" href="/images/logo/browser.jpg"');
  });

  it("falls back to a description when a page gives none", () => {
    const html = renderToStaticMarkup(<Page title="T" contribute={false}><p /></Page>);
    expect(html).toContain(`name="description" content="${DEFAULT_DESCRIPTION.replace(/'/g, "&#x27;")}"`);
  });
});

describe("footer", () => {
  it("thanks the reader as the old footer did, and links the pages, the email and the code", () => {
    const el = mount(<Footer />);
    expect(el.textContent).toContain("Thank you for joining us in knowing our streets better.");
    expect(el.textContent).toContain("Feel free to send us a message or view our repository.");
    expect(el.textContent).not.toContain("Built by");
    const hrefs = [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const l of STUDY_LINKS) expect(hrefs).toContain(l.href);
    expect(hrefs).toContain("/demo");
    expect(hrefs).toContain(`mailto:${RESEARCHER_EMAIL}`);
    expect(hrefs).toContain("https://github.com/dlsudatasci/imprint");
    // Rans, 17 Oct 2026: no name and tagline, and no photo credit line (each photo is credited where it is annotated)
    expect(el.textContent).not.toMatch(/A platform for mapping|Street photos|CC BY/);
    expect(el.querySelector('img[src="/images/logo/imprint.png"]')).toBeNull();
  });

  it("sits on the old footer's dark ground with white text and the old white outlined buttons (Rans, 17 Oct 2026)", () => {
    const el = mount(<Footer />);
    const footer = el.querySelector("footer");
    expect(footer.className).toContain("bg-accent");
    expect(footer.className).not.toMatch(/bg-surface/);
    expect(el.querySelector("p").className).toContain("text-white");
    for (const a of el.querySelectorAll('a[href^="mailto:"], a[href*="github.com"]')) {
      expect(a.className).toContain("border-white");
      expect(a.className).toContain("hover:bg-white");
    }
    // The logo is drawn in cream for a dark ground, so no filter turns it ink
    expect(el.querySelector('img[src="/images/logo/hxil.png"]').className).not.toMatch(/brightness|opacity/);
  });

  it("names the lab's logo for screen readers", () => {
    const el = mount(<Footer />);
    expect(el.querySelector('img[src="/images/logo/hxil.png"]').getAttribute("alt")).toBe("Human-X Interactions Lab");
  });
});

describe("AuthCard", () => {
  it("sits on the page without a shadow (border-led, design system D6)", () => {
    const el = mount(<AuthCard title="Welcome back"><p /></AuthCard>);
    expect(el.innerHTML).not.toContain("shadow");
    expect(el.querySelector("h1").textContent).toBe("Welcome back");
  });
});
