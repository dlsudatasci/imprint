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
    expect(section.indexOf("data-path-points")).toBeLessThan(section.indexOf("If you choose Yes"));
    // Only once on the page
    expect(html.match(/data-path-points/g)).toHaveLength(1);
  });

  it("says a box only means the model found an object, beside the dashed boxes", () => {
    expect(step("answer").paragraphs[0]).toBe("Dashed boxes are the model's suggestions. A box only means the model found an object, not that it is on the path or in your way. Click one, or tap it on a phone, to open its panel.");
  });

  it("rates the sidewalk nearest you in Step 2, the same one as in Step 1", () => {
    expect(step("rate").paragraphs[0]).toMatch(/^Step 2 asks four questions about the sidewalk nearest you as a whole, the same one as in Step 1\./);
  });

  // S16 follow-up (3 Nov 2026): the questions named as the box panel names them
  it("names Question 1 then Question 2 in Answer each suggestion", () => {
    const [, first, second] = step("answer").paragraphs;
    expect(first).toBe(`Check the category, then answer Question 1, “${SIDEWALK_QUESTION_COPY.question}”, with Yes or No.`);
    expect(second).toBe("If you choose Yes, Question 2 asks “Does it obstruct the sidewalk?” Answer it for yourself, as you normally travel. If you choose Yes again, rate how much from 1, a minor inconvenience, to 5, impassable.");
    const text = step("answer").paragraphs.join(" ");
    expect(text.indexOf("Question 1")).toBeLessThan(text.indexOf("Question 2"));
    // The path list still right after Question 1
    expect(step("answer").pathPointsAfter).toBe(2);
  });

  it("names Question 1 then Question 2 in Mark boxes with nothing in them", () => {
    const [first] = step("not-an-object").paragraphs;
    expect(first).toBe("If an object is off the path, choose No to Question 1. If it is on the path but not in your way, choose No to Question 2.");
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

// S17 (4 Nov 2026), from pilot participant 3: how to change an answer, and
// where a Not an object box goes
describe("the guide on changing an answer (S17)", () => {
  const [, notAnObject, lists] = step("not-an-object").paragraphs;

  it("puts Not an object at Question 1 and says where the box goes", () => {
    expect(notAnObject).toBe("If a box has nothing real in it, choose Not an object at the foot of its panel at Question 1. The box then leaves the photo and is listed under Not an object, where you can open it and choose Restore.");
  });

  it("ends the lists paragraph with the severity scale and the two ways back", () => {
    expect(lists.endsWith(" An obstruction opens on its severity scale. To change an earlier answer, choose Back to Question 2 or Back to Question 1, then pick the new answer.")).toBe(true);
    expect(lists.startsWith("Every answer sorts the object into a list, Not obstructions or Obstructions,")).toBe(true);
  });

  it("never says Change or Go back, and has no em dash or semicolon", () => {
    for (const s of GUIDE_COPY.steps) {
      for (const p of s.paragraphs) {
        expect(p, `${s.id}: ${p}`).not.toMatch(/\b(click|tap|choose) Change\b|Go back/);
        expect(p).not.toMatch(/[—;]/);
      }
    }
  });

  it("is what the guide page shows", () => {
    const html = decode(renderToStaticMarkup(<HelpDirectory />));
    expect(html).toContain(notAnObject);
    expect(html).toContain("choose Back to Question 2 or Back to Question 1, then pick the new answer.");
  });
});
