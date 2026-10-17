import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "./Button";
import { Display, Headline } from "./Typography";

/**
 * Press feedback and the display sizes (16 Oct 2026, apple-design).
 */
describe("Button", () => {
  it("answers on press, settling to 97% while held, and not with reduced motion or when disabled", () => {
    const html = renderToStaticMarkup(<Button>Go</Button>);
    expect(html).toContain("enabled:active:scale-[0.97]");
    expect(html).toContain("motion-reduce:enabled:active:scale-100");
    expect(html).toContain("transform_100ms_ease-out");
    // Hover is still a colour change over 300 ms, no lift and no shadow
    expect(html).toContain("background-color_300ms_ease-in-out");
    expect(html).not.toMatch(/shadow|translate-y/);
  });
});

describe("Display and Headline", () => {
  it("set size, tracking and leading together, tighter as the type grows", () => {
    const display = renderToStaticMarkup(<Display id="t">Title</Display>);
    expect(display).toMatch(/^<h1 id="t"/);
    expect(display).toContain("tracking-[-0.03em]");
    expect(display).toContain("leading-[1.04]");
    expect(display).toContain("xl:text-7xl");
    const headline = renderToStaticMarkup(<Headline>Section</Headline>);
    expect(headline).toMatch(/^<h2/);
    expect(headline).toContain("lg:tracking-[-0.025em]");
    expect(renderToStaticMarkup(<Display as="h2">x</Display>)).toMatch(/^<h2/);
  });
});
