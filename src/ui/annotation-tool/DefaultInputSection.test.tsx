// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import DefaultInputSection, { type IDefaultInputSection } from "./DefaultInputSection";

// Contributor box panel (7 Oct 2026): one question for every box, No closes,
// Yes goes to the severity picker, Not an object and Delete are buttons. From
// 2 Nov 2026 (S12) the sidewalk question comes first: render() gives a box
// already answered on the sidewalk, so the obstruction question shows.
const noop = () => undefined;
function render(props: Partial<IDefaultInputSection>) {
  return renderToStaticMarkup(
    <DefaultInputSection
      value="tree"
      onChange={noop}
      onDelete={noop}
      onSelectObstruction={noop}
      onUnselectObstruction={noop}
      onMarkNotAnObject={noop}
      onSetSeverity={noop}
      onSetObstructs={noop}
      onClose={noop}
      onClearObstruction={noop}
      onRestoreObject={noop}
      editable={false}
      selected={false}
      isRejected={false}
      obstructs={undefined}
      severity={null}
      askSeverity
      onSidewalk
      {...props}
    />
  );
}

const pressed = (html: string, label: "Yes" | "No") =>
  new RegExp(`aria-pressed="true"[^>]*>${label}<`).test(html);
const disabledButton = (html: string, label: "Yes" | "No") =>
  new RegExp(`<button[^>]*disabled=""[^>]*>${label}<`).test(html);

describe("DefaultInputSection", () => {
  it("offers a new drawn box only the category, the question, Back to Question 1 and Delete, with no checkmark or close", () => {
    const html = render({ editable: true, value: "---" });
    expect(html).toContain("Select a category");
    expect(html).toContain("Does <span class=\"font-bold\">this object</span> obstruct the sidewalk?");
    expect(disabledButton(html, "Yes")).toBe(true);
    expect(disabledButton(html, "No")).toBe(true);
    expect(html).toContain("Delete box");
    // Back to Question 1 takes the left of the footer (S17)
    expect(html).toContain(">Back to Question 1</button>");
    expect(html).not.toContain("Drawn by you");
    expect(html).not.toContain('aria-label="Close"');
    expect(html).not.toContain('title="Confirm"');
    expect(html).not.toContain("Not an object");
  });

  it("lets a drawn box be answered once it has a category, still with no close", () => {
    const html = render({ editable: true, value: "bollard" });
    expect(disabledButton(html, "Yes")).toBe(false);
    expect(disabledButton(html, "No")).toBe(false);
    expect(html).toContain(">Bollard</span> obstruct the sidewalk?");
    expect(html).not.toContain('aria-label="Close"');
  });

  it("sends a drawn box answered Yes to the same severity picker as a suggestion", () => {
    const drawnYes = render({ editable: true, value: "bollard", obstructs: true, severity: null });
    const suggestionYes = render({ selected: true, obstructs: true, severity: null });
    for (const html of [drawnYes, suggestionYes]) {
      expect(html).toContain("How severe is this obstruction?");
      expect(html).toContain(">Confirm<");
      expect(html).toContain(">Go back<");
      expect(html).not.toContain("—");
    }
  });

  // No close button from S17 (Rans, 4 Nov 2026): a click on the photo closes the panel
  it("shows an answered drawn box with its answer and no close button", () => {
    const no = render({ editable: true, value: "bollard", obstructs: false });
    expect(pressed(no, "No")).toBe(true);
    expect(pressed(no, "Yes")).toBe(false);
    expect(no).not.toContain('aria-label="Close"');
    // A Yes with a severity opens on its severity scale (S17)
    const yes = render({ editable: true, value: "bollard", obstructs: true, severity: 4 });
    expect(yes).toContain("data-severity-panel");
    expect(yes).not.toContain('aria-label="Close"');
    expect(yes).toContain("4 · Difficult to pass");
    expect(yes).not.toContain(">Change<");
  });

  it("gives a suggestion a Not an object button at Question 1, not a category entry", () => {
    const html = render({ onSidewalk: undefined });
    expect(html).toContain("No real object in this box?");
    expect(html).toMatch(/<button[^>]*>Not an object<\/button>/);
    expect(html).not.toContain('value="not_an_object"');
    expect(html).not.toContain("wrong box");
    expect(html).not.toContain("Delete box");
    // Undecided: neither answer chosen, and no close yet
    expect(pressed(html, "Yes")).toBe(false);
    expect(pressed(html, "No")).toBe(false);
    expect(html).not.toContain('aria-label="Close"');
  });

  it("shows a suggestion's answer when reopened", () => {
    const no = render({ isRejected: true, obstructs: false });
    expect(pressed(no, "No")).toBe(true);
    expect(no).not.toContain('aria-label="Close"');
    const yes = render({ selected: true, obstructs: true, severity: 3 });
    expect(yes).toContain("data-severity-panel");
    expect(yes).toContain("3 · Significant narrowing");
    expect(yes).not.toContain(">Change<");
  });

  it("shows a box marked Not an object with its suggested name and a way to restore it (8 Oct 2026)", () => {
    const html = render({ value: "not_an_object", isRejected: true, obstructs: false, originalComment: "car" });
    expect(html).toMatch(/>Not an object<\/span>/);
    expect(html).toContain("Suggested as Car. This box won&#x27;t be counted.");
    expect(html).toContain("A real object after all?");
    expect(html).toMatch(/<button[^>]*>Restore<\/button>/);
    // No close button from S17 (Rans, 4 Nov 2026)
    expect(html).not.toContain('aria-label="Close"');
    expect(html).not.toContain("Undo");
    expect(html).not.toContain("left out of the data");
    expect(html).not.toContain("obstruct the sidewalk?");
    // Without a suggested name, only what happens to the box
    const bare = render({ value: "not_an_object", isRejected: true, obstructs: false });
    expect(bare).toContain(">This box won&#x27;t be counted.<");
    expect(bare).not.toContain("Suggested as");
  });

  // Phones and tablets (9 Oct 2026): the panel in the answers sheet
  it("fills the sheet's width with 16 px category fields and 44 px buttons in the sheet variant", () => {
    const sheet = render({ variant: "sheet", editable: true, value: "bollard", obstructs: false });
    expect(sheet).not.toContain("w-[280px]");
    expect(sheet).not.toContain("shadow-2xl");
    expect(sheet).toMatch(/<select[^>]*class="[^"]*text-base/);
    expect(sheet).toMatch(/<button[^>]*class="[^"]*min-h-\[44px\][^"]*"[^>]*>Yes</);
    expect(sheet).toMatch(/<button[^>]*class="[^"]*min-h-\[44px\][^"]*"[^>]*>Delete box</);
    // The close button where a panel still has one: without the path question
    const noPath = render({ variant: "sheet", askOnSidewalk: false, onSidewalk: undefined, editable: true, value: "bollard", obstructs: false });
    expect(noPath).toMatch(/w-11 h-11[^"]*"[^>]*aria-label="Close"|aria-label="Close"[^>]*class="[^"]*w-11 h-11/);
    const typed = render({ variant: "sheet", editable: true, value: "fire hydrant cover" });
    expect(typed).toMatch(/<input[^>]*class="[^"]*text-base/);
    const picker = render({ variant: "sheet", selected: true, obstructs: true, severity: null });
    expect(picker).not.toContain("w-[260px]");
    expect(picker).toMatch(/min-h-\[44px\][^"]*"[^>]*>Confirm</);
    // The floating panel is as it was
    const floating = render({ editable: true, value: "bollard" });
    expect(floating).toContain("w-[280px]");
    expect(floating).toMatch(/<select[^>]*class="[^"]*text-sm/);
    expect(floating).not.toContain("min-h-[44px]");
    // 16 px only on the question (S18), not the fields
    expect(floating).not.toMatch(/<(select|input)[^>]*text-base/);
  });

  // S12 (2 Nov 2026): whether the object is on the sidewalk, before whether it obstructs
  describe("the sidewalk question", () => {
    const sidewalkButton = (html: string, answer: "yes" | "no") =>
      new RegExp(`<button data-control="on-sidewalk-${answer}"[^>]*>${answer === "yes" ? "Yes" : "No"}<`).test(html);

    it("asks a suggestion with no sidewalk answer first, in the copy module's words, with Not an object as today", () => {
      const html = render({ onSidewalk: undefined });
      expect(html).toContain(">Is it on the sidewalk?<");
      expect(html).not.toContain("obstruct the sidewalk?");
      expect(sidewalkButton(html, "yes")).toBe(true);
      expect(sidewalkButton(html, "no")).toBe(true);
      expect(pressed(html, "Yes")).toBe(false);
      expect(pressed(html, "No")).toBe(false);
      expect(html).toMatch(/<button[^>]*>Not an object<\/button>/);
      expect(html).not.toContain('aria-label="Close"');
      expect(html).not.toContain(">Go back<");
    });

    it("asks a drawn box after its category, with Delete box", () => {
      const noCategory = render({ onSidewalk: undefined, editable: true, value: "---" });
      expect(noCategory).toContain("Select a category");
      expect(noCategory).toContain("Is it on the sidewalk?");
      expect(disabledButton(noCategory, "Yes")).toBe(true);
      expect(disabledButton(noCategory, "No")).toBe(true);
      expect(noCategory).toContain("Delete box");
      const withCategory = render({ onSidewalk: undefined, editable: true, value: "bollard" });
      expect(disabledButton(withCategory, "Yes")).toBe(false);
      expect(disabledButton(withCategory, "No")).toBe(false);
    });

    it("asks it again, with No chosen and no close button, of a box reopened from Not on the walking path", () => {
      for (const html of [
        render({ onSidewalk: false, isRejected: true, obstructs: false }),
        render({ onSidewalk: false, editable: true, value: "bollard", obstructs: false }),
      ]) {
        expect(html).toContain("Is it on the sidewalk?");
        expect(pressed(html, "No")).toBe(true);
        expect(pressed(html, "Yes")).toBe(false);
        expect(html).not.toContain('aria-label="Close"');
      }
    });

    it("asks it of a box answered Yes or No before the question existed", () => {
      expect(render({ onSidewalk: undefined, selected: true, obstructs: true, severity: 3 })).toContain("Is it on the sidewalk");
    });

    // S17 (4 Nov 2026): Back to Question 1 in the footer replaced Go back
    it("gives the obstruction question Back to Question 1 in its footer, with no Go back and no Not an object", () => {
      for (const html of [render({}), render({ isRejected: true, obstructs: false }), render({ editable: true, value: "bollard" }), render({ editable: true, value: "bollard", obstructs: false })]) {
        expect(html).toContain("obstruct the sidewalk?");
        expect(html).toMatch(/<div class="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2"><button data-control="back-to-question-1"[^>]*><svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Back to Question 1<\/button>/);
        expect(html).not.toContain(">Go back<");
        expect(html).not.toContain("Not an object");
        expect(html).not.toContain("No real object in this box?");
      }
      expect(render({ askOnSidewalk: false, onSidewalk: undefined })).not.toContain("Back to Question");
    });

    it("never asks it of a box marked Not an object", () => {
      const html = render({ onSidewalk: undefined, value: "not_an_object", isRejected: true, obstructs: false });
      expect(html).not.toContain("Is it on the sidewalk");
      expect(html).toMatch(/<button[^>]*>Restore<\/button>/);
    });

    it("uses the same buttons as the obstruction question, 44 px tall in the sheet", () => {
      const sheet = render({ variant: "sheet", onSidewalk: undefined });
      expect(sheet).toMatch(/<button data-control="on-sidewalk-yes"[^>]*class="py-2 min-h-\[44px\] rounded-control/);
      const floating = render({ onSidewalk: undefined });
      const obstruction = render({});
      const classOf = (html: string, control: string) => html.match(new RegExp(`data-control="${control}" class="([^"]*)"`))?.[1];
      expect(classOf(floating, "on-sidewalk-yes")).toBe(classOf(obstruction, "yes"));
      expect(classOf(floating, "on-sidewalk-no")).toBe(classOf(obstruction, "no"));
    });
  });

  // S16 (3 Nov 2026): the first pilot participants took the first Yes or No
  // for the obstruction question
  describe("which of the two questions is on screen", () => {
    const label = (html: string) => html.match(/<p data-question-step="(\d)" class="([^"]*)">([^<]*)<\/p>/);

    it("says Question 1 of 2 above the path question, desktop panel and phone sheet alike", () => {
      for (const variant of ["floating", "sheet"] as const) {
        for (const html of [render({ variant, onSidewalk: undefined }), render({ variant, onSidewalk: undefined, editable: true, value: "bollard" }), render({ variant, onSidewalk: false, isRejected: true, obstructs: false })]) {
          const found = label(html);
          expect(found?.[1]).toBe("1");
          expect(found?.[3]).toBe("Question 1 of 2");
          expect(found?.[2]).toBe("text-xs font-semibold text-muted mt-3");
          // Right above the question
          expect(html).toMatch(/Question 1 of 2<\/p><p class="text-base font-semibold text-ink mt-0\.5 mb-2">Is it on the sidewalk\?<\/p>/);
        }
      }
    });

    it("says Question 2 of 2 above the obstruction question", () => {
      for (const variant of ["floating", "sheet"] as const) {
        for (const html of [render({ variant }), render({ variant, editable: true, value: "bollard" }), render({ variant, isRejected: true, obstructs: false })]) {
          expect(label(html)?.[3]).toBe("Question 2 of 2");
          expect(html).toMatch(/Question 2 of 2<\/p><p class="text-base font-semibold text-ink mt-0\.5 mb-2">Does <span/);
        }
      }
    });

    it("shows no label without the path question, and keeps the question where it was", () => {
      const html = render({ askOnSidewalk: false, onSidewalk: undefined });
      expect(html).toContain("obstruct the sidewalk?");
      expect(html).not.toContain("data-question-step");
      expect(html).not.toMatch(/Question \d of 2/);
      expect(html).toContain('<p class="text-base font-semibold text-ink mt-3 mb-2">Does <span');
    });

    it("shows no label on the severity picker or a box marked Not an object", () => {
      expect(render({ selected: true, obstructs: true, severity: null })).not.toContain("data-question-step");
      expect(render({ value: "not_an_object", isRejected: true, obstructs: false })).not.toContain("data-question-step");
    });
  });

  // Rans (4 Nov 2026): no contributor panel has a close button, a click or a
  // tap on the photo closes it. Without the path question, as before.
  it("gives no contributor panel a close button, on the laptop card or the phone sheet", () => {
    for (const variant of ["floating", "sheet"] as const) {
      const states = [
        render({ variant, onSidewalk: undefined }),
        render({ variant, onSidewalk: false, isRejected: true, obstructs: false }),
        render({ variant, onSidewalk: false, editable: true, value: "bollard", obstructs: false }),
        render({ variant }),
        render({ variant, isRejected: true, obstructs: false }),
        render({ variant, editable: true, value: "bollard", obstructs: false }),
        render({ variant, selected: true, obstructs: true, severity: 3 }),
        render({ variant, editable: true, value: "bollard", obstructs: true, severity: 3 }),
        render({ variant, value: "not_an_object", isRejected: true, obstructs: false, originalComment: "car" }),
      ];
      for (const html of states) expect(html).not.toContain('aria-label="Close"');
      for (const html of [
        render({ variant, askOnSidewalk: false, askSeverity: false, onSidewalk: undefined, isRejected: true, obstructs: false }),
        render({ variant, askOnSidewalk: false, askSeverity: false, onSidewalk: undefined, value: "not_an_object", isRejected: true, obstructs: false }),
      ]) expect(html).toContain('aria-label="Close"');
    }
  });

  // S18 (4 Nov 2026), from pilot participant 4
  describe("red remove buttons and larger questions (S18)", () => {
    const DANGER = "px-2.5 py-1.5 rounded-control text-xs font-semibold border border-danger/50 bg-surface text-danger hover:bg-danger/10 transition-colors";
    const buttonClass = (html: string, label: string) => html.match(new RegExp(`<button class="([^"]*)">${label}</button>`))?.[1];

    it("makes Not an object and Delete box red outline buttons, the same size as before, 44 px in the sheet", () => {
      for (const variant of ["floating", "sheet"] as const) {
        const notAnObject = buttonClass(render({ variant, onSidewalk: undefined }), "Not an object");
        const deleteBox = [
          render({ variant, onSidewalk: undefined, editable: true, value: "bollard" }),
          render({ variant, editable: true, value: "bollard" }),
          render({ variant, editable: true, value: "bollard", obstructs: true, severity: 2 }),
        ].map((html) => buttonClass(html, "Delete box"));
        for (const cls of [notAnObject, ...deleteBox]) {
          expect(cls).toBe(variant === "sheet" ? `${DANGER} min-h-[44px] px-3.5` : DANGER);
          // Outlined, not filled
          expect(cls).not.toMatch(/\bbg-danger\b(?!\/)/);
        }
      }
    });

    it("keeps the footer's hint grey, Restore grey and the Back buttons plain", () => {
      expect(render({ onSidewalk: undefined })).toContain('<span class="text-xs text-muted">No real object in this box?</span>');
      const restore = buttonClass(render({ value: "not_an_object", isRejected: true, obstructs: false }), "Restore");
      expect(restore).toContain("border-line bg-surface-subtle text-ink");
      expect(restore).not.toContain("danger");
      expect(render({})).toMatch(/<button data-control="back-to-question-1" class="[^"]*text-muted[^"]*">/);
    });

    it("sets every question at 16 px semibold ink, laptop card and phone sheet, with the category bold and the step line small", () => {
      for (const variant of ["floating", "sheet"] as const) {
        const paths = render({ variant, onSidewalk: undefined });
        expect(paths).toContain('<p class="text-base font-semibold text-ink mt-0.5 mb-2">Is it on the sidewalk?</p>');
        const obstruction = render({ variant, value: "car" });
        expect(obstruction).toContain('<p class="text-base font-semibold text-ink mt-0.5 mb-2">Does <span class="font-bold">Car</span> obstruct the sidewalk?</p>');
        // The severity panel and the first severity picker match
        expect(render({ variant, selected: true, obstructs: true, severity: 2 })).toContain('<p class="text-base font-semibold text-ink mt-3 mb-3">How severe is this obstruction?</p>');
        expect(render({ variant, selected: true, obstructs: true, severity: null })).toContain('<p class="text-base font-semibold text-ink mb-3 text-center">How severe is this obstruction?</p>');
        // "Question 1 of 2" stays small
        expect(paths).toContain('<p data-question-step="1" class="text-xs font-semibold text-muted mt-3">');
        expect(paths).not.toContain("text-sm text-body");
      }
    });
  });

  // 10 Oct 2026: the open box can be hidden from its panel
  it("offers a Hide button when the box can be hidden, and none otherwise", () => {
    const hideButton = /<button[^>]*aria-label="Hide this box on the photo"/;
    expect(render({ onHide: noop })).toMatch(hideButton);
    expect(render({ onHide: noop, editable: true, value: "bollard" })).toMatch(hideButton);
    expect(render({ onHide: noop, value: "not_an_object", isRejected: true, obstructs: false })).toMatch(hideButton);
    expect(render({ onHide: noop, variant: "sheet" })).toMatch(/w-11 h-11[^"]*"[^>]*title="Hide this box on the photo"/);
    expect(render({})).not.toMatch(hideButton);
  });

  it("has no em dash or semicolon in its copy", () => {
    const states = [
      render({ onSidewalk: undefined }),
      render({ onSidewalk: false, isRejected: true, obstructs: false }),
      render({ onSidewalk: undefined, editable: true, value: "---" }),
      render({ editable: true, value: "---" }),
      render({}),
      render({ selected: true, obstructs: true, severity: 5 }),
      render({ editable: true, value: "bollard", obstructs: true, severity: 2 }),
      render({ isRejected: true, obstructs: false }),
      render({ value: "not_an_object", isRejected: true, obstructs: false }),
      render({ selected: true, obstructs: true, severity: null }),
    ];
    for (const html of states) {
      // The visible text: no styles or tags, and HTML entities such as &#x27;
      // (whose own ";" is not copy) decoded
      const text = html
        .replace(/<style>[\s\S]*?<\/style>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
      expect(text).not.toContain("—");
      expect(text).not.toContain(";");
    }
  });
});

// S17 (4 Nov 2026), from pilot participant 3: going back a question changes
// nothing until a new answer is picked, and a confirmed obstruction opens on
// its severity scale, saved when the slider is let go. Mounted in jsdom so
// the buttons can be pressed.
describe("changing an answer (S17)", () => {
  let root: Root | null = null;
  let host: HTMLDivElement;

  beforeAll(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
  });

  const HANDLERS = [
    "onChange", "onDelete", "onSelectObstruction", "onUnselectObstruction", "onMarkNotAnObject", "onSetSeverity",
    "onSetObstructs", "onClose", "onClearObstruction", "onRestoreObject", "onSetOnSidewalk", "onChangeSeverity",
  ] as const;
  type Handlers = Record<(typeof HANDLERS)[number], ReturnType<typeof vi.fn>>;

  function mount(props: Partial<IDefaultInputSection>) {
    const handlers = Object.fromEntries(HANDLERS.map((name) => [name, vi.fn()])) as Handlers;
    const element = (more: Partial<IDefaultInputSection>) => (
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
        {...more}
      />
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(element({})));
    return { handlers, rerender: (more: Partial<IDefaultInputSection>) => act(() => root!.render(element(more))) };
  }

  const control = (name: string) => host.querySelector(`[data-control="${name}"]`) as HTMLButtonElement | null;
  const buttonText = (text: string) =>
    Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
  const press = (el: HTMLElement | null | undefined) => act(() => el!.click());
  const step = () => host.querySelector("[data-question-step]")?.textContent ?? null;
  const isPressed = (name: string) => control(name)?.getAttribute("aria-pressed") === "true";
  const severityPanel = () => host.querySelector("[data-severity-panel]");
  const slider = () => host.querySelector('input[aria-label="Severity"]') as HTMLInputElement;
  const called = (handlers: Handlers) => HANDLERS.filter((name) => handlers[name].mock.calls.length > 0);
  const text = () => host.textContent ?? "";

  const SUGGESTION_YES = { selected: true, obstructs: true, severity: 2 } as const;
  const DRAWN_YES = { editable: true, value: "bollard", obstructs: true, severity: 2 } as const;

  describe("Back to Question 1", () => {
    it("shows Question 1 with Yes chosen and calls no handler, for an unanswered Question 2 and one answered No", () => {
      for (const props of [{}, { isRejected: true, obstructs: false }, { editable: true, value: "bollard" }, { editable: true, value: "bollard", obstructs: false }]) {
        const { handlers } = mount(props);
        expect(step()).toBe("Question 2 of 2");
        press(control("back-to-question-1"));
        expect(step()).toBe("Question 1 of 2");
        expect(text()).toContain("Is it on the sidewalk?");
        expect(isPressed("on-sidewalk-yes")).toBe(true);
        expect(isPressed("on-sidewalk-no")).toBe(false);
        expect(called(handlers)).toEqual([]);
        act(() => root!.unmount());
        root = null;
        host.remove();
      }
    });

    it("Yes there returns to Question 2 with nothing changed, and never answers Question 1 again", () => {
      const { handlers } = mount({ isRejected: true, obstructs: false });
      press(control("back-to-question-1"));
      press(control("on-sidewalk-yes"));
      expect(step()).toBe("Question 2 of 2");
      expect(isPressed("no")).toBe(true);
      expect(called(handlers)).toEqual([]);
    });

    it("Yes there returns a confirmed obstruction to its severity", () => {
      const { handlers } = mount(SUGGESTION_YES);
      press(control("back-to-question-2"));
      press(control("back-to-question-1"));
      expect(step()).toBe("Question 1 of 2");
      press(control("on-sidewalk-yes"));
      expect(severityPanel()).not.toBeNull();
      expect(slider().value).toBe("2");
      expect(called(handlers)).toEqual([]);
    });

    it("No there is Question 1's No", () => {
      const { handlers } = mount(SUGGESTION_YES);
      press(control("back-to-question-2"));
      press(control("back-to-question-1"));
      press(control("on-sidewalk-no"));
      expect(handlers.onSetOnSidewalk.mock.calls).toEqual([[false]]);
      expect(called(handlers)).toEqual(["onSetOnSidewalk"]);
    });

    it("offers Not an object for a suggestion and Delete box for a drawn box, as Question 1 does", () => {
      const suggestion = mount({ isRejected: true, obstructs: false });
      press(control("back-to-question-1"));
      expect(text()).toContain("No real object in this box?");
      press(buttonText("Not an object"));
      expect(called(suggestion.handlers)).toEqual(["onMarkNotAnObject"]);
      act(() => root!.unmount());
      root = null;
      host.remove();
      const drawn = mount({ editable: true, value: "bollard", obstructs: false });
      press(control("back-to-question-1"));
      expect(text()).not.toContain("Not an object");
      press(buttonText("Delete box"));
      expect(called(drawn.handlers)).toEqual(["onDelete"]);
    });

    // Rans (4 Nov 2026): no close button there, a click or tap outside closes the panel
    it("has no close button, whether or not the box is fully answered, on the laptop card and the phone sheet", () => {
      for (const variant of ["floating", "sheet"] as const) {
        for (const props of [{}, { isRejected: true, obstructs: false }, SUGGESTION_YES, DRAWN_YES]) {
          const { handlers } = mount({ ...props, variant });
          if (props === SUGGESTION_YES || props === DRAWN_YES) press(control("back-to-question-2"));
          press(control("back-to-question-1"));
          expect(step()).toBe("Question 1 of 2");
          expect(host.querySelector('[aria-label="Close"]')).toBeNull();
          expect(called(handlers)).toEqual([]);
          act(() => root!.unmount());
          root = null;
          host.remove();
        }
      }
    });
  });

  describe("a confirmed obstruction", () => {
    it("opens on its severity scale at the stored value, with Back to Question 2 and no Not an object, Change or Confirm", () => {
      for (const variant of ["floating", "sheet"] as const) {
        for (const props of [SUGGESTION_YES, DRAWN_YES]) {
          mount({ ...props, variant });
          expect(severityPanel()).not.toBeNull();
          expect(text()).toContain("How severe is this obstruction?");
          expect(slider().value).toBe("2");
          expect(text()).toContain("2 · Noticeable reduction");
          expect(control("back-to-question-2")!.textContent).toBe("Back to Question 2");
          expect(step()).toBeNull();
          expect(text()).not.toContain("Not an object");
          expect(buttonText("Change")).toBeUndefined();
          expect(control("confirm")).toBeNull();
          expect(buttonText("Go back")).toBeUndefined();
          // The category header, as on the question panels, with no close button
          expect(host.querySelector('select[aria-label="Category"]')).not.toBeNull();
          expect(host.querySelector('[aria-label="Close"]')).toBeNull();
          if (variant === "sheet") expect(control("back-to-question-2")!.className).toContain("min-h-[44px]");
          act(() => root!.unmount());
          root = null;
          host.remove();
        }
      }
    });

    it("Back to Question 2 shows Question 2 with Yes chosen and calls no handler, and Yes returns to the severity", () => {
      for (const props of [SUGGESTION_YES, DRAWN_YES]) {
        const { handlers } = mount(props);
        press(control("back-to-question-2"));
        expect(step()).toBe("Question 2 of 2");
        expect(isPressed("yes")).toBe(true);
        expect(isPressed("no")).toBe(false);
        expect(control("back-to-question-1")).not.toBeNull();
        expect(called(handlers)).toEqual([]);
        press(control("yes"));
        expect(severityPanel()).not.toBeNull();
        expect(called(handlers)).toEqual([]);
        act(() => root!.unmount());
        root = null;
        host.remove();
      }
    });

    it("No on Question 2 is today's No: onUnselectObstruction for a suggestion, onSetObstructs(false) then close for a drawn box", () => {
      const suggestion = mount(SUGGESTION_YES);
      press(control("back-to-question-2"));
      press(control("no"));
      expect(called(suggestion.handlers)).toEqual(["onUnselectObstruction"]);
      act(() => root!.unmount());
      root = null;
      host.remove();
      const drawn = mount(DRAWN_YES);
      press(control("back-to-question-2"));
      press(control("no"));
      expect(drawn.handlers.onSetObstructs.mock.calls).toEqual([[false]]);
      expect(called(drawn.handlers)).toEqual(["onSetObstructs", "onClose"]);
    });

    it("keeps Delete box for a drawn box on the severity panel, Question 2 and Question 1", () => {
      mount(DRAWN_YES);
      expect(buttonText("Delete box")).toBeDefined();
      press(control("back-to-question-2"));
      expect(buttonText("Delete box")).toBeDefined();
      press(control("back-to-question-1"));
      expect(buttonText("Delete box")).toBeDefined();
    });

    it("has no close button on Question 2, reached with Back or not, answered or not, on the laptop card and the phone sheet", () => {
      for (const variant of ["floating", "sheet"] as const) {
        for (const props of [{}, { isRejected: true, obstructs: false }, { editable: true, value: "bollard", obstructs: false }, SUGGESTION_YES, DRAWN_YES]) {
          const { handlers } = mount({ ...props, variant });
          if (props === SUGGESTION_YES || props === DRAWN_YES) press(control("back-to-question-2"));
          expect(step()).toBe("Question 2 of 2");
          expect(host.querySelector('[aria-label="Close"]')).toBeNull();
          expect(called(handlers)).toEqual([]);
          act(() => root!.unmount());
          root = null;
          host.remove();
        }
      }
    });
  });

  describe("its severity scale", () => {
    const setValue = (v: number) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider(), String(v));
      slider().dispatchEvent(new Event("input", { bubbles: true }));
    });
    // A mouse lets go with pointerup then mouseup, a finger with pointerup then touchend
    const letGo = () => act(() => {
      slider().dispatchEvent(new Event("pointerup", { bubbles: true }));
      slider().dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      slider().dispatchEvent(new Event("touchend", { bubbles: true }));
    });

    it("saves a new value once when the slider is let go, not while it is dragged, and the panel stays open on it", () => {
      const { handlers, rerender } = mount(SUGGESTION_YES);
      setValue(3);
      setValue(4);
      expect(handlers.onChangeSeverity).not.toHaveBeenCalled();
      letGo();
      expect(handlers.onChangeSeverity.mock.calls).toEqual([[4]]);
      expect(called(handlers)).toEqual(["onChangeSeverity"]);
      // The tool stores it and the panel shows it
      rerender({ severity: 4 });
      expect(severityPanel()).not.toBeNull();
      expect(slider().value).toBe("4");
      expect(text()).toContain("4 · Difficult to pass");
      letGo();
      expect(handlers.onChangeSeverity).toHaveBeenCalledTimes(1);
    });

    it("saves nothing when it is let go at the stored value", () => {
      const { handlers } = mount(SUGGESTION_YES);
      letGo();
      setValue(5);
      setValue(2);
      letGo();
      expect(called(handlers)).toEqual([]);
    });

    it("saves when a key that moves it is let go, and not for other keys", () => {
      const { handlers } = mount(DRAWN_YES);
      setValue(3);
      act(() => slider().dispatchEvent(new KeyboardEvent("keyup", { key: "Tab", bubbles: true })));
      expect(handlers.onChangeSeverity).not.toHaveBeenCalled();
      for (const [key, value] of [["ArrowRight", 3], ["End", 5], ["Home", 1]] as const) {
        setValue(value);
        act(() => slider().dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true })));
      }
      expect(handlers.onChangeSeverity.mock.calls).toEqual([[3], [5], [1]]);
      expect(handlers.onClose).not.toHaveBeenCalled();
    });
  });

  it("still opens the picker with Confirm and Go back on a first Yes, and Go back takes the Yes back", () => {
    for (const props of [{ selected: true, obstructs: true, severity: null }, { editable: true, value: "bollard", obstructs: true, severity: null }]) {
      const { handlers } = mount(props);
      expect(control("confirm")).not.toBeNull();
      expect(severityPanel()).toBeNull();
      expect(slider().value).toBe("3");
      press(buttonText("Go back"));
      expect(called(handlers)).toEqual(["onClearObstruction"]);
      act(() => root!.unmount());
      root = null;
      host.remove();
    }
    const { handlers } = mount({ selected: true, obstructs: true, severity: null });
    press(control("confirm"));
    expect(handlers.onSetSeverity.mock.calls).toEqual([[3]]);
  });

  it("starts each box at its deepest answer: the panel is keyed by box, as the tool and the previews render it", () => {
    mount({ ...SUGGESTION_YES, key: "a" } as Partial<IDefaultInputSection>);
    press(control("back-to-question-2"));
    expect(step()).toBe("Question 2 of 2");
    act(() => root!.render(<DefaultInputSection key="b" value="car" onChange={vi.fn()} onDelete={vi.fn()} onSelectObstruction={vi.fn()} onUnselectObstruction={vi.fn()} onMarkNotAnObject={vi.fn()} onSetSeverity={vi.fn()} onSetObstructs={vi.fn()} onClose={vi.fn()} onClearObstruction={vi.fn()} onRestoreObject={vi.fn()} editable={false} selected isRejected={false} obstructs severity={2} onSidewalk />));
    expect(severityPanel()).not.toBeNull();
  });

  // Annotators are never asked the path question and give no severity
  it("leaves the panel without the path question as it was: no Back, Not an object or Delete box in the footer, and Yes closes", () => {
    const suggestion = mount({ askOnSidewalk: false, askSeverity: false, onSidewalk: undefined, selected: true, obstructs: true });
    expect(step()).toBeNull();
    expect(severityPanel()).toBeNull();
    expect(host.querySelector('[data-control^="back"]')).toBeNull();
    expect(text()).toContain("No real object in this box?");
    expect(buttonText("Not an object")).toBeDefined();
    expect(isPressed("yes")).toBe(true);
    expect(host.querySelector('[aria-label="Close"]')).not.toBeNull();
    press(control("yes"));
    expect(called(suggestion.handlers)).toEqual(["onClose"]);
    act(() => root!.unmount());
    root = null;
    host.remove();
    mount({ askOnSidewalk: false, askSeverity: false, onSidewalk: undefined, editable: true, value: "bollard" });
    expect(text()).toContain("Drawn by you");
    expect(buttonText("Delete box")).toBeDefined();
    expect(host.querySelector('[data-control^="back"]')).toBeNull();
  });
});
