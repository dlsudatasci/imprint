import { describe, it, expect } from "vitest";
import { PRACTICE_COPY, PRACTICE_LINE_WORDS, practiceLine, practiceNote } from "./practiceCopy";
import { PRACTICE_STEPS } from "./practiceSteps";

/** S19 (7 Nov 2026): one short line a step, on a laptop and on touch */

const words = (text) => text.trim().split(/\s+/).length;
const lines = (input) => PRACTICE_STEPS.map((step) => ({ key: step.key, text: practiceLine(step.key, input) }));
const everyText = () => [
  ...lines("pointer"),
  ...lines("touch"),
  { key: "skip", text: PRACTICE_COPY.skip },
  { key: "reminder", text: PRACTICE_COPY.reminder },
  { key: "touchReminder", text: PRACTICE_COPY.touchReminder },
  { key: "skipHint", text: PRACTICE_COPY.skipHint },
  { key: "touchSkipHint", text: PRACTICE_COPY.touchSkipHint },
  { key: "counter", text: PRACTICE_COPY.counter(3, 10) },
  ...PRACTICE_STEPS.map((step) => ({ key: `${step.key} note`, text: practiceNote(step.key) ?? "" })).filter((n) => n.text),
];

describe("the practice's lines", () => {
  it("has a line for every step, on a laptop and on touch", () => {
    for (const { key, text } of [...lines("pointer"), ...lines("touch")]) expect(text, key).toBeTruthy();
    expect(Object.keys(PRACTICE_COPY.lines)).toEqual(PRACTICE_STEPS.map((s) => s.key));
  });

  // 15 in the spec, 22 from Rans's wording (8 Nov 2026)
  it("keeps every line within 22 words", () => {
    expect(PRACTICE_LINE_WORDS).toBe(22);
    for (const { key, text } of everyText()) expect(words(text), `${key}: ${text}`).toBeLessThanOrEqual(PRACTICE_LINE_WORDS);
  });

  it("uses no em dash and no semicolon", () => {
    for (const { key, text } of everyText()) {
      expect(text, key).not.toMatch(/—/);
      expect(text, key).not.toMatch(/;/);
    }
  });

  it("never says click on touch", () => {
    for (const { key, text } of lines("touch")) expect(text, key).not.toMatch(/click/i);
    expect(PRACTICE_COPY.touchReminder).not.toMatch(/click/i);
    expect(PRACTICE_COPY.touchSkipHint).not.toMatch(/click/i);
  });

  it("says tap on touch where the laptop says click", () => {
    for (const { key, text } of lines("pointer")) {
      if (/click/i.test(text)) expect(practiceLine(key, "touch"), key).toMatch(/tap/i);
    }
  });

  it("names no answer for the obstruction question or the severity", () => {
    for (const input of ["pointer", "touch"]) {
      for (const key of ["treeObstructs", "treeSeverity"]) {
        const text = practiceLine(key, input);
        expect(text, key).not.toMatch(/\b(yes|no)\b/i);
        expect(text, key).not.toMatch(/\b[1-5]\b|\b(one|two|three|four|five)\b/i);
      }
      // Step 3 says the answer is the contributor's
      expect(practiceLine("treeObstructs", input)).toMatch(/You decide/);
      expect(practiceLine("treeObstructs", input)).toMatch(/model can be wrong/);
    }
  });

  it("directs Yes at Step 1 (S15), Yes for the tree on the path and No for the car, and no other answer", () => {
    expect(practiceLine("presence")).toMatch(/Choose Yes\.$/);
    expect(practiceLine("treeOnPath")).toMatch(/If it is, choose Yes\.$/);
    expect(practiceLine("carOff")).toMatch(/Please choose No\.$/);
    const directing = lines("pointer").filter(({ text }) => /\bchoose (Yes|No)\b/i.test(text)).map(({ key }) => key);
    expect(directing).toEqual(["presence", "treeOnPath", "carOff"]);
  });

  it("has Rans's wording (8 Nov 2026), and the spec's for the rest", () => {
    expect(practiceLine("presence")).toBe("Step 1: this photo has a sidewalk raised on a curb. Choose Yes.");
    expect(practiceLine("presence", "touch")).toBe(practiceLine("presence"));
    expect(practiceLine("openTree")).toBe("Click the dashed box on the tree.");
    expect(practiceLine("openTree", "touch")).toBe("Tap the dashed box on the tree.");
    expect(practiceLine("treeOnPath")).toBe("Is the tree on the sidewalk or the path? If it is, choose Yes.");
    expect(practiceLine("treeObstructs")).toBe("Does the object obstruct your way? You decide. The model can be wrong.");
    expect(practiceLine("carOff")).toBe("Now for the car. This is an example of objects that aren't on the sidewalk, but beside it. Please choose No.");
    expect(practiceLine("drawPost")).toBe("If you find a missed object on the sidewalk, drag a box around it whether it obstructs or not.");
    expect(practiceLine("drawPost", "touch")).toBe("If you find a missed object on the sidewalk, tap Add box and fit it, whether it obstructs or not.");
    // The hint that the post is a lamp post, as a grey note under the line
    expect(practiceLine("answerDrawn")).toBe("Pick its category, then answer both questions.");
    expect(practiceNote("answerDrawn")).toBe("Hint: this is a lamp post.");
    // The only note
    expect(PRACTICE_STEPS.map((s) => practiceNote(s.key)).filter(Boolean)).toEqual(["Hint: this is a lamp post."]);
    expect(practiceLine("scene")).toBe("Next is Step 3: questions about the sidewalk itself.");
    expect(practiceLine("scene", "touch")).toBe("Next is Step 3: questions about the sidewalk itself. Tap the Step 3 line.");
    expect(practiceLine("next")).toBe("All done. Click Next Image.");
    expect(practiceLine("next", "touch")).toBe("All done. Tap Next Image.");
    expect(PRACTICE_COPY.counter(3, 11)).toBe("Practice 3 of 11");
    expect(PRACTICE_COPY.skip).toBe("Skip practice");
    expect(PRACTICE_COPY.reminder).toBe("You can find more information by clicking the Tour button at the top of the page.");
    expect(PRACTICE_COPY.touchReminder).toBe("You can find more information by tapping the ? button at the top of the screen.");
    // After Skip practice (8 Nov 2026), and the button on the first image
    expect(PRACTICE_COPY.skipHint).toBe("Click the Practice button at the top of the page to redo the practice.");
    expect(PRACTICE_COPY.touchSkipHint).toBe("Tap ? at the top of the screen to redo the practice.");
    expect(PRACTICE_COPY.redoButton).toBe("Practice");
    expect(PRACTICE_COPY.redoTitle).toBe("Redo the practice");
  });

  it("falls back to the laptop line where touch has none, and to nothing for an unknown step", () => {
    expect(practiceLine("treeOnPath", "touch")).toBe(practiceLine("treeOnPath"));
    expect(practiceLine("nope")).toBe("");
  });
});
