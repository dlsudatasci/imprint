// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactPictureAnnotation from "./ReactPictureAnnotation";
import { writeSession } from "@/util/sessionCache";
import { PROPOSAL_HINT_COPY } from "@/util/modelProposal";

/**
 * The classifier's proposal from the image record reaches the box panel (S3,
 * 6 Nov 2026): a suggestion whose record entry carries `proposedObstructs`
 * shows the hint on Question 2, one without shows nothing new, and a drawn
 * box and an annotator's panel never show it. Same stand-in canvas as
 * ReactPictureAnnotation.panel.test.tsx.
 */
type Tool = {
  selectBoxById(id: string): void;
  state: { showInput: boolean; proposedObstructs: boolean | null };
};

const mark = (x: number, y: number) => ({ x, y, width: 40, height: 60, type: "RECT" });
// On the path already, so the panel opens on Question 2
const suggestion = (id: string, x: number, extra: Record<string, unknown> = {}) => ({
  id, comment: "tree", mark: mark(x, 100), editable: false, selected: false, isRejected: false, onSidewalk: true, ...extra,
});
const boxes = [
  suggestion("yes", 50, { proposedObstructs: true, obstructionProbability: 0.81 }),
  suggestion("no", 200, { proposedObstructs: false, obstructionProbability: 0.12 }),
  suggestion("none", 350),
  // A drawn box handed a proposal by mistake
  { id: "drawn", comment: "bollard", mark: mark(500, 100), editable: true, selected: false, isRejected: false, onSidewalk: true, proposedObstructs: true },
];

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean; ResizeObserver: unknown };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const store: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(store, {
    get: (target, prop) => (prop in target ? target[prop] : prop === "measureText" ? () => ({ width: 40 }) : () => undefined),
    set: (target, prop, value) => {
      target[prop] = value;
      return true;
    },
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
});

let root: Root | null = null;
let host: HTMLDivElement;

function mount({ isAnnotator = false } = {}): Tool {
  window.localStorage.clear();
  writeSession({ total: 1, current: 1, data: { imgRecords: [{ imageID: "IMG", url: "/p.jpg", annotationList: boxes, userHasSidewalk: true }], isAnnotator } });
  const ref = React.createRef<ReactPictureAnnotation>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ReactPictureAnnotation
        ref={ref}
        image="/p.jpg"
        onSelect={() => undefined}
        onChange={() => undefined}
        width={960}
        height={600}
        annotationData={JSON.parse(JSON.stringify(boxes))}
        imageID="IMG"
        city="manila"
        currentAnnotationCount={1}
        totalAnnotationCount={1}
        username="test"
        isAnnotator={isAnnotator}
      />
    );
  });
  return ref.current as unknown as Tool;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

const hints = () => Array.from(host.querySelectorAll("[data-proposal-hint]")).map((el) => el.textContent);

describe("the record's proposal in the tool (S3)", () => {
  it("shows a suggestion's proposal that it obstructs on Question 2, and nothing for false or none", () => {
    const tool = mount();
    act(() => tool.selectBoxById("yes"));
    expect(tool.state.proposedObstructs).toBe(true);
    expect(hints().length).toBeGreaterThan(0);
    expect(new Set(hints())).toEqual(new Set([PROPOSAL_HINT_COPY.obstructs]));
    expect(host.textContent).toContain("Question 2 of 2");

    // A proposal of false shows nothing (6 Nov 2026)
    act(() => tool.selectBoxById("no"));
    expect(tool.state.proposedObstructs).toBe(false);
    expect(hints()).toEqual([]);
    expect(host.textContent).toContain("Question 2 of 2");

    act(() => tool.selectBoxById("none"));
    expect(tool.state.proposedObstructs).toBeNull();
    expect(hints()).toEqual([]);
    expect(host.textContent).toContain("Question 2 of 2");
  });

  it("never shows the probability", () => {
    const tool = mount();
    act(() => tool.selectBoxById("yes"));
    expect(host.textContent).not.toContain("0.81");
    expect(host.textContent).not.toContain("81");
  });

  it("never gives a drawn box a proposal, even one carrying the field", () => {
    const tool = mount();
    act(() => tool.selectBoxById("drawn"));
    expect(tool.state.showInput).toBe(true);
    expect(tool.state.proposedObstructs).toBeNull();
    expect(hints()).toEqual([]);
  });

  it("never shows it to annotators", () => {
    const tool = mount({ isAnnotator: true });
    for (const id of ["yes", "no"]) {
      act(() => tool.selectBoxById(id));
      expect(tool.state.proposedObstructs).toBeNull();
      expect(hints()).toEqual([]);
      expect(host.textContent).not.toMatch(/model thinks/i);
    }
  });
});
