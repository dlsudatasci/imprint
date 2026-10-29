// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import TauCard from "./TauCard";

/** The suggestion threshold τ on the admin Retraining tab (S2, 29 Oct 2026). */
let host;
let root;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
});

function render(tau) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<TauCard tau={tau} />));
  return host;
}

describe("TauCard", () => {
  it("shows the stored τ, its detector, when it was chosen, and its precision and recall", () => {
    const el = render({
      value: 0.43,
      isDefault: false,
      modelVersion: "det-v1-rfdetr-small",
      chosenAt: "2026-10-29T01:00:00Z",
      validationPrecision: 0.8,
      validationRecall: 0.712,
    });
    expect(el.querySelector("[data-testid='tau-value']").textContent).toBe("0.43");
    expect(el.querySelector("[data-testid='tau-model']").textContent).toBe("det-v1-rfdetr-small");
    expect(el.textContent).toContain("Set");
    expect(el.textContent).toContain("Oct 29, 2026");
    expect(el.textContent).toContain("0.80");
    expect(el.textContent).toContain("0.71");
    expect(el.textContent).not.toContain("Default");
  });

  it("says the default is in use and how to set one when nothing is stored", () => {
    const el = render({ value: 0.5, isDefault: true, modelVersion: null, chosenAt: null, validationPrecision: null, validationRecall: null });
    expect(el.querySelector("[data-testid='tau-value']").textContent).toBe("0.5");
    expect(el.textContent).toContain("Default");
    expect(el.textContent).toContain("No threshold is stored, so suggestions at or above 0.5 are shown.");
    expect(el.textContent).toContain("scripts/set-tau.mjs");
    expect(el.querySelector("[data-testid='tau-model']")).toBeNull();
  });

  it("has no em dashes or semicolons in its text", () => {
    for (const tau of [
      { value: 0.5, isDefault: true },
      { value: 0.43, isDefault: false, modelVersion: "det-v1", chosenAt: "2026-10-29T01:00:00Z", validationPrecision: 0.8, validationRecall: 0.7 },
    ]) {
      expect(render(tau).textContent).not.toMatch(/[—;]/);
      act(() => root.unmount());
      host.remove();
      root = null;
    }
  });

  it("renders nothing before the tab has the data", () => {
    expect(render(undefined).innerHTML).toBe("");
  });
});
