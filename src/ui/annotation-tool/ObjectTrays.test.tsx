import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ObjectTrays, { ObjectTraysPeek, SheetStepHeading } from "./ObjectTrays";
import { buildTrays, buildPeekChips } from "@/features/annotate/objectTrays";
import { buildDisplayLabels } from "@/util/buildDisplayLabels";

// Contributor Step 1: lists of answers under the photo (7 Oct 2026)
type Box = { id: string; comment?: string } & Record<string, unknown>;
const mark = { x: 10, y: 10, width: 60, height: 60, type: "RECT" };
// Answered on the sidewalk (S12) unless a test says otherwise, so the
// obstruction answer decides the list. Not an object boxes carry no answer.
const onSidewalkFor = (comment?: string) => (comment === "not_an_object" ? {} : { onSidewalk: true });
const suggestion = (id: string, comment: string, extra: Record<string, unknown> = {}): Box => ({ id, mark, comment, editable: false, selected: false, initialState: { comment, mark }, ...onSidewalkFor((extra.comment as string) ?? comment), ...extra });
const drawn = (id: string, comment: string, extra = {}): Box => ({ id, mark, comment, editable: true, selected: false, onSidewalk: true, ...extra });

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
    expect(chip(html, "Tree #1")).toContain("border-dashed border-warning");
    expect(chip(html, "Bollard #1")).toContain("border-dashed border-primary");
    expect(chip(html, "Bollard #1")).toContain('<svg data-drawn="true"');
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
    expect(yes).toMatch(/>Tree #1</);
    expect(no).toContain(">Not obstructions</h3>");
    expect(no).toMatch(/>Car #1</);
    // Drawn boxes have a pencil before the name (8 Oct 2026), and say so to screen readers
    expect(yes).toMatch(/<svg data-drawn="true"[\s\S]*?<\/svg>Bollard #1<span class="sr-only">, drawn by you<\/span>/);
    expect(no).toMatch(/<svg data-drawn="true"[\s\S]*?<\/svg>Planter #1/);
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

  it("says when the image has no objects at all, and still shows both lists with their empty slots (17 Oct 2026)", () => {
    const html = render([]);
    expect(html).toContain("No suggestions in this image. Draw a box around any object the model missed.");
    for (const id of ["object-tray-not-obstructions", "object-tray-obstructions"]) {
      expect(count(list(html, id), 'data-slot="empty"')).toBe(3);
    }
    expect(html).not.toContain("data-empty-list");
  });

  it("shows no empty slots when every suggestion was marked Not an object", () => {
    const html = render([suggestion("a", "not_an_object", { isRejected: true, obstructs: false, initialState: { comment: "car", mark } })]);
    expect(html).toContain("Every object is answered.");
    expect(html).not.toContain('data-slot="empty"');
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
    expect(chip(html, "Car #1")).toContain("ring-2 ring-primary/40");
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

  it("gives every chip of a box on the photo an eye that names its object", () => {
    const html = renderWith([]);
    expect(count(html, "data-eye")).toBe(3);
    for (const label of ["Tree #1", "Car #1", "Bollard #1"]) {
      expect(chip(html, label)).toContain(`aria-label="Hide ${label} on the photo"`);
      expect(chip(html, label)).toContain('aria-pressed="false"');
    }
    expect(html).not.toContain("data-hidden-summary");
  });

  // S17 (4 Nov 2026): a box marked Not an object leaves the photo, as one
  // off the path does, so there is nothing to hide or show
  it("gives a Not an object chip no eye, never shows it hidden, and leaves it out of the hidden count", () => {
    const html = renderWith(["d"]);
    expect(chip(html, "Bench")).not.toContain("data-eye");
    expect(chip(html, "Bench")).not.toContain("opacity-60");
    expect(html).not.toContain("data-hidden-summary");
    const withOthers = renderWith(["a", "d"]);
    expect(withOthers).toMatch(/data-hidden-summary[^>]*>1 box hidden</);
  });

  it("fades a hidden object's chip, crosses out its eye and offers to show it", () => {
    const html = renderWith(["b", "c"]);
    for (const label of ["Car #1", "Bollard #1"]) {
      expect(chip(html, label)).toContain("opacity-60");
      expect(chip(html, label)).toContain(`aria-label="Show ${label} on the photo"`);
      expect(chip(html, label)).toContain('aria-pressed="true"');
    }
    expect(chip(html, "Tree #1")).not.toContain("opacity-60");
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

// 10 Oct 2026: Hide all, and the open object's chip filled and outlined
describe("ObjectTrays Hide all and the open object", () => {
  const noop = () => undefined;
  const boxes = [suggestion("a", "tree"), suggestion("b", "car", { isRejected: true, obstructs: false }), drawn("c", "bollard")];
  const renderWith = (hiddenIds: string[], selectedId: string | null = null) =>
    renderToStaticMarkup(
      <ObjectTrays
        trays={buildTrays(boxes, { labels: buildDisplayLabels(boxes) })}
        selectedId={selectedId}
        hiddenIds={hiddenIds}
        onOpen={noop}
        onToggleHidden={noop}
        onShowAll={noop}
        onHideAll={noop}
      />
    );

  it("offers Hide all until every box is hidden, beside Show all", () => {
    expect(renderWith([])).toMatch(/data-hidden-summary[^>]*><button[^>]*>Hide all<\/button>/);
    expect(renderWith(["a"])).toMatch(/1 box hidden<button[^>]*>Show all<\/button><button[^>]*>Hide all<\/button>/);
    const allHidden = renderWith(["a", "b", "c"]);
    expect(allHidden).toContain(">Show all<");
    expect(allHidden).not.toContain(">Hide all<");
  });

  it("fills and outlines the open object's chip, and marks it current", () => {
    const html = renderWith([], "b");
    expect(chip(html, "Car #1")).toContain("border-primary bg-primary-50");
    expect(chip(html, "Car #1")).toContain('aria-current="true"');
    expect(chip(html, "Tree #1")).not.toContain("bg-primary-50");
    expect(count(html, 'aria-current="true"')).toBe(1);
  });
});

// 14 Oct 2026: the first row of the sheet, the step's name with Show all and Hide all
describe("SheetStepHeading", () => {
  const html = (hiddenCount: number, boxCount: number) =>
    renderToStaticMarkup(<SheetStepHeading heading="Step 1 of 3: Objects" hiddenCount={hiddenCount} boxCount={boxCount} onShowAll={() => undefined} onHideAll={() => undefined} />);

  it("offers Hide all while a box shows, and Show all with how many are hidden", () => {
    expect(html(0, 3)).toContain("Step 1 of 3: Objects");
    expect(html(0, 3)).toContain(">Hide all<");
    expect(html(0, 3)).not.toContain("Show all");
    expect(html(1, 3)).toMatch(/Show all <span[^>]*>1<\/span>/);
    expect(html(1, 3)).toContain(">Hide all<");
    expect(html(3, 3)).not.toContain(">Hide all<");
  });

  it("has neither when there are no boxes, and 40 px buttons", () => {
    expect(html(0, 0)).not.toContain("<button");
    expect(html(1, 3)).toMatch(/<button[^>]*class="h-10 /);
  });
});

describe("ObjectTraysPeek's first row", () => {
  const boxes = [suggestion("a", "car"), suggestion("b", "tree")];
  const trays = buildTrays(boxes);
  const peek = (extra = {}) =>
    renderToStaticMarkup(<ObjectTraysPeek trays={trays} peek={buildPeekChips(boxes)} selectedId={null} onOpen={() => undefined} onNext={() => undefined} sceneLine="Step 2" onShowScene={() => undefined} {...extra} />);

  it("shows the step's name with Show all and Hide all only when it is given both", () => {
    expect(peek()).not.toContain("Step 1: Identify Objects");
    const withRow = peek({ hiddenIds: ["a"], onShowAll: () => undefined, onHideAll: () => undefined });
    expect(withRow).toContain("Step 1: Identify Objects");
    expect(withRow).toMatch(/Show all <span[^>]*>1<\/span>/);
    expect(withRow).toContain(">Hide all<");
  });

  // S17 (4 Nov 2026): a box marked Not an object is off the photo, as one off the path is
  it("counts neither a Not an object box nor one off the path, on the phone as on the laptop", () => {
    const mixed = [
      suggestion("a", "car"),
      suggestion("b", "not_an_object", { isRejected: true, obstructs: false, initialState: { comment: "bench", mark } }),
      suggestion("c", "tree", { onSidewalk: false, isRejected: true, obstructs: false }),
    ];
    const visibility = { onShowAll: () => undefined, onHideAll: () => undefined };
    const phone = (hiddenIds: string[]) =>
      renderToStaticMarkup(<ObjectTraysPeek trays={buildTrays(mixed)} peek={buildPeekChips(mixed)} selectedId={null} onOpen={() => undefined} onNext={() => undefined} sceneLine="Step 2" onShowScene={() => undefined} hiddenIds={hiddenIds} {...visibility} />);
    const laptop = (hiddenIds: string[]) =>
      renderToStaticMarkup(<ObjectTrays trays={buildTrays(mixed)} selectedId={null} hiddenIds={hiddenIds} onOpen={() => undefined} onToggleHidden={() => undefined} {...visibility} />);
    // Hide all puts every id in the list: only Car counts, so every box is hidden
    for (const html of [phone(["a", "b", "c"]), laptop(["a", "b", "c"])]) {
      expect(html).not.toContain(">Hide all<");
      expect(html).toContain("Show all");
    }
    expect(phone(["a", "b", "c"])).toMatch(/Show all <span[^>]*>1<\/span>/);
    expect(laptop(["a", "b", "c"])).toMatch(/data-hidden-summary[^>]*>1 box hidden</);
    // With Car shown, Hide all is still offered, whatever the other two say
    for (const html of [phone(["b", "c"]), laptop(["b", "c"])]) expect(html).toContain(">Hide all<");
  });
});

// S12 (2 Nov 2026, changed the same day by Rans): a box answered not on the
// sidewalk or the path people walk on is listed under Not obstructions
describe("boxes off the walking path", () => {
  const off = (box: Box): Box => ({ ...box, onSidewalk: false, obstructs: false, severity: null });
  const boxes = [
    off(suggestion("a", "car", { isRejected: true })),
    suggestion("b", "tree", { isRejected: true, obstructs: false }),
    off(drawn("c", "planter")),
    suggestion("d", "bench", { onSidewalk: undefined }),
  ];
  const renderWith = (hiddenIds: string[] = []) =>
    renderToStaticMarkup(
      <ObjectTrays
        trays={buildTrays(boxes, { labels: buildDisplayLabels(boxes) })}
        selectedId={null}
        hiddenIds={hiddenIds}
        onOpen={() => undefined}
        onToggleHidden={() => undefined}
        onShowAll={() => undefined}
        onHideAll={() => undefined}
      />
    );

  it("lists them under Not obstructions with the other No answers, in two lists only", () => {
    const html = renderWith();
    const no = list(html, "object-tray-not-obstructions");
    expect(no).toMatch(/>Car #1</);
    expect(no).toMatch(/>Tree #1</);
    expect(no).toMatch(/<svg data-drawn="true"[\s\S]*?<\/svg>Planter #1/);
    expect(count(no, 'data-tray="notObstructions"')).toBe(3);
    expect(html).not.toContain("object-tray-off-sidewalk");
    expect(html).not.toContain("walking path");
    expect(html).toContain("grid-cols-2");
    expect(html).not.toContain("grid-cols-3");
    expect(html).toMatch(/Still to decide <span[^>]*>1<\/span>/);
  });

  it("gives their chips no eye, since the boxes are off the photo, and never shows them as hidden", () => {
    const html = renderWith(["a", "b", "c"]);
    expect(chip(html, "Car #1")).not.toContain("data-eye");
    expect(chip(html, "Car #1")).not.toContain("opacity-60");
    expect(chip(html, "Planter #1")).not.toContain("data-eye");
    expect(chip(html, "Tree #1")).toContain("data-eye");
    // The hidden count counts only boxes that can be on the photo
    expect(html).toContain("1 box hidden");
  });

  it("tags their chips Not an obstruction at the top of the sheet, after what is left", () => {
    const html = renderToStaticMarkup(
      <ObjectTraysPeek trays={buildTrays(boxes)} peek={buildPeekChips(boxes)} selectedId={null} onOpen={() => undefined} onNext={() => undefined} sceneLine="Step 2" onShowScene={() => undefined} />
    );
    const texts = Array.from(html.matchAll(/<li[^>]*>(.*?)<\/li>/g)).map((m) => m[1].replace(/<[^>]+>/g, ""));
    expect(texts[0]).toBe("BenchTo decide");
    expect(texts).toContain("CarNot an obstruction");
    expect(texts).toContain("Planter, drawn by youNot an obstruction");
  });
});

// 21 Oct 2026: every object in one row at the top of the contributors' sheet, what is left first
describe("ObjectTraysPeek's chip row", () => {
  const drawn = (id: string, extra = {}): Box => ({ id, mark, comment: "bench", editable: true, selected: false, onSidewalk: true, ...extra });
  const boxes = [
    suggestion("a", "car", { selected: true, obstructs: true, severity: 3 }),
    suggestion("b", "tree"),
    suggestion("c", "lamp_post", { isRejected: true, obstructs: false }),
    suggestion("d", "utility_post", { selected: true, obstructs: true, severity: null }),
    drawn("e", { comment: "---" }),
    suggestion("f", "bollard", { isRejected: true, comment: "not_an_object", initialState: { comment: "bollard" } }),
  ];
  const render = () =>
    renderToStaticMarkup(
      <ObjectTraysPeek trays={buildTrays(boxes)} peek={buildPeekChips(boxes)} selectedId={null} onOpen={() => undefined} onNext={() => undefined} sceneLine="Step 2" onShowScene={() => undefined} />
    );
  const chipTexts = (html: string) => Array.from(html.matchAll(/<li[^>]*>(.*?)<\/li>/g)).map((m) => m[1].replace(/<[^>]+>/g, ""));

  it("shows one row of every object, no answer lists, with what is left first and a tag on each", () => {
    const html = render();
    expect(html).toContain('id="box-review-chips-peek"');
    expect(html).not.toContain(">Not obstructions<");
    expect(html).not.toContain(">Obstructions<");
    expect(chipTexts(html)).toEqual([
      "TreeTo decide",
      "Utility PostNo severity",
      "Select a category, drawn by youTo decide",
      "CarObstruction",
      "Lamp PostNot an obstruction",
      "BollardNot an object",
    ]);
    // The drawn box has the pencil
    expect(html.match(/data-drawn/g)).toHaveLength(1);
  });

  it("counts what is left, the Yes with no severity included", () => {
    expect(render()).toMatch(/Still to decide <span[^>]*>3<\/span>/);
  });
});

// S16b (3 Nov 2026): the phone tour's Your Answers step lights exactly the lists
describe("the lists' tour target", () => {
  it("holds Still to decide and both cards, with no padding of its own, and not the Not an object row", () => {
    const html = render([suggestion("a", "tree"), suggestion("b", "car", { comment: "not_an_object", isRejected: true })]);
    const open = html.indexOf('<div id="box-review-lists">');
    expect(open).toBeGreaterThan(-1);
    const toDecide = html.indexOf("Still to decide");
    const obstructions = html.indexOf('<section id="object-tray-obstructions"');
    const removed = html.lastIndexOf(">Not an object<");
    expect(toDecide).toBeGreaterThan(open);
    expect(html.indexOf('<section id="object-tray-not-obstructions"')).toBeGreaterThan(open);
    expect(obstructions).toBeGreaterThan(open);
    // The wrapper closes after the Obstructions card and before the Not an object row
    const afterObstructions = html.indexOf("</section>", obstructions);
    expect(html.slice(afterObstructions, afterObstructions + "</section></div></div>".length)).toBe("</section></div></div>");
    expect(removed).toBeGreaterThan(afterObstructions);
  });
});
