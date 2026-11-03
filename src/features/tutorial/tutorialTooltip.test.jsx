import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TourCard, { TourStepBody } from "./TourCard";
import { buildTourSteps } from "./tourSteps";

/**
 * The tour's card (S16, 3 Nov 2026): a contributor step reads as an intro, a
 * numbered list and a note, and the card never runs off the screen, which
 * the Your Answers card did on a phone in the first pilot session.
 */
const decode = (html) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const body = (step) => decode(renderToStaticMarkup(<TourStepBody step={step} />));

describe("a tour step's text", () => {
  it("renders a contributor step as its numbered list, then its note", () => {
    const check = buildTourSteps(false)[0];
    const html = body(check);
    expect(html).toMatch(/^<ol class="list-decimal pl-5 space-y-1">/);
    expect([...html.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1])).toEqual(check.points);
    expect(html).toMatch(/<\/ol><p class="mt-2 text-muted">Missed one\? Click and drag to box it\.<\/p>$/);
  });

  it("renders the intro first and `after` between the list and the note", () => {
    const html = body({ intro: "Intro.", points: ["One."], after: "After.", note: "Note." });
    expect(html).toBe('<p>Intro.</p><ol class="list-decimal pl-5 space-y-1 mt-2"><li>One.</li></ol><p class="mt-2">After.</p><p class="mt-2 text-muted">Note.</p>');
  });

  it("renders a step with no points as its paragraphs, with no list", () => {
    const answers = buildTourSteps(false)[2];
    expect(body(answers)).toBe(`<p>${answers.intro}</p><p class="mt-2">${answers.after}</p>`);
    const next = buildTourSteps(false).at(-1);
    expect(body(next)).toBe(`<p>${next.after}</p>`);
    expect(body(buildTourSteps(false, "objects", "touch")[3])).not.toContain("<ol");
  });

  it("renders a step with no intro or note as the list alone", () => {
    const html = body({ points: ["One.", "Two."] });
    expect(html).toBe('<ol class="list-decimal pl-5 space-y-1"><li>One.</li><li>Two.</li></ol>');
  });

  it("renders an annotator step as its one paragraph", () => {
    const [canvas] = buildTourSteps(true);
    expect(body(canvas)).toBe(`<p>${canvas.content}</p>`);
  });
});

describe("the tour card", () => {
  const card = () => renderToStaticMarkup(
    <TourCard title="Your Answers" onDismiss={() => {}} footer={<span>Step 4 of 7</span>}>
      <p>text</p>
    </TourCard>
  );

  it("is never taller than the screen less 32 px, with a 100vh fallback", () => {
    const className = card().match(/<div data-tour-card="true" class="([^"]+)"/)[1].split(" ");
    // At most the screen less 32 px, or less where a step lowers it (`--tour-max-h`, S16b)
    expect(className).toContain("max-h-[min(var(--tour-max-h,100vh),calc(100vh-32px))]");
    expect(className).toContain("supports-[height:100svh]:max-h-[min(var(--tour-max-h,100svh),calc(100svh-32px))]");
    expect(className).toContain("flex");
    expect(className).toContain("flex-col");
    // Its width as before
    expect(className).toContain("w-[320px]");
    expect(className).toContain("max-w-[calc(100vw-32px)]");
  });

  it("keeps the title row and the Back and Next row fixed, and scrolls only the text between them", () => {
    const html = card();
    const rows = [...html.matchAll(/<div (?:data-tour-body="true" )?class="([^"]+)"/g)].map((m) => m[1]);
    expect(rows).toHaveLength(3);
    const [title, text, footer] = rows;
    expect(title).toMatch(/\bshrink-0\b/);
    expect(footer).toMatch(/\bshrink-0\b/);
    expect(text).toMatch(/\bmin-h-0\b/);
    expect(text).toMatch(/\boverflow-y-auto\b/);
    expect(text).toMatch(/\boverscroll-contain\b/);
    expect(html).toContain("<h3");
    expect(html).toContain("Your Answers");
    expect(html).toContain('aria-label="Dismiss tour"');
    expect(html).toContain("<span>Step 4 of 7</span>");
    expect(html.indexOf("data-tour-body")).toBeLessThan(html.indexOf("Step 4 of 7"));
  });
});
