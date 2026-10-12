// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { username: "test" } }, status: "authenticated" }) }));
vi.mock("next/router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/navbarMain", () => ({ default: () => <nav data-navbar>Imprint</nav> }));
vi.mock("@/features/footerMain", () => ({ default: () => <footer data-footer>Footer</footer> }));

import ContributeLayout from "./contribute";
import { useHideSiteChrome } from "./siteChrome";

/**
 * The site's navbar and footer are not rendered while a page shows a
 * full-screen surface (12 Oct 2026): on a phone the navbar was painted over
 * the annotation screen's top bar.
 */
let root;
let host;
const mounts = { page: 0 };

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  mounts.page = 0;
});

function Screen() {
  useHideSiteChrome(true);
  return <p data-screen>Sidewalk 1 of 3</p>;
}

let setShowScreen;
function Page() {
  const [show, setShow] = useState(false);
  setShowScreen = setShow;
  // Counts how often the page is built, to check that hiding never rebuilds it
  useState(() => {
    mounts.page += 1;
  });
  return (
    <div data-page>
      {show && <Screen />}
    </div>
  );
}

function mount(node) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(node));
}

const has = (selector) => host.querySelector(selector) !== null;

describe("hiding the site chrome", () => {
  it("removes the navbar and footer while a screen asks, and brings them back when it goes", () => {
    mount(
      <ContributeLayout>
        <Page />
      </ContributeLayout>
    );
    expect(has("[data-navbar]")).toBe(true);
    expect(has("[data-footer]")).toBe(true);
    expect(host.firstElementChild.className).toContain("min-h-screen");

    act(() => setShowScreen(true));
    expect(has("[data-screen]")).toBe(true);
    expect(has("[data-navbar]")).toBe(false);
    expect(has("[data-footer]")).toBe(false);
    expect(host.firstElementChild.className).not.toContain("min-h-screen");

    act(() => setShowScreen(false));
    expect(has("[data-navbar]")).toBe(true);
    expect(has("[data-footer]")).toBe(true);
    // The page was built once: hiding the chrome never rebuilds it
    expect(mounts.page).toBe(1);
  });

  it("does nothing outside a provider", () => {
    expect(() => mount(<Screen />)).not.toThrow();
    expect(has("[data-screen]")).toBe(true);
  });
});
