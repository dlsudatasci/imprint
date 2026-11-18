/**
 * A small in-memory stand-in for the MongoDB driver (S29), for code that is
 * handed a `db`, such as the campaign sender. It keeps documents in arrays
 * and supports what that code uses: equality (ObjectIds and dates compared by
 * value, null matching a missing field), `$in`, `$lt`, `$gte` (S33), `$exists`, `$ne` and
 * `$or` in filters, `$set`, `$unset`, `$inc` (S32) and `$push` with `$each`
 * and `$slice` in updates, `upsert` on findOneAndUpdate (S32), unique indexes made with createIndex (a duplicate insert
 * throws code 11000, as the driver does), find with a projection, findOne,
 * findOneAndUpdate (the updated document, or null), distinct and
 * countDocuments.
 */

const isObjectId = (v) => v && typeof v === "object" && typeof v.toHexString === "function";

function same(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (isObjectId(a) || isObjectId(b)) return String(a) === String(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return false;
}

/** A deep copy that keeps ObjectIds and dates as they are (structuredClone would turn an ObjectId into a plain object). */
function clone(value) {
  if (value == null || typeof value !== "object" || isObjectId(value)) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
}

const get = (doc, path) => path.split(".").reduce((v, k) => (v == null ? undefined : v[k]), doc);

function matchValue(actual, cond) {
  if (cond && typeof cond === "object" && !isObjectId(cond) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith("$"))) {
    return Object.entries(cond).every(([op, v]) => {
      if (op === "$in") return v.some((x) => same(actual, x));
      if (op === "$ne") return !same(actual, v);
      if (op === "$exists") return v ? actual !== undefined : actual === undefined;
      if (op === "$lt") return actual != null && actual < v;
      if (op === "$gte") return actual != null && actual >= v;
      throw new Error(`fakeMongo: ${op} is not supported`);
    });
  }
  return same(actual, cond);
}

export function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return cond.some((f) => matches(doc, f));
    return matchValue(get(doc, key), cond);
  });
}

function project(doc, projection) {
  if (!projection || Object.keys(projection).length === 0) return clone(doc);
  const out = {};
  for (const key of Object.keys(projection)) if (projection[key] && doc[key] !== undefined) out[key] = doc[key];
  if (projection._id !== 0 && doc._id !== undefined) out._id = doc._id;
  return clone(out);
}

function applyUpdate(doc, update) {
  for (const [op, fields] of Object.entries(update)) {
    for (const [key, value] of Object.entries(fields)) {
      if (op === "$set") doc[key] = value;
      else if (op === "$unset") delete doc[key];
      else if (op === "$inc") doc[key] = (doc[key] || 0) + value;
      else if (op === "$push") {
        const list = Array.isArray(doc[key]) ? doc[key] : [];
        const items = value && value.$each ? value.$each : [value];
        let next = [...list, ...items];
        if (value && typeof value.$slice === "number" && value.$slice < 0) next = next.slice(value.$slice);
        doc[key] = next;
      } else throw new Error(`fakeMongo: ${op} is not supported`);
    }
  }
}

export function createFakeCollection(docs = []) {
  const rows = docs.map((d) => ({ ...d }));
  const unique = [];

  const breaksUnique = (candidate, except = null) =>
    unique.some((keys) =>
      rows.some((r) => r !== except && keys.every((k) => same(get(r, k), get(candidate, k)))),
    );

  return {
    rows,
    async createIndex(keys, options = {}) {
      if (options.unique) {
        const k = Object.keys(keys);
        if (!unique.some((u) => u.join() === k.join())) unique.push(k);
      }
      return options.name || Object.keys(keys).join("_");
    },
    find(filter = {}, { projection } = {}) {
      const found = rows.filter((r) => matches(r, filter)).map((r) => project(r, projection));
      return { toArray: async () => found };
    },
    async findOne(filter = {}, { projection } = {}) {
      const r = rows.find((d) => matches(d, filter));
      return r ? project(r, projection) : null;
    },
    async insertOne(doc) {
      if (breaksUnique(doc)) {
        const err = new Error("E11000 duplicate key error");
        err.code = 11000;
        throw err;
      }
      const row = { _id: doc._id ?? `row-${rows.length + 1}`, ...doc };
      rows.push(row);
      return { acknowledged: true, insertedId: row._id };
    },
    async updateOne(filter, update) {
      const r = rows.find((d) => matches(d, filter));
      if (!r) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(r, update);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async findOneAndUpdate(filter, update, options = {}) {
      let r = rows.find((d) => matches(d, filter));
      if (!r && options.upsert) {
        // The filter's plain values start the new document, as the driver does
        r = Object.fromEntries(Object.entries(filter).filter(([k, v]) => !k.startsWith("$") && (v === null || typeof v !== "object" || isObjectId(v))));
        rows.push(r);
      }
      if (!r) return null;
      applyUpdate(r, update);
      return clone(r);
    },
    async distinct(field, filter = {}) {
      const out = [];
      for (const r of rows.filter((d) => matches(d, filter))) {
        const v = get(r, field);
        if (v !== undefined && !out.some((x) => same(x, v) && typeof x === typeof v)) out.push(v);
      }
      return out;
    },
    async countDocuments(filter = {}) {
      return rows.filter((d) => matches(d, filter)).length;
    },
  };
}

/** `{ db, collections }`: `db.collection(name)` gives the same collection each time, made empty when not seeded. */
export function createFakeDb(seed = {}) {
  const collections = {};
  for (const [name, docs] of Object.entries(seed)) collections[name] = createFakeCollection(docs);
  const db = {
    collection(name) {
      if (!collections[name]) collections[name] = createFakeCollection();
      return collections[name];
    },
  };
  return { db, collections };
}
