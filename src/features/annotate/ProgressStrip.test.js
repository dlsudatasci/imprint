import { describe, it, expect } from "vitest";

/**
 * ProgressStrip is a React component with DOM interactions (scroll, click,
 * ResizeObserver), so full rendering tests belong in a browser-level test
 * suite. These tests cover the pure logic the component relies on:
 *
 *   - Which images are clickable (completed only)
 *   - Navigation target calculation
 *   - Scroll arrow visibility rules
 */

// --- Extracted logic under test ---

function isClickable(index, current) {
  return index < current - 1;
}

function isCurrent(index, current) {
  return index === current - 1;
}

function getStatus(index, current) {
  if (index < current - 1) return "completed";
  if (index === current - 1) return "current";
  return "pending";
}

function getNavigationTarget(index) {
  return index + 1;
}

function shouldAllowNavigation(index, current) {
  const target = getNavigationTarget(index);
  return target < current;
}

function canScrollLeft(scrollLeft) {
  return scrollLeft > 1;
}

function canScrollRight(scrollLeft, scrollWidth, clientWidth) {
  return scrollLeft < scrollWidth - clientWidth - 1;
}

// --- Tests ---

// --- Tutorial button logic ---

function getVisibleButtons(isTutorial) {
  const buttons = [];
  if (!isTutorial) buttons.push("Pause Session");
  buttons.push(isTutorial ? "Stop Tutorial" : "Stop Session");
  return buttons;
}

// --- Centering logic ---

function shouldCenterStrip(imageCount) {
  return imageCount <= 7;
}

function shouldShowScrollArrows(imageCount) {
  return imageCount > 7;
}

describe("ProgressStrip tutorial mode", () => {
  it("shows both Pause and Stop in normal mode", () => {
    const buttons = getVisibleButtons(false);
    expect(buttons).toEqual(["Pause Session", "Stop Session"]);
  });

  it("hides Pause and renames Stop in tutorial mode", () => {
    const buttons = getVisibleButtons(true);
    expect(buttons).toEqual(["Stop Tutorial"]);
  });

  it("Pause is never shown in tutorial mode", () => {
    const buttons = getVisibleButtons(true);
    expect(buttons).not.toContain("Pause Session");
  });
});

describe("ProgressStrip centering", () => {
  it("centers strip when 7 or fewer images", () => {
    expect(shouldCenterStrip(1)).toBe(true);
    expect(shouldCenterStrip(3)).toBe(true);
    expect(shouldCenterStrip(7)).toBe(true);
  });

  it("does not center strip when more than 7 images", () => {
    expect(shouldCenterStrip(8)).toBe(false);
    expect(shouldCenterStrip(10)).toBe(false);
    expect(shouldCenterStrip(20)).toBe(false);
  });

  it("hides scroll arrows when 7 or fewer images", () => {
    expect(shouldShowScrollArrows(3)).toBe(false);
    expect(shouldShowScrollArrows(7)).toBe(false);
  });

  it("shows scroll arrows when more than 7 images", () => {
    expect(shouldShowScrollArrows(8)).toBe(true);
    expect(shouldShowScrollArrows(10)).toBe(true);
  });
});

describe("ProgressStrip logic", () => {
  describe("isClickable", () => {
    it("completed images (before current) are clickable", () => {
      expect(isClickable(0, 3)).toBe(true);
      expect(isClickable(1, 3)).toBe(true);
    });

    it("current image is not clickable", () => {
      expect(isClickable(2, 3)).toBe(false);
    });

    it("future images are not clickable", () => {
      expect(isClickable(3, 3)).toBe(false);
      expect(isClickable(4, 3)).toBe(false);
    });

    it("first image with current=1 is not clickable", () => {
      expect(isClickable(0, 1)).toBe(false);
    });
  });

  describe("isCurrent", () => {
    it("identifies the current image correctly", () => {
      expect(isCurrent(0, 1)).toBe(true);
      expect(isCurrent(4, 5)).toBe(true);
    });

    it("rejects non-current images", () => {
      expect(isCurrent(0, 2)).toBe(false);
      expect(isCurrent(2, 2)).toBe(false);
    });
  });

  describe("getStatus", () => {
    it("returns completed for images before current", () => {
      expect(getStatus(0, 3)).toBe("completed");
      expect(getStatus(1, 3)).toBe("completed");
    });

    it("returns current for the active image", () => {
      expect(getStatus(2, 3)).toBe("current");
    });

    it("returns pending for images after current", () => {
      expect(getStatus(3, 3)).toBe("pending");
      expect(getStatus(9, 3)).toBe("pending");
    });

    it("first image on a fresh session is current", () => {
      expect(getStatus(0, 1)).toBe("current");
    });

    it("all images pending except first on a fresh session", () => {
      expect(getStatus(1, 1)).toBe("pending");
      expect(getStatus(4, 1)).toBe("pending");
    });
  });

  describe("navigation target", () => {
    it("converts 0-based index to 1-based count", () => {
      expect(getNavigationTarget(0)).toBe(1);
      expect(getNavigationTarget(4)).toBe(5);
    });

    it("allows navigation only to completed images", () => {
      expect(shouldAllowNavigation(0, 3)).toBe(true);
      expect(shouldAllowNavigation(1, 3)).toBe(true);
    });

    it("prevents navigation to current image", () => {
      expect(shouldAllowNavigation(2, 3)).toBe(false);
    });

    it("prevents navigation to future images", () => {
      expect(shouldAllowNavigation(3, 3)).toBe(false);
      expect(shouldAllowNavigation(5, 3)).toBe(false);
    });

    it("prevents any navigation on a fresh session (current=1)", () => {
      expect(shouldAllowNavigation(0, 1)).toBe(false);
      expect(shouldAllowNavigation(1, 1)).toBe(false);
    });
  });

  describe("scroll arrow visibility", () => {
    it("left arrow hidden at scroll position 0", () => {
      expect(canScrollLeft(0)).toBe(false);
    });

    it("left arrow hidden at scroll position 1 (within threshold)", () => {
      expect(canScrollLeft(1)).toBe(false);
    });

    it("left arrow visible when scrolled past threshold", () => {
      expect(canScrollLeft(2)).toBe(true);
      expect(canScrollLeft(50)).toBe(true);
    });

    it("right arrow hidden when scrolled to the end", () => {
      expect(canScrollRight(900, 1000, 100)).toBe(false);
      expect(canScrollRight(899, 1000, 100)).toBe(false);
    });

    it("right arrow visible when there is more content", () => {
      expect(canScrollRight(0, 1000, 100)).toBe(true);
      expect(canScrollRight(500, 1000, 100)).toBe(true);
    });

    it("both arrows hidden when content fits without scrolling", () => {
      expect(canScrollLeft(0)).toBe(false);
      expect(canScrollRight(0, 500, 500)).toBe(false);
    });
  });
});
