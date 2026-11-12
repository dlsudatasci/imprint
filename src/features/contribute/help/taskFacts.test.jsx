import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import SceneQuestions from "@/ui/annotation-tool/SceneQuestions";
import { severityLabel } from "@/ui/annotation-tool/DefaultInputSection";
import { CATEGORY_OPTIONS } from "@/util/categoryOptions";
import { ALLOWED_SESSION_SIZES } from "@/util/validators/annotationGet";
import { SEVERITY_SCALE, SCENE_QUESTIONS, CATEGORY_GROUPS, SESSION_SIZES_TEXT, PATH_NOT_ASKED } from "./taskFacts";
import { SCENE_KEYS, SCENE_NUMBERED, SIDEWALK_ONLY_KEYS, emptySceneLevel } from "@/util/validators/sceneQuestions.mjs";
import { GUIDE_COPY } from "./guideCopy";
import DefaultInputSection from "@/ui/annotation-tool/DefaultInputSection";

/**
 * The About page and the annotation guide describe the task from taskFacts.js
 * (16 Oct 2026). These tests hold it to the tool itself, so a change to the
 * tool's wording fails here, naming the line that is now wrong, instead of the
 * public pages quietly describing an older tool (which is how the old guide
 * ended up showing a 1 to 10 slider).
 */
const empty = emptySceneLevel();
const decode = (html) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

describe("taskFacts against the tool", () => {
  it("words the severity scale exactly as the severity picker does", () => {
    expect(SEVERITY_SCALE.map((s) => s.value)).toEqual([1, 2, 3, 4, 5]);
    for (const s of SEVERITY_SCALE) expect(s.label).toBe(severityLabel(s.value));
  });

  it("names the six Step 3 questions, their prompts and every answer as SceneQuestions shows them (S15)", () => {
    const html = decode(renderToStaticMarkup(<SceneQuestions sceneLevel={empty} variant="desktop" onAnswer={() => {}} />)).replace(/\u00ad/g, "");
    expect(SCENE_QUESTIONS.map((q) => q.key)).toEqual([...SCENE_KEYS]);
    for (const q of SCENE_QUESTIONS) {
      expect(html).toContain(`>${q.name}<`);
      expect(html).toContain(q.prompt);
      for (const a of q.answers) expect(html).toContain(`>${a}<`);
    }
  });

  // Worst to best, a numbered answer's place its stored number less one. Surface Type has no order.
  it("lists each question's answers in the tool's order, the numbered ones by their value", () => {
    const html = decode(renderToStaticMarkup(<SceneQuestions sceneLevel={empty} variant="desktop" onAnswer={() => {}} />)).replace(/\u00ad/g, "");
    const shown = [...html.matchAll(/data-scene-option="([a-zA-Z]+):([^"]+)"[\s\S]*?<span[^>]*>([^<]+)<\/span>/g)].map(([, field, value, label]) => ({ field, value, label }));
    for (const q of SCENE_QUESTIONS) {
      const options = shown.filter((o) => o.field === q.key);
      expect(options.map((o) => o.label), q.name).toEqual([...q.answers]);
      if (q.key in SCENE_NUMBERED) expect(options.map((o) => Number(o.value))).toEqual(q.answers.map((_, n) => n + 1));
    }
    expect(SCENE_QUESTIONS.find((q) => q.name === "Ease of Navigation").answers.at(-1)).toBe("Unobstructed");
    expect(shown.filter((o) => o.field === "roadBarrier").map((o) => o.value)).toEqual(["false", "true"]);
  });

  it("gives every answer one line of meaning, starting with its name, and no em dash or semicolon", () => {
    for (const q of SCENE_QUESTIONS) {
      expect(q.meanings, q.name).toHaveLength(q.answers.length);
      q.answers.forEach((a, i) => expect(q.meanings[i].startsWith(`${a}: `), `${q.name} ${a}`).toBe(true));
      for (const text of [q.prompt, q.note, ...q.meanings]) expect(text).not.toMatch(/[—;]/);
    }
    // The definitions the spec gives
    const meaning = (name, n) => SCENE_QUESTIONS.find((q) => q.name === name).meanings[n];
    expect(meaning("Surface Condition", 1)).toBe("Cracked: lines in the surface, with every piece still in place and level.");
    expect(meaning("Road Barrier", 0)).toContain("A curb alone is No barrier");
    expect(meaning("Surface Type", 3)).toBe("Unpaved: soil, gravel or grass.");
    // S23 C (12 Nov 2026): bricks first
    expect(SCENE_QUESTIONS.find((q) => q.key === "surfaceType").answers[2]).toBe("Bricks or paver blocks");
    expect(meaning("Surface Type", 2)).toBe("Bricks or paver blocks: bricks or blocks laid side by side.");
    expect(meaning("Evenness", 0)).toBe("Uneven: it rises and dips, as at driveways.");
  });

  it("marks the four questions not asked for a path, as the tool does", () => {
    expect(SCENE_QUESTIONS.filter((q) => q.sidewalkOnly).map((q) => q.key)).toEqual([...SIDEWALK_ONLY_KEYS]);
    expect(PATH_NOT_ASKED).toBe("Not asked when there is only a path.");
  });

  it("lists every category once, by the category list's own labels, 8 temporary and 10 permanent", () => {
    const [temporary, permanent] = CATEGORY_GROUPS;
    expect(temporary.labels).toHaveLength(8);
    expect(permanent.labels).toHaveLength(10);
    const listed = [...temporary.labels, ...permanent.labels].sort();
    expect(listed).toEqual(CATEGORY_OPTIONS.map((o) => o.label).sort());
  });

  it("gives the session sizes the server allows contributors", () => {
    expect(SESSION_SIZES_TEXT).toBe(`${ALLOWED_SESSION_SIZES.slice(0, -1).join(", ")} or ${ALLOWED_SESSION_SIZES.at(-1)}`);
  });
});

describe("the guide's button names", () => {
  // guideCopy.js names buttons outside the box panel. Each must still say so
  // where the guide says it is.
  const read = (p) => readFileSync(`${process.cwd()}/${p}`, "utf8");

  it("match the dashboard, the session picker and the photo screen", () => {
    // The dashboard takes its words from dashboardCopy.js (17 Oct 2026)
    expect(read("src/features/contribute/dashboard/dashboardCopy.js")).toContain(`annotate: "Let's Annotate!"`);
    expect(read("src/pages/contribute/index.jsx")).toContain("COPY.annotate");
    // The picker takes its words from SessionSizeOptions, and shows them
    expect(read("src/features/annotate/SessionSizeOptions.jsx")).toContain(`start: "Start Session"`);
    expect(read("src/features/annotate/selection.jsx")).toContain("{loading ? COPY.starting : COPY.start}");
    const tool = read("src/ui/annotation-tool/ReactPictureAnnotation.tsx");
    expect(tool).toContain(`"Next Image"`);
    expect(tool).toContain(`label: "Previous"`);
    expect(tool).toContain(`button: "Add box"`);
    expect(read("src/ui/annotation-tool/DefaultInputSection.tsx")).toContain("Delete box");
    expect(read("src/ui/annotation-tool/DefaultInputSection.tsx")).toContain(">Not an object<");
    expect(read("src/ui/annotation-tool/DefaultInputSection.tsx")).toContain("Other...");
  });
});

// S16 follow-up (3 Nov 2026): the guide names the two questions as the box panel does
describe("the guide's question names", () => {
  const noop = () => undefined;
  const panel = (onSidewalk) => decode(renderToStaticMarkup(
    <DefaultInputSection value="tree" onChange={noop} onDelete={noop} onSelectObstruction={noop} onUnselectObstruction={noop} onMarkNotAnObject={noop} onSetSeverity={noop} onSetObstructs={noop} onClose={noop} onClearObstruction={noop} onRestoreObject={noop} editable={false} selected={false} isRejected={false} obstructs={undefined} severity={null} askSeverity onSidewalk={onSidewalk} />
  ));
  const guide = (id) => GUIDE_COPY.steps.find((s) => s.id === id).paragraphs.join(" ");

  it("match the panel's Question 1 and Question 2, in the panel's order", () => {
    const first = panel(undefined);
    const second = panel(true);
    expect(first).toContain(">Question 1 of 2<");
    expect(first).toContain("Is it on the sidewalk or the path people walk on?");
    expect(second).toContain(">Question 2 of 2<");
    expect(second).toMatch(/obstruct the sidewalk\?/);
    for (const id of ["answer", "not-an-object"]) {
      const text = guide(id);
      expect(text.indexOf("Question 1"), id).toBeGreaterThan(-1);
      expect(text.indexOf("Question 1"), id).toBeLessThan(text.indexOf("Question 2"));
    }
    // The guide's Question 2, the panel's wording with "it" for the object's name
    expect(guide("answer")).toContain("“Does it obstruct the sidewalk?”");
  });
});
