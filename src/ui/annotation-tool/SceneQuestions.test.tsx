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
