// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  writeSession,
  writeTutorialFlag,
  readTutorialFlag,
  readTotalCount,
  readCurrentCount,
  clearSession,
} from "@/util/sessionCache";

/**
 * Tests for the tutorial/session state logic used by the navbar and dashboard.
 *
 * The navbar and dashboard both read from localStorage to decide what to show.
 * This file tests the state transitions that drive those decisions:
 *
 *   - Tutorial session cached → show "Resume Tutorial" / "Stop Tutorial"
 *   - Real session cached → show "Resume Session"
 *   - No session cached → show default buttons
 *   - Stopping tutorial → clears cache, returns to default
 */

// Pure logic extracted from navbar/dashboard for testing
function classifySession() {
  const hasLocalSession =
    readTotalCount() !== null && readCurrentCount() !== null;

  if (hasLocalSession && readTutorialFlag()) {
    return "tutorial";
  }
  if (hasLocalSession) {
    return "active";
  }
  return "none";
}

function getNavbarButtonLabel(sessionType, hasActiveServerSession) {
  if (sessionType === "tutorial") return "Resume Tutorial";
  if (sessionType === "active" || hasActiveServerSession) return "Resume Session";
  return "Let's Annotate!";
}

function getNavbarLinkTarget(sessionType) {
  if (sessionType === "tutorial") return "/contribute/tutorial";
  return "/contribute/annotate";
}

function getDashboardButtons(sessionType, hasCompletedDemo, isProfileIncomplete) {
  if (sessionType === "tutorial") {
    return ["Resume Tutorial", "Stop Tutorial"];
  }

  if (sessionType === "active") {
    return ["Resume Session", "Stop Session"];
  }

  const buttons = [];
  if (hasCompletedDemo) buttons.push("Replay Tutorial");

  if (!hasCompletedDemo) {
    buttons.push("Start Demo Tutorial");
  } else if (isProfileIncomplete) {
    buttons.push("Complete Profile to Start");
  } else {
    buttons.push("Let's Annotate!");
  }

  return buttons;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("classifySession", () => {
  it("returns 'none' when nothing is cached", () => {
    expect(classifySession()).toBe("none");
  });

  it("returns 'active' for a real annotation session", () => {
    writeSession({ total: 10, current: 3 });
    expect(classifySession()).toBe("active");
  });

  it("returns 'tutorial' when tutorial flag is set", () => {
    writeSession({ total: 3, current: 1 });
    writeTutorialFlag(true);
    expect(classifySession()).toBe("tutorial");
  });

  it("returns 'none' when only tutorial flag is set but no session data", () => {
    writeTutorialFlag(true);
    expect(classifySession()).toBe("none");
  });

  it("returns 'none' after clearing session", () => {
    writeSession({ total: 3, current: 1 });
    writeTutorialFlag(true);
    clearSession();
    expect(classifySession()).toBe("none");
  });

  it("returns 'active' when tutorial flag is explicitly false", () => {
    writeSession({ total: 10, current: 5 });
    writeTutorialFlag(false);
    expect(classifySession()).toBe("active");
  });
});

describe("getNavbarButtonLabel", () => {
  it("shows 'Resume Tutorial' for tutorial sessions", () => {
    expect(getNavbarButtonLabel("tutorial", false)).toBe("Resume Tutorial");
  });

  it("shows 'Resume Session' for active sessions", () => {
    expect(getNavbarButtonLabel("active", false)).toBe("Resume Session");
  });

  it("shows 'Resume Session' when server reports active session", () => {
    expect(getNavbarButtonLabel("none", true)).toBe("Resume Session");
  });

  it("shows 'Let's Annotate!' when no session exists", () => {
    expect(getNavbarButtonLabel("none", false)).toBe("Let's Annotate!");
  });
});

describe("getNavbarLinkTarget", () => {
  it("links to tutorial page for tutorial sessions", () => {
    expect(getNavbarLinkTarget("tutorial")).toBe("/contribute/tutorial");
  });

  it("links to annotate page for other sessions", () => {
    expect(getNavbarLinkTarget("active")).toBe("/contribute/annotate");
    expect(getNavbarLinkTarget("none")).toBe("/contribute/annotate");
  });
});

describe("getDashboardButtons", () => {
  it("shows Resume/Stop for tutorial sessions regardless of other state", () => {
    expect(getDashboardButtons("tutorial", true, false)).toEqual([
      "Resume Tutorial",
      "Stop Tutorial",
    ]);
    expect(getDashboardButtons("tutorial", false, true)).toEqual([
      "Resume Tutorial",
      "Stop Tutorial",
    ]);
  });

  it("shows Replay + Let's Annotate when demo is done and profile is complete", () => {
    expect(getDashboardButtons("none", true, false)).toEqual([
      "Replay Tutorial",
      "Let's Annotate!",
    ]);
  });

  it("shows Start Demo Tutorial when demo is not done", () => {
    expect(getDashboardButtons("none", false, false)).toEqual([
      "Start Demo Tutorial",
    ]);
  });

  it("shows Resume/Stop Session for active real sessions", () => {
    expect(getDashboardButtons("active", true, false)).toEqual([
      "Resume Session",
      "Stop Session",
    ]);
    expect(getDashboardButtons("active", false, false)).toEqual([
      "Resume Session",
      "Stop Session",
    ]);
  });

  it("shows Complete Profile when demo is done but profile incomplete", () => {
    expect(getDashboardButtons("none", true, true)).toEqual([
      "Replay Tutorial",
      "Complete Profile to Start",
    ]);
  });
});

describe("tutorial session lifecycle", () => {
  it("starting tutorial: sets session + flag → classified as tutorial", () => {
    writeSession({ total: 3, current: 1, data: { imgRecords: [] } });
    writeTutorialFlag(true);

    expect(classifySession()).toBe("tutorial");
    expect(getNavbarButtonLabel("tutorial", false)).toBe("Resume Tutorial");
    expect(getDashboardButtons("tutorial", true, false)).toEqual([
      "Resume Tutorial",
      "Stop Tutorial",
    ]);
  });

  it("stopping tutorial: clearSession → back to default", () => {
    writeSession({ total: 3, current: 1, data: { imgRecords: [] } });
    writeTutorialFlag(true);
    clearSession();

    expect(classifySession()).toBe("none");
    expect(readTutorialFlag()).toBe(false);
    expect(getDashboardButtons("none", true, false)).toEqual([
      "Replay Tutorial",
      "Let's Annotate!",
    ]);
  });

  it("real session after tutorial: no tutorial flag", () => {
    // Tutorial was stopped, now starting real session
    writeSession({ total: 10, current: 1 });

    expect(classifySession()).toBe("active");
    expect(readTutorialFlag()).toBe(false);
    expect(getNavbarButtonLabel("active", false)).toBe("Resume Session");
  });

  it("tutorial flag does not leak into real sessions", () => {
    writeSession({ total: 3, current: 1 });
    writeTutorialFlag(true);
    clearSession();

    writeSession({ total: 10, current: 1 });
    expect(classifySession()).toBe("active");
  });

  it("pausing real session: clearSession clears local cache, server session persists", () => {
    writeSession({ total: 10, current: 5, data: { imgRecords: [] } });
    expect(classifySession()).toBe("active");
    expect(getDashboardButtons("active", true, false)).toEqual([
      "Resume Session",
      "Stop Session",
    ]);

    // Pause clears localStorage but server session stays active
    clearSession();
    expect(classifySession()).toBe("none");
    // Server fallback would set sessionType to "active" again
    expect(getDashboardButtons("active", true, false)).toEqual([
      "Resume Session",
      "Stop Session",
    ]);
  });

  it("stopping real session: shows default buttons", () => {
    writeSession({ total: 10, current: 5 });
    clearSession();
    // After abandon API + clearSession, server session is gone too
    expect(classifySession()).toBe("none");
    expect(getDashboardButtons("none", true, false)).toEqual([
      "Replay Tutorial",
      "Let's Annotate!",
    ]);
  });
});
