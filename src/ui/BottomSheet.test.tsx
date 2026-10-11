// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import BottomSheet, { type SheetSnap } from "./BottomSheet";

/** The answers sheet on phones and tablets (9 Oct 2026). */
let root: Root | null = null;
let host: HTMLDivElement;
const changes: SheetSnap[] = [];

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  changes.length = 0;
});

function Harness() {
  const [snap, setSnap] = useState<SheetSnap>("collapsed");
  return (
    <BottomSheet
      id="answer-sheet"
      snap={snap}
      onSnapChange={(next) => {
        changes.push(next);
        setSnap(next);
      }}
      header={<p data-part="header">Still to decide 3</p>}
      footer={<p data-part="footer">Next Image</p>}
    >
      <p data-part="body">Step 2: Rate the Sidewalk</p>
    </BottomSheet>
  );
}

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
}

const handle = () => host.querySelector("button[aria-expanded]") as HTMLButtonElement;

describe("BottomSheet", () => {
  it("renders its header, body and footer", () => {
    mount();
    expect(host.querySelector("[data-part=header]")?.textContent).toBe("Still to decide 3");
    expect(host.querySelector("[data-part=body]")?.textContent).toBe("Step 2: Rate the Sidewalk");
    expect(host.querySelector("[data-part=footer]")?.textContent).toBe("Next Image");
    expect(host.querySelector("#answer-sheet")).not.toBeNull();
  });

  it("has a handle button that says what it does and toggles between collapsed and half", () => {
    mount();
    expect(handle().tagName).toBe("BUTTON");
    expect(handle().getAttribute("aria-expanded")).toBe("false");
    expect(handle().getAttribute("aria-label")).toBe("Show more");
    act(() => handle().click());
    expect(changes).toEqual(["half"]);
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(handle().getAttribute("aria-label")).toBe("Show less");
    act(() => handle().click());
    expect(changes).toEqual(["half", "collapsed"]);
    expect(handle().getAttribute("aria-expanded")).toBe("false");
  });

  it("lets only the header drag, and leaves sideways scrolling in it to the browser", () => {
    mount();
    const header = handle().parentElement as HTMLElement;
    expect(header.style.touchAction).toBe("pan-x");
  });
});
