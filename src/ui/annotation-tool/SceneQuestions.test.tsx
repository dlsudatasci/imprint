// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import SceneQuestions, { type SceneLevel } from "./SceneQuestions";

/**
 * Step 2, moved out of ReactPictureAnnotation so the landing page's preview
 * can show it. Its markup is unchanged: the tutorial points at
 * #scene-level-section, and the tool's own tests still run through it.
 */
const empty: SceneLevel = { sidewalkWidth: null, surfaceCondition: null, walkability: null, overallAccessibility: null };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(sceneLevel: SceneLevel, onAnswer = vi.fn()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<SceneQuestions sceneLevel={sceneLevel} variant="desktop" onAnswer={onAnswer} />));
  return { onAnswer, option: (key: string) => host!.querySelector<HTMLButtonElement>(`[data-scene-option="${key}"]`)! };
}

describe("SceneQuestions", () => {
  it("renders the four questions under the id the tutorial points at", () => {
    const html = renderToStaticMarkup(<SceneQuestions sceneLevel={empty} variant="desktop" onAnswer={() => {}} />);
    expect(html).toContain('id="scene-level-section"');
    for (const title of ["Step 2: Rate the Sidewalk", "Sidewalk Width", "Surface Condition", "Walking Comfort", "Accessible to Me"]) {
      expect(html).toContain(title);
    }
    expect(html.match(/data-scene-option=/g)).toHaveLength(4 + 3 + 3 + 5);
  });

  it("passes one answer at a time", () => {
    const { onAnswer, option } = mount(empty);
    act(() => option("surfaceCondition:2").click());
    expect(onAnswer).toHaveBeenLastCalledWith({ surfaceCondition: 2 });
    act(() => option("sidewalkWidth:two_people").click());
    expect(onAnswer).toHaveBeenLastCalledWith({ sidewalkWidth: "two_people" });
  });

  it("clears the other three answers when None is chosen for the width", () => {
    const { onAnswer, option } = mount(empty);
    act(() => option("sidewalkWidth:no_sidewalk").click());
    expect(onAnswer).toHaveBeenLastCalledWith({
      sidewalkWidth: "no_sidewalk",
      surfaceCondition: null,
      walkability: null,
      overallAccessibility: null,
    });
  });

  it("greys out and disables the other three questions when there is no sidewalk", () => {
    const { onAnswer, option } = mount({ ...empty, sidewalkWidth: "no_sidewalk" });
    expect(option("walkability:1").disabled).toBe(true);
    act(() => option("walkability:1").click());
    expect(onAnswer).not.toHaveBeenCalled();
    expect(host!.textContent).toContain("Not applicable. There is no sidewalk.");
  });

  it("marks the chosen answer", () => {
    const { option } = mount({ ...empty, overallAccessibility: 2 });
    expect(option("overallAccessibility:2").className).toContain("border-primary");
    expect(option("overallAccessibility:1").className).not.toContain("border-primary bg-primary/10");
  });
});

// apple-design check, 17 Oct 2026: the answers were 9 and 10 px on a laptop
describe("answer labels", () => {
  it("are 11 px at the least on a laptop, 12 px in the sheet", () => {
    const desktop = renderToStaticMarkup(<SceneQuestions sceneLevel={empty} variant="desktop" onAnswer={() => undefined} />);
    expect(desktop).not.toMatch(/text-\[(9|10)px\]/);
    for (const label of ["Wide", "Easy to traverse", "Somewhat uncomfortable", "Easily accessible", "Not accessible"]) {
      expect(desktop).toMatch(new RegExp(`text-\\[11px\\][^"]*">${label}<`));
    }
    const sheet = renderToStaticMarkup(<SceneQuestions sceneLevel={empty} variant="sheet" onAnswer={() => undefined} />);
    expect(sheet).not.toMatch(/text-\[(9|10|11)px\]/);
  });
});

// 22 Oct 2026: worst to best, higher is better (validators/sceneScale.mjs)
describe("the order of the answers", () => {
  it("runs worst to best, so 5 is Easily accessible and the width starts at None", () => {
    const html = renderToStaticMarkup(<SceneQuestions sceneLevel={empty} variant="desktop" onAnswer={() => undefined} />);
    const order = Array.from(html.matchAll(/data-scene-option="([^"]+)"/g), (m) => m[1]);
    expect(order).toEqual([
      "sidewalkWidth:no_sidewalk", "sidewalkWidth:one_person", "sidewalkWidth:two_people", "sidewalkWidth:three_or_more",
      "surfaceCondition:1", "surfaceCondition:2", "surfaceCondition:3",
      "walkability:1", "walkability:2", "walkability:3",
      "overallAccessibility:1", "overallAccessibility:2", "overallAccessibility:3", "overallAccessibility:4", "overallAccessibility:5",
    ]);
    const labelOf = (key: string) => html.match(new RegExp(`data-scene-option="${key}"[\\s\\S]*?<span[^>]*>([^<]+)</span>`))![1];
    expect(labelOf("overallAccessibility:5")).toBe("Easily accessible");
    expect(labelOf("overallAccessibility:1")).toBe("Not accessible");
    expect(labelOf("surfaceCondition:3")).toBe("Easy to traverse");
    expect(labelOf("walkability:3")).toBe("Comfortable");
  });
});
