// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import AccountsTab from "./AccountsTab";

/**
 * The admin Accounts tab's notices and badges for the two sign-up switches:
 * SIGNUP_ROLE (6 Oct 2026) and SIGNUP_PILOT (S11, 23 Oct 2026).
 */

const ROLE_NOTICE = "New sign-ups become annotators. Set SIGNUP_ROLE back before contributors open.";
const PILOT_NOTICE = "New contributor sign-ups are marked as pilot accounts. Remove SIGNUP_PILOT when the pilot ends.";

function row(overrides) {
  return {
    id: "b".repeat(24),
    username: "someone",
    email: "s@example.com",
    role: "user",
    roleLabel: "Contributor",
    createdAt: "2026-10-23T00:00:00Z",
    profileComplete: true,
    isPilot: false,
    emailVerified: true,
    annotations: 0,
    activeSession: false,
    isSelf: false,
    editable: true,
    ...overrides,
  };
}

const ACCOUNTS = [
  row({ id: "a".repeat(24), username: "francis", role: "admin", roleLabel: "Admin", isSelf: true, editable: false }),
  row({ id: "c".repeat(24), username: "pilot_one", isPilot: true }),
  row({ id: "d".repeat(24), username: "pilot_two", isPilot: true, role: "annotator", roleLabel: "Annotator" }),
  row({ id: "e".repeat(24), username: "annotator_one", role: "annotator", roleLabel: "Annotator" }),
  row({ id: "f".repeat(24), username: "contributor_one", emailVerified: false }),
];

let root;
let host;
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  root = null;
});

async function mount(body) {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => body }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AccountsTab />));
  await act(async () => {});
  return host;
}

const notices = (el) => [...el.querySelectorAll('[role="status"]')].map((n) => n.textContent.trim());
const rowOf = (el, username) => [...el.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(username));
const pilotBadges = (el) => [...el.querySelectorAll("tbody span")].filter((s) => s.textContent.trim() === "Pilot");

describe("the Accounts tab's Pilot badge", () => {
  it("marks exactly the accounts with isPilot, whatever their role", async () => {
    const el = await mount({ accounts: ACCOUNTS, signupRole: "user", signupPilot: false });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/admin/accounts");
    expect(pilotBadges(el)).toHaveLength(2);
    for (const username of ["pilot_one", "pilot_two"]) {
      expect(pilotBadges(rowOf(el, username))).toHaveLength(1);
    }
    for (const username of ["francis", "annotator_one", "contributor_one"]) {
      expect(pilotBadges(rowOf(el, username))).toHaveLength(0);
    }
  });

  it("keeps the badge out of the username cell, so usernames copy cleanly", async () => {
    const el = await mount({ accounts: ACCOUNTS, signupRole: "user", signupPilot: true });
    const usernameCell = rowOf(el, "pilot_one").querySelector("td");
    expect(usernameCell.textContent).toBe("pilot_one");
  });

  it("shows no badge when the server sends no isPilot", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- a row from before S11
    const accounts = ACCOUNTS.map(({ isPilot, ...rest }) => rest);
    const el = await mount({ accounts, signupRole: "user" });
    expect(pilotBadges(el)).toHaveLength(0);
  });
});

describe("the Accounts tab's sign-up notices", () => {
  it("says new contributors are pilot accounts while SIGNUP_PILOT is on", async () => {
    const el = await mount({ accounts: ACCOUNTS, signupRole: "user", signupPilot: true });
    expect(notices(el)).toEqual([PILOT_NOTICE]);
  });

  it("shows no pilot notice while it is off, or when the server does not say true", async () => {
    for (const signupPilot of [false, undefined, "true", 1]) {
      const el = await mount({ accounts: ACCOUNTS, signupRole: "user", signupPilot });
      expect(notices(el)).toEqual([]);
      act(() => root.unmount());
      host.remove();
      root = null;
    }
  });

  it("shows both notices, the role one first, while both switches are on", async () => {
    const el = await mount({ accounts: ACCOUNTS, signupRole: "annotator", signupPilot: true });
    expect(notices(el)).toEqual([ROLE_NOTICE, PILOT_NOTICE]);
  });

  it("keeps the role notice on its own while only SIGNUP_ROLE is on", async () => {
    const el = await mount({ accounts: ACCOUNTS, signupRole: "annotator", signupPilot: false });
    expect(notices(el)).toEqual([ROLE_NOTICE]);
  });

  it("has no em dashes or semicolons in the notice or the badge", async () => {
    const el = await mount({ accounts: ACCOUNTS, signupRole: "user", signupPilot: true });
    const badge = pilotBadges(el)[0];
    for (const s of [...notices(el), badge.textContent, badge.getAttribute("title")]) {
      expect(s).not.toMatch(/[—;]/);
    }
  });
});

// Email verification (S9, decided 21 Oct 2026)
describe("the Accounts tab's email state", () => {
  const badgeIn = (el, username) =>
    [...rowOf(el, username).querySelectorAll("td")[1].querySelectorAll("span")].map((b) => b.textContent.trim());

  it("says whether each account's address is confirmed, under the address", async () => {
    const el = await mount({ accounts: ACCOUNTS, signupRole: "user", signupPilot: false });
    expect(badgeIn(el, "contributor_one")).toEqual(["Not confirmed"]);
    for (const username of ["francis", "pilot_one", "annotator_one"]) {
      expect(badgeIn(el, username)).toEqual(["Confirmed"]);
    }
  });

  it("shows nothing for an account with no address", async () => {
    const el = await mount({ accounts: [row({ username: "no_email", email: null, emailVerified: false })], signupRole: "user" });
    expect(badgeIn(el, "no_email")).toEqual([]);
  });
});
