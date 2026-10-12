import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DefaultInputSection, { type IDefaultInputSection } from "./DefaultInputSection";

// Contributor box panel (7 Oct 2026): one question for every box, No closes,
// Yes goes to the severity picker, Not an object and Delete are buttons
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
