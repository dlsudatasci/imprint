/**
 * Step 5 role assignment (decided 30 Sep 2026). Pure helpers used by
 * scripts/apply-roles.mjs, kept free of "@/" imports so the script can load them.
 *
 * Each image gets exactly one role, recorded in roles.csv
 * (thesis scripts/mapillary/data/step5/). The role decides who may be served it:
 *   model_dev   annotators only (training, validation and test data)
 *   reference   annotators (drawn from scratch) and contributors (one in eight)
 *   deployment  contributors only
 *   reserve     nobody, until a block is promoted to "served"
 */

export const ROLE_FIELDS = Object.freeze({
  model_dev: Object.freeze({ poolStatus: "model_dev", isReference: false }),
  reference: Object.freeze({ poolStatus: "served", isReference: true }),
  deployment: Object.freeze({ poolStatus: "served", isReference: false }),
  reserve: Object.freeze({ poolStatus: "reserve", isReference: false }),
});

export const ROLES = Object.freeze(Object.keys(ROLE_FIELDS));

/** Parses roles.csv. Needs `imageName` and `role` columns; other columns are ignored. */
export function parseRolesCsv(text) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new Error("roles file is empty");
  const header = lines[0].split(",").map((h) => h.trim());
  const iName = header.indexOf("imageName");
  const iRole = header.indexOf("role");
  if (iName === -1 || iRole === -1) throw new Error("roles file needs imageName and role columns");
  return lines.slice(1).map((line, n) => {
    const cells = line.split(",");
    if (cells.length !== header.length) {
      throw new Error(`line ${n + 2}: expected ${header.length} columns, found ${cells.length}`);
    }
    return { imageName: cells[iName].trim(), role: cells[iRole].trim() };
  });
}

/** Parses "model_dev=1002,reference=150,..." into { model_dev: 1002, ... }. */
export function parseExpectedCounts(spec) {
  const out = {};
  for (const part of String(spec).split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^([a-z_]+)=(\d+)$/.exec(part);
    if (!m || !ROLES.includes(m[1])) throw new Error(`bad --expect entry "${part}"`);
    out[m[1]] = Number(m[2]);
  }
  return out;
}

/** Checks the rows on their own: names, roles, duplicates and expected counts. */
export function validateRoleRows(rows, expected = {}) {
  const problems = [];
  const seen = new Set();
  const counts = Object.fromEntries(ROLES.map((r) => [r, 0]));
  rows.forEach((row, i) => {
    const tag = `row ${i + 1}`;
    if (!row.imageName || !/^[A-Za-z0-9_.-]+\.jpg$/.test(row.imageName)) problems.push(`${tag}: bad imageName "${row.imageName}"`);
    if (!ROLES.includes(row.role)) problems.push(`${tag}: unknown role "${row.role}"`);
    else counts[row.role]++;
    if (seen.has(row.imageName)) problems.push(`${tag}: duplicate imageName ${row.imageName}`);
    seen.add(row.imageName);
  });
  for (const [role, n] of Object.entries(expected)) {
    if (counts[role] !== n) problems.push(`expected ${n} ${role} images, file has ${counts[role]}`);
  }
  return { problems, counts, total: rows.length };
}

/**
 * Compares the rows with the images in the database. `dbImages` is a list of
 * { imageName, poolStatus, isReference }. Every image must be in both, and every
 * image must still be "unserved" (roles are applied once, to a fresh import).
 * Returns the image names grouped by role.
 */
export function planRoleUpdates(rows, dbImages) {
  const problems = [];
  const inDb = new Map(dbImages.map((d) => [d.imageName, d]));
  const inFile = new Set(rows.map((r) => r.imageName));
  if (inDb.size !== dbImages.length) problems.push("the database holds duplicate imageNames");
  for (const r of rows) if (!inDb.has(r.imageName)) problems.push(`not in the database: ${r.imageName}`);
  for (const d of dbImages) if (!inFile.has(d.imageName)) problems.push(`in the database but not in the roles file: ${d.imageName}`);
  const notUnserved = dbImages.filter((d) => d.poolStatus !== "unserved");
  if (notUnserved.length > 0) {
    problems.push(`${notUnserved.length} image(s) are not "unserved" (for example ${notUnserved[0].imageName}: ${notUnserved[0].poolStatus})`);
  }
  const byRole = Object.fromEntries(ROLES.map((r) => [r, []]));
  for (const r of rows) if (byRole[r.role]) byRole[r.role].push(r.imageName);
  return { problems, byRole };
}

/**
 * After writing: every image's poolStatus and isReference must equal its role's
 * fields. `dbImages` as above. Returns the list of mismatches.
 */
export function verifyAppliedRoles(rows, dbImages) {
  const inDb = new Map(dbImages.map((d) => [d.imageName, d]));
  const mismatches = [];
  for (const r of rows) {
    const d = inDb.get(r.imageName);
    const want = ROLE_FIELDS[r.role];
    if (!d || !want || d.poolStatus !== want.poolStatus || d.isReference !== want.isReference) {
      mismatches.push(r.imageName);
    }
  }
  return mismatches;
}
