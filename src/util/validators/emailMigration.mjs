/**
 * The two one-off database changes for email verification (S9), shared by
 * scripts/normalize-emails.mjs and scripts/verify-existing-emails.mjs so tests
 * can run them against a stand-in database.
 *
 * Both count and change nothing unless `apply` is true, and both log counts
 * only, never an address or a username.
 *
 *   normalizeEmails        lowercases and trims every stored address, so one
 *                          address in two cases becomes one account under the
 *                          unique index on users.email. Refuses, even with
 *                          apply, when two accounts would end up with the same
 *                          address, and says only how many addresses collide.
 *   verifyExistingEmails   sets emailVerifiedAt to createdAt on accounts made
 *                          before the S9 deploy, the ones with no
 *                          emailVerifiedAt field at all (every account made
 *                          since has the field, null until confirmed). Pilot
 *                          accounts (S11) are left to confirm like anyone.
 */
import { normalizeEmail } from "./emailVerification.mjs";

/**
 * What normalizeEmails would change in `users` ({ _id, email } documents):
 * the accounts whose stored address differs from its normalized form, and how
 * many normalized addresses more than one account would share.
 */
export function planEmailNormalization(users) {
  const byAddress = new Map();
  const toChange = [];
  for (const user of users) {
    if (typeof user?.email !== "string") continue;
    const email = normalizeEmail(user.email);
    byAddress.set(email, (byAddress.get(email) || 0) + 1);
    if (email !== user.email) toChange.push({ _id: user._id, email });
  }
  const collisions = [...byAddress.values()].filter((n) => n > 1).length;
  return { checked: users.length, toChange, collisions };
}

export async function normalizeEmails(db, { apply = false, log = console.log } = {}) {
  const users = await db.collection("users").find({ email: { $type: "string" } }, { projection: { email: 1 } }).toArray();
  const plan = planEmailNormalization(users);
  log(`Accounts with an email address: ${plan.checked}`);
  log(`Addresses to lowercase or trim: ${plan.toChange.length}`);
  log(`Addresses shared by more than one account once lowercased: ${plan.collisions}`);

  if (plan.collisions > 0) {
    log("Refused: two or more accounts would share an address. Resolve those accounts first. Nothing was changed.");
    return { ...summary(plan), refused: true, changed: 0 };
  }
  if (!apply) {
    log("Counting only. Add --apply to change them. Nothing was changed.");
    return { ...summary(plan), refused: false, changed: 0 };
  }
  if (plan.toChange.length === 0) {
    log("Nothing to change.");
    return { ...summary(plan), refused: false, changed: 0 };
  }
  const result = await db.collection("users").bulkWrite(
    plan.toChange.map(({ _id, email }) => ({ updateOne: { filter: { _id }, update: { $set: { email } } } })),
    { ordered: true }
  );
  const changed = result?.modifiedCount ?? plan.toChange.length;
  log(`Changed: ${changed}`);
  return { ...summary(plan), refused: false, changed };
}

function summary(plan) {
  return { checked: plan.checked, toChange: plan.toChange.length, collisions: plan.collisions };
}

/** When an account was made: createdAt when it is a date, else the time in its ObjectId. */
export function accountCreatedAt(user) {
  const created = user?.createdAt ? new Date(user.createdAt) : null;
  if (created && !Number.isNaN(created.getTime())) return created;
  if (typeof user?._id?.getTimestamp === "function") return user._id.getTimestamp();
  return null;
}

/**
 * What verifyExistingEmails would change in `users`, the accounts with no
 * emailVerifiedAt field: each non-pilot account and the date to set, and how
 * many pilot accounts and accounts with no usable date are left alone.
 */
export function planVerifyExisting(users) {
  const toVerify = [];
  let pilotSkipped = 0;
  let undated = 0;
  for (const user of users) {
    if (!user || Object.prototype.hasOwnProperty.call(user, "emailVerifiedAt")) continue;
    if (user.isPilot === true) {
      pilotSkipped += 1;
      continue;
    }
    const at = accountCreatedAt(user);
    if (!at) {
      undated += 1;
      continue;
    }
    toVerify.push({ _id: user._id, at });
  }
  return { toVerify, pilotSkipped, undated };
}

export async function verifyExistingEmails(db, { apply = false, log = console.log } = {}) {
  const users = await db
    .collection("users")
    .find({ emailVerifiedAt: { $exists: false } }, { projection: { createdAt: 1, isPilot: 1 } })
    .toArray();
  const plan = planVerifyExisting(users);
  log(`Accounts with no emailVerifiedAt: ${users.length}`);
  log(`To mark confirmed from their sign-up date: ${plan.toVerify.length}`);
  log(`Pilot accounts left to confirm by email: ${plan.pilotSkipped}`);
  if (plan.undated > 0) log(`Accounts with no sign-up date, left alone: ${plan.undated}`);

  const result = { found: users.length, toVerify: plan.toVerify.length, pilotSkipped: plan.pilotSkipped, undated: plan.undated };
  if (!apply) {
    log("Counting only. Add --apply to change them. Nothing was changed.");
    return { ...result, changed: 0 };
  }
  if (plan.toVerify.length === 0) {
    log("Nothing to change.");
    return { ...result, changed: 0 };
  }
  // The filter repeats the condition, so an account confirmed in the meantime keeps its own date
  const written = await db.collection("users").bulkWrite(
    plan.toVerify.map(({ _id, at }) => ({
      updateOne: { filter: { _id, emailVerifiedAt: { $exists: false } }, update: { $set: { emailVerifiedAt: at } } },
    })),
    { ordered: false }
  );
  const changed = written?.modifiedCount ?? plan.toVerify.length;
  log(`Changed: ${changed}`);
  return { ...result, changed };
}
