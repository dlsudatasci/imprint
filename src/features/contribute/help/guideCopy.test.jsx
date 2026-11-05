import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/dynamic", () => ({ default: () => () => <div data-dynamic /> }));

import HelpDirectory from "./index";
import { GUIDE_COPY } from "./guideCopy";
import { SIDEWALK_QUESTION_COPY } from "@/features/annotate/sidewalkQuestionCopy";

/**
 * The guide after the first two pilot sessions (S16, 3 Nov 2026): a box is
 * only the model's guess, what counts as the path is listed under the path
 * question (only the sidewalk nearest you counts), and Step 2 rates that
 * same sidewalk.
 */
const decode = (html) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const step = (id) => GUIDE_COPY.steps.find((s) => s.id === id);

describe("the guide on the path (S16)", () => {
  it("lists the three path lines under the path question, the nearest sidewalk last", () => {
    const answer = step("answer");
    expect(answer.pathPoints).toEqual(SIDEWALK_QUESTION_COPY.pathPoints);
    expect(answer.paragraphs[answer.pathPointsAfter - 1]).toContain(SIDEWALK_QUESTION_COPY.question);
    const html = decode(renderToStaticMarkup(<HelpDirectory />));
    const section = html.slice(html.indexOf('id="answer"'), html.indexOf('id="not-an-object"'));
    const list = section.match(/<ul data-path-points[^>]*>([\s\S]*?)<\/ul>/)?.[1];
    expect([...list.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1])).toEqual([...SIDEWALK_QUESTION_COPY.pathPoints]);
    // Right under the question, before Question 2's paragraph
    expect(section.indexOf("data-path-points")).toBeGreaterThan(section.indexOf(SIDEWALK_QUESTION_COPY.question));
    expect(section.indexOf("data-path-points")).toBeLessThan(section.indexOf("If it is on the sidewalk, then Question 2"));
    // Only once on the page
    expect(html.match(/data-path-points/g)).toHaveLength(1);
  });

  // Rans's wording (5 Nov 2026), with no "model"
  it("says a box is only a suggested object, beside the dashed yellow boxes", () => {
    expect(step("answer").paragraphs[0]).toBe("Dashed yellow boxes are suggested objects. A box is only a suggested object, it doesn't necessarily mean it's on the sidewalk or an obstruction. Click one, or tap it on a phone, to open its panel.");
  });

  it("rates the sidewalk nearest you in Step 2, the same one as in Step 1", () => {
    expect(step("rate").paragraphs[0]).toMatch(/^Step 2 asks four questions about the sidewalk nearest you as a whole, the same one as in Step 1\./);
  });

  // S16 follow-up (3 Nov 2026): the questions named as the box panel names them
  it("names Question 1 then Question 2 in Answer each suggestion", () => {
    const [, first, second] = step("answer").paragraphs;
    expect(first).toBe(`Check the category, then answer Question 1, “${SIDEWALK_QUESTION_COPY.question}”, with Yes or No.`);
    expect(second).toBe("If it is on the sidewalk, then Question 2 asks “Does it obstruct the sidewalk?” Answer it for yourself if you believe the object obstructs your path or not. If it does obstruct, rate the severity of its obstruction from 1, a minor inconvenience, to 5, impassable.");
    const text = step("answer").paragraphs.join(" ");
    expect(text.indexOf("Question 1")).toBeLessThan(text.indexOf("Question 2"));
    // The path list still right after Question 1
    expect(step("answer").pathPointsAfter).toBe(2);
  });

  it("names Question 1 then Question 2 in Mark boxes with nothing in them, then Not an object, in one paragraph", () => {
    expect(step("not-an-object").paragraphs).toEqual([
      "If an object is not on the sidewalk, choose No to Question 1. If it is on the sidewalk but not an obstruction, choose No to Question 2. If a box does not seem to be a real object, choose Not an object. The box then leaves the photo and is listed under Not an object, where you can open it and choose Restore.",
    ]);
    const [first] = step("not-an-object").paragraphs;
    expect(first.indexOf("Question 1")).toBeLessThan(first.indexOf("Question 2"));
  });

  it("never says to choose No without naming its question", () => {
    for (const s of GUIDE_COPY.steps) {
      for (const p of s.paragraphs) {
        for (const m of p.matchAll(/choose No\b/g)) {
          expect(p.slice(m.index, m.index + "choose No to Question 1".length), `${s.id}: ${p}`).toMatch(/^choose No to Question [12]$/);
        }
      }
    }
  });

  it("has no em dash or semicolon in what changed", () => {
    for (const text of [...step("answer").paragraphs, ...step("not-an-object").paragraphs, ...step("rate").paragraphs]) expect(text).not.toMatch(/[—;]/);
  });
});

// S17 (4 Nov 2026), from pilot participant 3, then Rans's wording after S18
// (5 Nov 2026): the guide no longer explains the lists or the ways back
describe("the guide after Rans's review of S18 (5 Nov 2026)", () => {
  const text = () => GUIDE_COPY.steps.flatMap((s) => s.paragraphs).join(" ");

  it("starts with one paragraph, the session picker, with no tutorial, Pause or Stop", () => {
    const start = step("start").paragraphs;
    expect(start).toHaveLength(1);
    expect(start[0]).toMatch(/^From your dashboard, choose Let's Annotate!, pick how many photos to do \(.+\), and choose Start Session\.$/);
    expect(text()).not.toMatch(/\bPause\b|\bStop\b|The first time|tutorial|practice photos/);
  });

  it("no longer has the paragraph on the lists, the severity scale or Back to Question, but says where a Not an object box goes", () => {
    expect(text()).not.toMatch(/Every answer sorts the object|Back to Question/);
    expect(step("not-an-object").paragraphs[0]).toMatch(/choose Not an object\. The box then leaves the photo and is listed under Not an object, where you can open it and choose Restore\.$/);
  });

  it("titles drawing Draw the objects we missed, drags around the object, and says Click Next Image once every object has an answer", () => {
    expect(step("draw").title).toBe("Draw the objects we missed");
    expect(step("draw").paragraphs.slice(0, 2)).toEqual([
      "Box every object on the sidewalk or the path people walk on that we missed, whether or not it is an obstruction. Leave out objects that are not on the sidewalk.",
      "With a mouse, drag a box around the object. On a phone or tablet, tap Add box and drag its corners to fit.",
    ]);
    expect(step("next").paragraphs[0]).toBe("Click Next Image once every object has an answer. Previous takes you back to a photo you already did, to change it.");
  });

  it("never says model, Change or Go back, and has no em dash or semicolon", () => {
    for (const s of GUIDE_COPY.steps) {
      for (const p of [s.title, ...s.paragraphs]) {
        expect(p, `${s.id}: ${p}`).not.toMatch(/\bmodel|\b(click|tap|choose) Change\b|Go back/i);
        expect(p).not.toMatch(/[—;]/);
      }
    }
  });

  it("is what the guide page shows", () => {
    const html = decode(renderToStaticMarkup(<HelpDirectory />));
    expect(html).toContain(step("not-an-object").paragraphs[0]);
    expect(html).toContain("Draw the objects we missed");
    expect(html).not.toContain("The tutorial uses practice photos");
    expect(html).not.toContain("Pause keeps your work");
  });
});
