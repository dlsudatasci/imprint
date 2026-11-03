import { describe, it, expect } from "vitest";
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
  it("offers a new drawn box only the category, the question and Delete, with no checkmark or close", () => {
    const html = render({ editable: true, value: "---" });
    expect(html).toContain("Select a category");
    expect(html).toContain("Does <span class=\"font-semibold text-ink\">this object</span> obstruct the sidewalk?");
    expect(disabledButton(html, "Yes")).toBe(true);
    expect(disabledButton(html, "No")).toBe(true);
    expect(html).toContain("Delete box");
    expect(html).toContain("Drawn by you");
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

  it("shows an answered drawn box with its answer and a close button", () => {
    const no = render({ editable: true, value: "bollard", obstructs: false });
    expect(pressed(no, "No")).toBe(true);
    expect(pressed(no, "Yes")).toBe(false);
    expect(no).toContain('aria-label="Close"');
    const yes = render({ editable: true, value: "bollard", obstructs: true, severity: 4 });
    expect(pressed(yes, "Yes")).toBe(true);
    expect(yes).toContain('aria-label="Close"');
    // The severity number and Change, without its wording (8 Oct 2026)
    expect(yes).toContain('<span class="text-xs text-muted">Severity 4</span>');
    expect(yes).toContain(">Change<");
    expect(yes).not.toContain("Difficult to pass");
  });

  it("gives a suggestion a Not an object button, not a category entry", () => {
    const html = render({});
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
    expect(no).toContain('aria-label="Close"');
    const yes = render({ selected: true, obstructs: true, severity: 3 });
    expect(pressed(yes, "Yes")).toBe(true);
    expect(yes).toContain('<span class="text-xs text-muted">Severity 3</span>');
    expect(yes).toContain(">Change<");
    expect(yes).not.toContain("Significant narrowing");
  });

  it("shows a box marked Not an object with its suggested name and a way to restore it (8 Oct 2026)", () => {
    const html = render({ value: "not_an_object", isRejected: true, obstructs: false, originalComment: "car" });
    expect(html).toMatch(/>Not an object<\/span>/);
    expect(html).toContain("Suggested as Car. This box won&#x27;t be counted.");
    expect(html).toContain("A real object after all?");
    expect(html).toMatch(/<button[^>]*>Restore<\/button>/);
    expect(html).toContain('aria-label="Close"');
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
    expect(sheet).toMatch(/w-11 h-11[^"]*"[^>]*aria-label="Close"|aria-label="Close"[^>]*class="[^"]*w-11 h-11/);
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
    expect(floating).not.toContain("text-base");
  });

  // S12 (2 Nov 2026): whether the object is on the sidewalk, before whether it obstructs
  describe("the sidewalk question", () => {
    const sidewalkButton = (html: string, answer: "yes" | "no") =>
      new RegExp(`<button data-control="on-sidewalk-${answer}"[^>]*>${answer === "yes" ? "Yes" : "No"}<`).test(html);

    it("asks a suggestion with no sidewalk answer first, in the copy module's words, with Not an object as today", () => {
      const html = render({ onSidewalk: undefined });
      expect(html).toContain(">Is it on the sidewalk or the path people walk on?<");
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
      expect(noCategory).toContain("Is it on the sidewalk or the path people walk on?");
      expect(disabledButton(noCategory, "Yes")).toBe(true);
      expect(disabledButton(noCategory, "No")).toBe(true);
      expect(noCategory).toContain("Delete box");
      const withCategory = render({ onSidewalk: undefined, editable: true, value: "bollard" });
      expect(disabledButton(withCategory, "Yes")).toBe(false);
      expect(disabledButton(withCategory, "No")).toBe(false);
    });

    it("asks it again, with No chosen and a close button, of a box reopened from Not on the walking path", () => {
      for (const html of [
        render({ onSidewalk: false, isRejected: true, obstructs: false }),
        render({ onSidewalk: false, editable: true, value: "bollard", obstructs: false }),
      ]) {
        expect(html).toContain("Is it on the sidewalk or the path people walk on?");
        expect(pressed(html, "No")).toBe(true);
        expect(pressed(html, "Yes")).toBe(false);
        expect(html).toContain('aria-label="Close"');
      }
    });

    it("asks it of a box answered Yes or No before the question existed", () => {
      expect(render({ onSidewalk: undefined, selected: true, obstructs: true, severity: 3 })).toContain("Is it on the sidewalk");
    });

    it("gives the obstruction question a Go back to the sidewalk question", () => {
      for (const html of [render({}), render({ editable: true, value: "bollard" }), render({ selected: true, obstructs: true, severity: 2 })]) {
        expect(html).toContain("obstruct the sidewalk?");
        expect(html).toMatch(/<button data-control="back"[^>]*>Go back<\/button>/);
      }
      expect(render({ askOnSidewalk: false, onSidewalk: undefined })).not.toContain(">Go back<");
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
          expect(html).toMatch(/Question 1 of 2<\/p><p class="text-sm text-body mt-0\.5 mb-2">Is it on the sidewalk or the path people walk on\?<\/p>/);
        }
      }
    });

    it("says Question 2 of 2 above the obstruction question", () => {
      for (const variant of ["floating", "sheet"] as const) {
        for (const html of [render({ variant }), render({ variant, editable: true, value: "bollard" }), render({ variant, selected: true, obstructs: true, severity: 2 })]) {
          expect(label(html)?.[3]).toBe("Question 2 of 2");
          expect(html).toMatch(/Question 2 of 2<\/p><p class="text-sm text-body mt-0\.5 mb-2">Does <span/);
        }
      }
    });

    it("shows no label without the path question, and keeps the question where it was", () => {
      const html = render({ askOnSidewalk: false, onSidewalk: undefined });
      expect(html).toContain("obstruct the sidewalk?");
      expect(html).not.toContain("data-question-step");
      expect(html).not.toMatch(/Question \d of 2/);
      expect(html).toContain('<p class="text-sm text-body mt-3 mb-2">Does <span');
    });

    it("shows no label on the severity picker or a box marked Not an object", () => {
      expect(render({ selected: true, obstructs: true, severity: null })).not.toContain("data-question-step");
      expect(render({ value: "not_an_object", isRejected: true, obstructs: false })).not.toContain("data-question-step");
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
