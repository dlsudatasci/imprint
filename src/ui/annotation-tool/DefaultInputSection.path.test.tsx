// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import DefaultInputSection, { type IDefaultInputSection } from "./DefaultInputSection";
import { PROPOSAL_HINT_COPY } from "@/util/modelProposal";

/**
 * Only a path (S15, 9 Nov 2026): Step 1 says the photo has no sidewalk, so
 * the box panel skips "Is it on the sidewalk or the path people walk on?".
 * The one question is "Does {label} obstruct the path?", with no step line,
 * no Back to Question 1, and Question 1's footer (Not an object for a
 * suggestion, Delete box for a drawn box). A confirmed obstruction's severity
 * panel goes "Back to the question". Without pathOnly every panel is as it was.
 * A path box has no onSidewalk, so the panels here are given none.
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
        {...(handlers as unknown as IDefaultInputSection)}
        {...props}
      />
    )
  );
  return handlers;
}

const control = (name: string) => host.querySelector(`[data-control="${name}"]`) as HTMLButtonElement | null;
const buttonText = (text: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
const text = () => host.textContent ?? "";
const press = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());

describe("the box panel with only a path (pathOnly)", () => {
  it("asks a suggestion only whether it obstructs the path, with no step line and Not an object in its footer", () => {
    const handlers = mount({ pathOnly: true });
    expect(text()).toContain("Does Tree obstruct the path?");
    expect(host.querySelector(".font-bold")?.textContent).toBe("Tree");
    expect(control("on-sidewalk-yes")).toBeNull();
    expect(text()).not.toContain("Is it on the sidewalk");
    expect(host.querySelector("[data-question-step]")).toBeNull();
    expect(text()).not.toContain("Back to Question 1");
    press(buttonText("Not an object"));
    expect(handlers.onMarkNotAnObject).toHaveBeenCalledTimes(1);
    expect(handlers.onSetOnSidewalk).not.toHaveBeenCalled();
  });

  it("answers Yes and No as today: Yes for the severity picker, No closes", () => {
    let handlers = mount({ pathOnly: true });
    press(control("yes"));
    expect(handlers.onSelectObstruction).toHaveBeenCalledTimes(1);
    handlers = mount({ pathOnly: true });
    press(control("no"));
    expect(handlers.onUnselectObstruction).toHaveBeenCalledTimes(1);
    // A first Yes opens the same severity picker
    mount({ pathOnly: true, selected: true, obstructs: true, severity: null });
    expect(text()).toContain("How severe is this obstruction?");
  });

  it("gives a drawn box Delete box in its footer and no Back to Question 1", () => {
    const handlers = mount({ pathOnly: true, editable: true, value: "bollard" });
    expect(text()).toContain("Does Bollard obstruct the path?");
    expect(text()).toContain("Drawn by you");
    expect(text()).not.toContain("Back to Question 1");
    expect(host.querySelector("[data-question-step]")).toBeNull();
    press(buttonText("Delete box"));
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    press(control("yes"));
    expect(handlers.onSetObstructs).toHaveBeenCalledWith(true);
  });

  it("reopens a confirmed obstruction on its severity with Back to the question, which shows the question with Yes chosen", () => {
    mount({ pathOnly: true, selected: true, obstructs: true, severity: 2 });
    expect(host.querySelector("[data-severity-panel]")).not.toBeNull();
    expect(text()).toContain("Back to the question");
    expect(text()).not.toContain("Back to Question 2");
    press(control("back-to-question-2"));
    expect(text()).toContain("Does Tree obstruct the path?");
    expect(control("yes")!.getAttribute("aria-pressed")).toBe("true");
    expect(text()).not.toContain("Back to Question 1");
  });

  it("shows the model's hint for the path on a suggestion proposed to obstruct, never on a drawn box", () => {
    mount({ pathOnly: true, proposedObstructs: true });
    expect(host.querySelector("[data-proposal-hint]")?.textContent).toBe(PROPOSAL_HINT_COPY.obstructsPath);
    expect(PROPOSAL_HINT_COPY.obstructsPath).toBe("The model thinks this obstructs the path.");
    mount({ pathOnly: true, proposedObstructs: false });
    expect(host.querySelector("[data-proposal-hint]")).toBeNull();
    mount({ pathOnly: true, editable: true, value: "bollard", proposedObstructs: true });
    expect(host.querySelector("[data-proposal-hint]")).toBeNull();
  });

  it("has no close button, as for every contributor panel", () => {
    mount({ pathOnly: true, isRejected: true, obstructs: false });
    expect(host.querySelector('[aria-label="Close"]')).toBeNull();
  });

  it("leaves a box marked Not an object as it was", () => {
    mount({ pathOnly: true, value: "not_an_object", isRejected: true, obstructs: false, originalComment: "tree" });
    expect(text()).toContain("Not an object");
    expect(text()).toContain("Restore");
  });
});

describe("the box panel for a sidewalk, without pathOnly", () => {
  it("still asks Question 1 first, with its step line", () => {
    mount({});
    expect(control("on-sidewalk-yes")).not.toBeNull();
    expect(host.querySelector("[data-question-step]")?.textContent).toBe("Question 1 of 2");
  });

  it("still words the obstruction question, its hint and its ways back for the sidewalk", () => {
    mount({ onSidewalk: true, proposedObstructs: true });
    expect(text()).toContain("Does Tree obstruct the sidewalk?");
    expect(host.querySelector("[data-question-step]")?.textContent).toBe("Question 2 of 2");
    expect(host.querySelector("[data-proposal-hint]")?.textContent).toBe(PROPOSAL_HINT_COPY.obstructs);
    expect(text()).toContain("Back to Question 1");
    mount({ onSidewalk: true, selected: true, obstructs: true, severity: 2 });
    expect(text()).toContain("Back to Question 2");
  });
});
