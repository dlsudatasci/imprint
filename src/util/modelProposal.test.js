import { describe, it, expect } from "vitest";
import {
  PROPOSAL_HINT_COPY,
  isProposal,
  proposalHintText,
  isShownProposal,
  recordProbability,
  proposalWasShown,
} from "./modelProposal";
import { PROPOSAL_FIELDS } from "./validators/predictionUpdate.mjs";
import TUTORIAL_IMAGES from "@/data/tutorialImages";
import { DEMO_IMAGES, freshBoxes } from "@/features/home/howItWorks/demoScript";

// S3 (6 Nov 2026): the classifier's proposal as a hint on Question 2
describe("PROPOSAL_HINT_COPY", () => {
  it("keeps the decided wording word for word", () => {
    expect(PROPOSAL_HINT_COPY.obstructs).toBe("The model thinks this obstructs the sidewalk.");
    // Rans's wording (6 Nov 2026)
    expect(PROPOSAL_HINT_COPY.tutorial).toBe("Sometimes, you will see what the model thinks. It can be wrong, so answer for you and from what you can see in the photo.");
    expect(Object.isFrozen(PROPOSAL_HINT_COPY)).toBe(true);
  });

  // 6 Nov 2026: a proposal that it does not obstruct shows nothing
  it("has no line for a proposal that it does not obstruct", () => {
    expect(Object.keys(PROPOSAL_HINT_COPY).sort()).toEqual(["obstructs", "tutorial"]);
    expect(Object.values(PROPOSAL_HINT_COPY).join(" ")).not.toMatch(/does not obstruct/);
  });

  it("has no em dash or semicolon, and no number", () => {
    for (const text of Object.values(PROPOSAL_HINT_COPY)) {
      expect(text).not.toMatch(/[—;]/);
      expect(text).not.toMatch(/\d/);
    }
  });
});

describe("isProposal", () => {
  it("is true for true and false only", () => {
    expect(isProposal(true)).toBe(true);
    expect(isProposal(false)).toBe(true);
    for (const v of [undefined, null, 0, 1, "true", "false", {}, 0.7]) expect(isProposal(v)).toBe(false);
  });
});

describe("isShownProposal", () => {
  it("is true for a proposal of true only", () => {
    expect(isShownProposal(true)).toBe(true);
    for (const v of [false, undefined, null, 1, "true"]) expect(isShownProposal(v)).toBe(false);
  });
});

describe("proposalHintText", () => {
  it("gives the line for a proposal that it obstructs, and null for false or none", () => {
    expect(proposalHintText(true)).toBe(PROPOSAL_HINT_COPY.obstructs);
    for (const v of [false, undefined, null, 1, 0, "true"]) expect(proposalHintText(v)).toBeNull();
  });
});

describe("recordProbability", () => {
  it("gives a finite number, else null", () => {
    expect(recordProbability({ obstructionProbability: 0.26 })).toBe(0.26);
    expect(recordProbability({ obstructionProbability: 0 })).toBe(0);
    for (const v of [undefined, null, NaN, Infinity, "0.4"]) expect(recordProbability({ obstructionProbability: v })).toBeNull();
    expect(recordProbability(null)).toBeNull();
  });
});

describe("proposalWasShown", () => {
  const record = { id: "a", proposedObstructs: true };

  it("is true only with a record proposal that it obstructs and a Yes to Question 1", () => {
    expect(proposalWasShown(record, { onSidewalk: true })).toBe(true);
    // A proposal of false shows nothing (6 Nov 2026)
    expect(proposalWasShown({ proposedObstructs: false }, { onSidewalk: true })).toBe(false);
  });

  it("is false for a box off the path, a Not an object box, a box with no answer and a missing box", () => {
    expect(proposalWasShown(record, { onSidewalk: false })).toBe(false);
    // Not an object boxes carry no sidewalk answer
    expect(proposalWasShown(record, { comment: "not_an_object" })).toBe(false);
    expect(proposalWasShown(record, {})).toBe(false);
    expect(proposalWasShown(record, undefined)).toBe(false);
    expect(proposalWasShown(record, { onSidewalk: "true" })).toBe(false);
  });

  it("is false without a proposal on the record", () => {
    expect(proposalWasShown({ id: "a" }, { onSidewalk: true })).toBe(false);
    expect(proposalWasShown({ proposedObstructs: null }, { onSidewalk: true })).toBe(false);
    expect(proposalWasShown(undefined, { onSidewalk: true })).toBe(false);
  });

  it("is false for every annotator box", () => {
    expect(proposalWasShown(record, { onSidewalk: true }, { isAnnotator: true })).toBe(false);
  });
});

describe("the fields update-predictions.mjs writes", () => {
  it("are the ones the hint reads", () => {
    expect(PROPOSAL_FIELDS).toEqual({ obstructs: "proposedObstructs", probability: "obstructionProbability" });
  });
});

// 6 Nov 2026 (Rans): the practice's first photo shows the hint on its Tree,
// and the landing previews, which play that photo, show it too
describe("the tutorial photos", () => {
  const proposals = (img) => img.annotationList.filter((b) => "proposedObstructs" in b).map((b) => [b.id, b.comment, b.proposedObstructs]);

  it("give the first photo's Tree a proposal that it obstructs, and nothing else one", () => {
    expect(proposals(TUTORIAL_IMAGES[0])).toEqual([["tut1-box2", "tree", true]]);
    expect(TUTORIAL_IMAGES.slice(1).flatMap(proposals)).toEqual([]);
    expect(JSON.stringify(TUTORIAL_IMAGES)).not.toContain("obstructionProbability");
  });

  it("reach the landing previews' boxes: the Tree's proposal, and nothing on the others", () => {
    expect(freshBoxes(0).filter((b) => "proposedObstructs" in b).map((b) => [b.id, b.proposedObstructs])).toEqual([["tut1-box2", true]]);
    for (let i = 1; i < DEMO_IMAGES.length; i++) {
      for (const box of freshBoxes(i)) expect(box).not.toHaveProperty("proposedObstructs");
    }
  });
});
