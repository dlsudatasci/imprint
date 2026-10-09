import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ObjectTrays from "./ObjectTrays";
import { buildTrays } from "@/features/annotate/objectTrays";
import { buildDisplayLabels } from "@/util/buildDisplayLabels";

// Contributor Step 1: lists of answers under the photo (7 Oct 2026)
type Box = { id: string; comment?: string } & Record<string, unknown>;
const mark = { x: 10, y: 10, width: 60, height: 60, type: "RECT" };
const suggestion = (id: string, comment: string, extra = {}): Box => ({ id, mark, comment, editable: false, selected: false, initialState: { comment, mark }, ...extra });
const drawn = (id: string, comment: string, extra = {}): Box => ({ id, mark, comment, editable: true, selected: false, ...extra });

function render(boxes: Box[], selectedId: string | null = null) {
  const trays = buildTrays(boxes, { labels: buildDisplayLabels(boxes) });
  return renderToStaticMarkup(<ObjectTrays trays={trays} selectedId={selectedId} onOpen={() => undefined} />);
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** One whole chip (its li), found by the object's name. */
function chip(html: string, label: string) {
  const at = html.search(new RegExp(`(>|</svg>)${label}(<|,)`));
  if (at < 0) return "";
  const start = html.lastIndexOf("<li", at);
  return html.slice(start, html.indexOf("</li>", at) + 5);
}

/** The section for one list, from its opening tag to the next section or the end. */
function list(html: string, id: string) {
  const start = html.indexOf(`<section id="${id}"`);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

describe("ObjectTrays", () => {
  it("at the start of an image lists every object as still to decide, with both lists empty", () => {
    const html = render([suggestion("a", "tree"), suggestion("b", "car"), drawn("c", "bollard")]);
    expect(html).toContain('id="box-review-section"');
    expect(html).toMatch(/Still to decide <span[^>]*>3<\/span>/);
    expect(count(html, 'data-tray="toDecide"')).toBe(3);
    // Dashed amber for suggestions, dashed blue for the box the contributor drew
    expect(chip(html, "Tree")).toContain("border-dashed border-warning");
    expect(chip(html, "Bollard")).toContain("border-dashed border-primary");
    expect(chip(html, "Bollard")).toContain('<svg data-drawn="true"');
    // Each empty list shows three empty slots, so it is clear answers go there
    for (const id of ["object-tray-not-obstructions", "object-tray-obstructions"]) {
      expect(count(list(html, id), 'data-slot="empty"')).toBe(3);
      expect(list(html, id)).not.toContain("data-tray=");
    }
  });

  it("lists each answered object under its answer, with drawn boxes marked", () => {
    const html = render([
      suggestion("a", "tree", { selected: true, obstructs: true, severity: 4 }),
      suggestion("b", "car", { isRejected: true, obstructs: false }),
      suggestion("c", "bench"),
      drawn("d", "bollard", { obstructs: true, severity: 2 }),
      drawn("e", "planter", { obstructs: false }),
    ]);
    const yes = list(html, "object-tray-obstructions");
    const no = list(html, "object-tray-not-obstructions");
    expect(yes).toContain(">Obstructions</h3>");
    expect(yes).toMatch(/>Tree</);
    expect(no).toContain(">Not obstructions</h3>");
    expect(no).toMatch(/>Car</);
    // Drawn boxes have a pencil before the name (8 Oct 2026), and say so to screen readers
    expect(yes).toMatch(/<svg data-drawn="true"[\s\S]*?<\/svg>Bollard<span class="sr-only">, drawn by you<\/span>/);
    expect(no).toMatch(/<svg data-drawn="true"[\s\S]*?<\/svg>Planter/);
    expect(count(html, "data-drawn")).toBe(2);
    expect(html).not.toContain(">Drawn<");
    // Plain white chips in the lists (8 Oct 2026), no green or amber fills
    for (const l of [yes, no]) {
      expect(l).not.toContain("bg-success-soft");
      expect(l).not.toContain("bg-warning-soft");
      expect(l).toContain("border-line bg-surface text-ink");
    }
    // No count beside the list titles (8 Oct 2026)
    expect(yes).not.toContain("tabular-nums");
    expect(no).not.toContain("tabular-nums");
    // One object still to decide: one empty slot after each list's chips
    expect(count(yes, 'data-slot="empty"')).toBe(1);
    expect(count(no, 'data-slot="empty"')).toBe(1);
    expect(html).toMatch(/Still to decide <span[^>]*>1<\/span>/);
  });

  it("shows no photos, severity, meter, move or delete controls", () => {
    const html = render([
      suggestion("a", "tree", { selected: true, obstructs: true, severity: 4 }),
      drawn("b", "bollard", { obstructs: true, severity: null }),
      suggestion("c", "car"),
    ]);
    expect(html).not.toContain("background-image");
    expect(html).not.toContain("Severity");
    expect(html).not.toContain("Rate severity");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("sorted");
    expect(html).not.toContain("Move to");
    expect(html).not.toContain("Delete");
    expect(html).not.toContain("Click one to answer it.");
    expect(html).not.toContain("lands here");
  });

  it("says when every object is answered", () => {
    const html = render([
      suggestion("a", "tree", { selected: true, obstructs: true, severity: 3 }),
      drawn("b", "bollard", { obstructs: false }),
    ]);
    expect(html).toContain("Every object is answered.");
    expect(html).not.toContain("Still to decide");
    expect(html).not.toContain('data-tray="toDecide"');
    expect(html).not.toContain('data-slot="empty"');
  });

  it("says when the image has no objects at all", () => {
    const html = render([]);
    expect(html).toContain("No suggestions in this image. Draw a box around any object the model missed.");
    expect(count(html, "data-empty-list")).toBe(2);
  });

  it("lists boxes marked Not an object by the model's category, apart from the answers", () => {
    const html = render([
      suggestion("a", "not_an_object", { isRejected: true, obstructs: false, initialState: { comment: "car", mark } }),
      suggestion("b", "tree", { isRejected: true, obstructs: false }),
    ]);
    expect(count(html, 'data-tray="removed"')).toBe(1);
    expect(html).toMatch(/>Not an object<\/span>/);
    expect(html).toMatch(/data-tray="removed"[^>]*>Car</);
    expect(list(html, "object-tray-not-obstructions")).not.toContain(">Car<");
    expect(html).toContain("Every object is answered.");
  });

  it("rings the chip of the box whose panel is open", () => {
    const html = render([suggestion("a", "tree"), suggestion("b", "car")], "b");
    expect(count(html, "ring-2 ring-primary/40")).toBe(1);
    expect(chip(html, "Car")).toContain("ring-2 ring-primary/40");
  });
});

// Hiding boxes on the photo (8 Oct 2026)
describe("ObjectTrays eye toggles", () => {
  const noop = () => undefined;
  const boxes = [
    suggestion("a", "tree"),
    suggestion("b", "car", { isRejected: true, obstructs: false }),
    drawn("c", "bollard", { obstructs: true, severity: 2 }),
    suggestion("d", "not_an_object", { isRejected: true, obstructs: false, initialState: { comment: "bench", mark } }),
  ];
  const renderWith = (hiddenIds: string[], withToggle = true) =>
    renderToStaticMarkup(
      <ObjectTrays
        trays={buildTrays(boxes, { labels: buildDisplayLabels(boxes) })}
        selectedId={null}
        hiddenIds={hiddenIds}
        onOpen={noop}
        onToggleHidden={withToggle ? noop : undefined}
        onShowAll={withToggle ? noop : undefined}
      />
    );

  it("gives every chip, in every list, an eye that names its object", () => {
    const html = renderWith([]);
    expect(count(html, "data-eye")).toBe(4);
    for (const label of ["Tree", "Car", "Bollard", "Bench"]) {
      expect(chip(html, label)).toContain(`aria-label="Hide ${label} on the photo"`);
      expect(chip(html, label)).toContain('aria-pressed="false"');
    }
    expect(html).not.toContain("data-hidden-summary");
  });

  it("fades a hidden object's chip, crosses out its eye and offers to show it", () => {
    const html = renderWith(["b", "c"]);
    for (const label of ["Car", "Bollard"]) {
      expect(chip(html, label)).toContain("opacity-60");
      expect(chip(html, label)).toContain(`aria-label="Show ${label} on the photo"`);
      expect(chip(html, label)).toContain('aria-pressed="true"');
    }
    expect(chip(html, "Tree")).not.toContain("opacity-60");
    expect(html).toMatch(/data-hidden-summary[^>]*>2 boxes hidden<button[^>]*>Show all<\/button>/);
  });

  it("counts only boxes still in the image as hidden", () => {
    const html = renderWith(["a", "gone"]);
    expect(html).toMatch(/data-hidden-summary[^>]*>1 box hidden</);
  });

  it("shows no eyes or summary when hiding is not offered", () => {
    const html = renderWith(["a"], false);
    expect(html).not.toContain("data-eye");
    expect(html).not.toContain("data-hidden-summary");
  });
});
