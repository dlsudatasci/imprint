import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import {
  planEmailNormalization,
  normalizeEmails,
  accountCreatedAt,
  planVerifyExisting,
  verifyExistingEmails,
} from "./emailMigration.mjs";

// scripts/normalize-emails.mjs and scripts/verify-existing-emails.mjs (S9,
// decided 21 Oct 2026)
const id = (n) => new ObjectId(String(n).padStart(24, "0"));

/** A stand-in database: users.find returns `docs`, bulkWrite is recorded. */
function fakeDb(docs) {
  const users = {
    find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(docs) })),
    bulkWrite: vi.fn(async (ops) => ({ modifiedCount: ops.length })),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
  };
  return { db: { collection: vi.fn(() => users) }, users };
}

/** Everything the script printed, so tests can check nothing personal is in it. */
function logger() {
  const lines = [];
  return { lines, log: (s) => lines.push(String(s)) };
}

const PEOPLE = [
  { _id: id(1), email: "Rans.Test@Example.com", username: "rans_test" },
  { _id: id(2), email: " annotator@example.com ", username: "annotator_one" },
  { _id: id(3), email: "already@lower.case", username: "third_user" },
];

describe("planEmailNormalization", () => {
  it("lists only the addresses that change, with their new form", () => {
    const plan = planEmailNormalization(PEOPLE);
    expect(plan.checked).toBe(3);
    expect(plan.toChange).toEqual([
      { _id: id(1), email: "rans.test@example.com" },
      { _id: id(2), email: "annotator@example.com" },
    ]);
    expect(plan.collisions).toBe(0);
  });

  it("counts addresses two accounts would share once lowercased", () => {
    const plan = planEmailNormalization([
      { _id: id(1), email: "Same@Example.com" },
      { _id: id(2), email: "same@example.com" },
      { _id: id(3), email: "other@x.y" },
      { _id: id(4), email: "OTHER@x.y" },
      { _id: id(5), email: "third@x.y" },
    ]);
    expect(plan.collisions).toBe(2);
  });

  it("skips accounts with no address", () => {
    expect(planEmailNormalization([{ _id: id(1) }, { _id: id(2), email: null }]).toChange).toEqual([]);
  });
});

describe("normalizeEmails", () => {
  it("dry run: counts and writes nothing", async () => {
    const { db, users } = fakeDb(PEOPLE);
    const { lines, log } = logger();
    const result = await normalizeEmails(db, { log });
    expect(result).toEqual({ checked: 3, toChange: 2, collisions: 0, refused: false, changed: 0 });
    expect(users.bulkWrite).not.toHaveBeenCalled();
    expect(users.updateOne).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("Nothing was changed.");
  });

  it("--apply: lowercases each address that needs it, by id", async () => {
    const { db, users } = fakeDb(PEOPLE);
    const result = await normalizeEmails(db, { apply: true, log: () => {} });
    expect(result.changed).toBe(2);
    expect(users.bulkWrite.mock.calls[0][0]).toEqual([
      { updateOne: { filter: { _id: id(1) }, update: { $set: { email: "rans.test@example.com" } } } },
      { updateOne: { filter: { _id: id(2) }, update: { $set: { email: "annotator@example.com" } } } },
    ]);
  });

  it("refuses, even with --apply, when two accounts would collide, giving only the count", async () => {
    const docs = [...PEOPLE, { _id: id(4), email: "rans.test@example.com", username: "twin" }];
    const { db, users } = fakeDb(docs);
    const { lines, log } = logger();
    const result = await normalizeEmails(db, { apply: true, log });
    expect(result.refused).toBe(true);
    expect(result.collisions).toBe(1);
    expect(users.bulkWrite).not.toHaveBeenCalled();
    expect(lines.join("\n")).toMatch(/Refused/);
  });

  it("prints no address or username", async () => {
    const docs = [...PEOPLE, { _id: id(4), email: "rans.test@example.com", username: "twin" }];
    for (const apply of [false, true]) {
      for (const set of [PEOPLE, docs]) {
        const { db } = fakeDb(set);
        const { lines, log } = logger();
        await normalizeEmails(db, { apply, log });
        const out = lines.join("\n").toLowerCase();
        for (const p of set) {
          expect(out).not.toContain(p.email.trim().toLowerCase());
          expect(out).not.toContain(p.username);
        }
        expect(out).not.toContain("@");
      }
    }
  });

  it("reads only the address", async () => {
    const { db, users } = fakeDb(PEOPLE);
    await normalizeEmails(db, { log: () => {} });
    expect(users.find).toHaveBeenCalledWith({ email: { $type: "string" } }, { projection: { email: 1 } });
  });
});

describe("accountCreatedAt", () => {
  it("uses createdAt, else the time in the id", () => {
    expect(accountCreatedAt({ createdAt: new Date("2026-09-30T00:00:00Z") })).toEqual(new Date("2026-09-30T00:00:00Z"));
    expect(accountCreatedAt({ createdAt: "2026-09-30T00:00:00Z" })).toEqual(new Date("2026-09-30T00:00:00Z"));
    const oid = new ObjectId("6ac4cfd8d52b60835699bbc4");
    expect(accountCreatedAt({ _id: oid })).toEqual(oid.getTimestamp());
    expect(accountCreatedAt({ _id: oid, createdAt: "nope" })).toEqual(oid.getTimestamp());
    expect(accountCreatedAt({ _id: "plain" })).toBeNull();
  });
});

describe("planVerifyExisting", () => {
  it("marks accounts with no emailVerifiedAt field from their sign-up date, leaving pilot accounts to confirm", () => {
    const created = new Date("2026-10-01T00:00:00Z");
    const plan = planVerifyExisting([
      { _id: id(1), createdAt: created },
      { _id: id(2), createdAt: created, isPilot: true },
      { _id: id(3), createdAt: created, emailVerifiedAt: null },
      { _id: id(4), createdAt: created, emailVerifiedAt: created },
      { _id: "no-date" },
    ]);
    expect(plan.toVerify).toEqual([{ _id: id(1), at: created }]);
    expect(plan.pilotSkipped).toBe(1);
    expect(plan.undated).toBe(1);
  });
});

describe("verifyExistingEmails", () => {
  const created = new Date("2026-10-01T00:00:00Z");
  const OLD = [
    { _id: id(1), createdAt: created, username: "annotator_one", email: "a@example.com" },
    { _id: id(2), createdAt: created, isPilot: true, username: "pilot_one", email: "p@example.com" },
  ];

  it("dry run: counts and writes nothing", async () => {
    const { db, users } = fakeDb(OLD);
    const { lines, log } = logger();
    const result = await verifyExistingEmails(db, { log });
    expect(result).toEqual({ found: 2, toVerify: 1, pilotSkipped: 1, undated: 0, changed: 0 });
    expect(users.bulkWrite).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("Nothing was changed.");
  });

  it("asks only for accounts with no emailVerifiedAt field", async () => {
    const { db, users } = fakeDb(OLD);
    await verifyExistingEmails(db, { log: () => {} });
    expect(users.find).toHaveBeenCalledWith({ emailVerifiedAt: { $exists: false } }, { projection: { createdAt: 1, isPilot: 1 } });
  });

  it("--apply: sets emailVerifiedAt to the sign-up date, only where it is still missing", async () => {
    const { db, users } = fakeDb(OLD);
    const result = await verifyExistingEmails(db, { apply: true, log: () => {} });
    expect(result.changed).toBe(1);
    expect(users.bulkWrite.mock.calls[0][0]).toEqual([
      { updateOne: { filter: { _id: id(1), emailVerifiedAt: { $exists: false } }, update: { $set: { emailVerifiedAt: created } } } },
    ]);
  });

  it("prints no address or username", async () => {
    for (const apply of [false, true]) {
      const { db } = fakeDb(OLD);
      const { lines, log } = logger();
      await verifyExistingEmails(db, { apply, log });
      const out = lines.join("\n");
      for (const p of OLD) {
        expect(out).not.toContain(p.email);
        expect(out).not.toContain(p.username);
      }
    }
  });

  it("writes nothing when there is nothing to do", async () => {
    const { db, users } = fakeDb([]);
    const result = await verifyExistingEmails(db, { apply: true, log: () => {} });
    expect(result.changed).toBe(0);
    expect(users.bulkWrite).not.toHaveBeenCalled();
  });
});
