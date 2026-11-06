// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import DefaultInputSection, { type IDefaultInputSection } from "./DefaultInputSection";
import { PROPOSAL_HINT_COPY } from "@/util/modelProposal";

/**
 * The obstruction classifier's proposal as a hint (S3, 6 Nov 2026): one small
 * muted line between Question 2 and its Yes and No, for a suggestion whose
 * record proposes that it obstructs. A proposal of false shows nothing
 * (Rans, 6 Nov 2026). Nowhere else, never the probability, and never a
 * chosen answer.
 */
const HANDLERS = [
  "onChange", "onDelete", "onSelectObstruction", "onUnselectObstruction", "onMarkNotAnObject", "onSetSeverity",
  "onSetObstructs", "onClose", "onClearObstruction", "onRestoreObject", "onSetOnSidewalk", "onChangeSeverity",
] as const;
type Handlers = Record<(typeof HANDLERS)[number], ReturnType<typeof vi.fn>>;

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function unmount() {
  act(() => root?.unmount());
  root = null;
  host?.remove();
}

afterEach(unmount);

/** A suggestion on the path, so Question 2 shows, unless the props say otherwise */
function mount(props: Partial<IDefaultInputSection>) {
  unmount();
  const handlers = Object.fromEntries(HANDLERS.map((name) => [name, vi.fn()])) as Handlers;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <DefaultInputSection
        value="tree"
        editable={false}
        selected={false}
        isRejected={false}
        obstructs={undefined}
        severity={null}
        askSeverity
        onSidewalk
        {...(handlers as unknown as IDefaultInputSection)}
        {...props}
      />
    )
  );
  return handlers;
}

const hint = () => host.querySelector("[data-proposal-hint]");
const hintText = () => hint()?.textContent ?? null;
const control = (name: string) => host.querySelector(`[data-control="${name}"]`) as HTMLButtonElement | null;
const step = () => host.querySelector("[data-question-step]")?.textContent ?? null;
const press = (el: HTMLElement | null) => act(() => el!.click());
const pressed = (name: string) => control(name)?.getAttribute("aria-pressed") === "true";
const called = (handlers: Handlers) => HANDLERS.filter((name) => handlers[name].mock.calls.length > 0);
/** The Yes and No buttons as rendered, in order, with their classes */
const answerButtons = () =>
  Array.from(host.querySelectorAll('[data-control="yes"], [data-control="no"]')).map((b) => ({ text: b.textContent, className: b.className, pressed: b.getAttribute("aria-pressed") }));

const VARIANTS = ["floating", "sheet"] as const;

describe("the classifier's proposal on Question 2 (S3)", () => {
  it("says the model thinks it obstructs, for a proposal of true, on the laptop card and the phone sheet", () => {
    for (const variant of VARIANTS) {
      mount({ proposedObstructs: true, variant });
      expect(step()).toBe("Question 2 of 2");
      expect(hintText()).toBe("The model thinks this obstructs the sidewalk.");
      expect(hintText()).toBe(PROPOSAL_HINT_COPY.obstructs);
    }
  });

  it("shows nothing new for a proposal of false or without a proposal", () => {
    for (const variant of VARIANTS) {
      for (const proposedObstructs of [false, undefined, null]) {
        mount({ proposedObstructs, variant });
        expect(step()).toBe("Question 2 of 2");
        expect(hint()).toBeNull();
        expect(host.textContent).not.toMatch(/model/i);
      }
    }
  });

  it("sits between the question and Yes and No, smaller than the question and muted", () => {
    mount({ proposedObstructs: true });
    const question = Array.from(host.querySelectorAll("p")).find((p) => p.textContent?.startsWith("Does "))!;
    expect(question.className).toContain("text-base font-semibold");
    // Right after the question, before the buttons
    expect(question.nextElementSibling).toBe(hint());
    expect(hint()!.nextElementSibling!.querySelector('[data-control="yes"]')).not.toBeNull();
    expect(hint()!.className).toContain("text-sm");
    expect(hint()!.className).toContain("text-muted");
    expect(hint()!.className).not.toMatch(/font-(semibold|bold)|text-base/);
  });

  it("never shows the probability, a confidence or the threshold", () => {
    for (const proposedObstructs of [true]) {
      mount({ proposedObstructs });
      expect(hintText()).not.toMatch(/\d|%|confiden|probab|likel|τ/i);
      // Nothing else on the panel carries a number but the step line and Back to Question 1
      const rest = (host.textContent ?? "").replace("Question 2 of 2", "").replace("Back to Question 1", "");
      expect(rest).not.toMatch(/\d|%|confiden|probab|τ/i);
    }
  });

  it("chooses nothing for the contributor: neither button pressed, highlighted or moved, and the answer empty", () => {
    mount({});
    const without = answerButtons();
    for (const proposedObstructs of [true, false]) {
      const handlers = mount({ proposedObstructs });
      expect(answerButtons()).toEqual(without);
      expect(pressed("yes")).toBe(false);
      expect(pressed("no")).toBe(false);
      expect(answerButtons().map((b) => b.text)).toEqual(["Yes", "No"]);
      expect(called(handlers)).toEqual([]);
    }
  });

  it("stays beside an answer the contributor gave, with that answer, not the proposal, chosen", () => {
    // Reopened after a No to Question 2, against a proposal of true
    mount({ proposedObstructs: true, isRejected: true });
    expect(hintText()).toBe(PROPOSAL_HINT_COPY.obstructs);
    expect(pressed("no")).toBe(true);
    expect(pressed("yes")).toBe(false);
  });

  it("shows on Question 2 reached with Back to Question 2 from a confirmed obstruction, and not on its severity scale", () => {
    for (const variant of VARIANTS) {
      for (const proposedObstructs of [true, false]) {
        const shown = proposedObstructs ? PROPOSAL_HINT_COPY.obstructs : null;
        const handlers = mount({ proposedObstructs, variant, selected: true, obstructs: true, severity: 3 });
        // The severity panel first: no hint
        expect(host.querySelector("[data-severity-panel]")).not.toBeNull();
        expect(hint()).toBeNull();
        press(control("back-to-question-2"));
        expect(step()).toBe("Question 2 of 2");
        expect(hintText()).toBe(shown);
        // Going back changes nothing
        expect(called(handlers)).toEqual([]);
        // Yes returns to the severity scale, without the hint
        press(control("yes"));
        expect(host.querySelector("[data-severity-panel]")).not.toBeNull();
        expect(hint()).toBeNull();
      }
    }
  });

  it("is not on Question 1, asked first or reached with Back to Question 1", () => {
    for (const variant of VARIANTS) {
      // Asked first: no sidewalk answer yet
      mount({ proposedObstructs: true, variant, onSidewalk: undefined });
      expect(step()).toBe("Question 1 of 2");
      expect(hint()).toBeNull();
      // Answered No to Question 1 and reopened
      mount({ proposedObstructs: false, variant, onSidewalk: false, isRejected: true });
      expect(step()).toBe("Question 1 of 2");
      expect(hint()).toBeNull();
      // Back to Question 1 from Question 2
      mount({ proposedObstructs: true, variant });
      expect(hint()).not.toBeNull();
      press(control("back-to-question-1"));
      expect(step()).toBe("Question 1 of 2");
      expect(hint()).toBeNull();
      // Yes there returns to Question 2 and its hint
      press(control("on-sidewalk-yes"));
      expect(step()).toBe("Question 2 of 2");
      expect(hint()).not.toBeNull();
    }
  });

  it("is not on the first severity picker or the severity panel", () => {
    for (const variant of VARIANTS) {
      // A first Yes: the picker with Confirm
      mount({ proposedObstructs: true, variant, selected: true, obstructs: true, severity: null });
      expect(control("confirm")).not.toBeNull();
      expect(hint()).toBeNull();
      expect(host.textContent).not.toMatch(/model/i);
      // A confirmed obstruction: its severity panel
      mount({ proposedObstructs: true, variant, selected: true, obstructs: true, severity: 4 });
      expect(host.querySelector("[data-severity-panel]")).not.toBeNull();
      expect(hint()).toBeNull();
      expect(host.textContent).not.toMatch(/model/i);
    }
  });

  it("is never on a drawn box, even one handed a proposal, at any level", () => {
    for (const variant of VARIANTS) {
      const drawn = { editable: true, value: "bollard", proposedObstructs: true, variant } as const;
      mount(drawn);
      expect(step()).toBe("Question 2 of 2");
      expect(hint()).toBeNull();
      mount({ ...drawn, obstructs: false });
      expect(hint()).toBeNull();
      mount({ ...drawn, obstructs: true, severity: 2 });
      press(control("back-to-question-2"));
      expect(step()).toBe("Question 2 of 2");
      expect(hint()).toBeNull();
    }
  });

  it("is not on a Not an object panel", () => {
    for (const variant of VARIANTS) {
      mount({ proposedObstructs: true, variant, value: "not_an_object", isRejected: true, obstructs: false, onSidewalk: undefined, originalComment: "tree" });
      expect(host.textContent).toContain("Not an object");
      expect(hint()).toBeNull();
      expect(host.textContent).not.toMatch(/model/i);
    }
  });

  it("is not shown without the path question (annotators' panel)", () => {
    mount({ proposedObstructs: true, askOnSidewalk: false, askSeverity: false });
    expect(step()).toBeNull();
    expect(host.textContent).toContain("obstruct the sidewalk?");
    expect(hint()).toBeNull();
  });
});
