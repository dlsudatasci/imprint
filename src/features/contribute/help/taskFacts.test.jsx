import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import SceneQuestions from "@/ui/annotation-tool/SceneQuestions";
import { severityLabel } from "@/ui/annotation-tool/DefaultInputSection";
import { CATEGORY_OPTIONS } from "@/util/categoryOptions";
import { ALLOWED_SESSION_SIZES } from "@/util/validators/annotationGet";
import { SEVERITY_SCALE, SCENE_QUESTIONS, CATEGORY_GROUPS, SESSION_SIZES_TEXT } from "./taskFacts";

/**
 * The About page and the annotation guide describe the task from taskFacts.js
 * (16 Oct 2026). These tests hold it to the tool itself, so a change to the
 * tool's wording fails here, naming the line that is now wrong, instead of the
 * public pages quietly describing an older tool (which is how the old guide
 * ended up showing a 1 to 10 slider).
 */
const empty = { sidewalkWidth: null, surfaceCondition: null, walkability: null, overallAccessibility: null };
const decode = (html) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

describe("taskFacts against the tool", () => {
  it("words the severity scale exactly as the severity picker does", () => {
    expect(SEVERITY_SCALE.map((s) => s.value)).toEqual([1, 2, 3, 4, 5]);
    for (const s of SEVERITY_SCALE) expect(s.label).toBe(severityLabel(s.value));
  });

  it("names the four Step 2 questions, their prompts and every answer as SceneQuestions shows them", () => {
    const html = decode(renderToStaticMarkup(<SceneQuestions sceneLevel={empty} variant="desktop" onAnswer={() => {}} />));
    expect(SCENE_QUESTIONS).toHaveLength(4);
    for (const q of SCENE_QUESTIONS) {
      expect(html).toContain(`>${q.name}<`);
      expect(html).toContain(q.prompt);
      for (const a of q.answers) expect(html).toContain(`>${a}<`);
    }
  });

  // 22 Oct 2026: worst to best, the answer's place its stored number less one
  it("lists each question's answers in the tool's order, worst to best, the numbered ones by their value", () => {
    const html = decode(renderToStaticMarkup(<SceneQuestions sceneLevel={empty} variant="desktop" onAnswer={() => {}} />));
    const shown = [...html.matchAll(/data-scene-option="([a-zA-Z]+):([^"]+)"[\s\S]*?<span[^>]*>([^<]+)<\/span>/g)].map(([, field, value, label]) => ({ field, value, label }));
    const fields = ["sidewalkWidth", "surfaceCondition", "walkability", "overallAccessibility"];
    SCENE_QUESTIONS.forEach((q, i) => {
      const options = shown.filter((o) => o.field === fields[i]);
      expect(options.map((o) => o.label)).toEqual([...q.answers]);
      if (i > 0) expect(options.map((o) => Number(o.value))).toEqual(q.answers.map((_, n) => n + 1));
    });
    expect(SCENE_QUESTIONS[0].answers[0]).toBe("None");
    expect(SCENE_QUESTIONS[3].answers.at(-1)).toBe("Easily accessible");
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
