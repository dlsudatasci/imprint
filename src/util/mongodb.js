import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri) {
  throw new Error(
    "Please define the MONGODB_URI environment variable inside .env.local"
  );
}

if (!dbName) {
  throw new Error(
    "Please define the MONGODB_DB environment variable inside .env.local"
  );
}

// Cached so every call in one server process shares a single MongoClient and
// its connection pool, rather than dialling per request.
//
// This holds the in-flight promise, not the resolved client. Caching the client
// only takes effect once it has arrived, which leaves a gap on a cold start
// where concurrent requests all see an empty cache and open their own
// connection. Holding the promise makes later callers wait on the first
// caller's connection instead.
let cachedPromise = global.mongoConnection || null;

/**
 * Returns the shared client and database handle, connecting on first use.
 *
 * Every API route and every getServerSideProps in Imprint goes through here.
 * The connection opens lazily rather than at import time, so a database that is
 * briefly unreachable doesn't stop the server from booting.
 *
 * A failed connection is not cached — the next call retries from scratch.
 */
export async function connectToDatabase() {
  if (!cachedPromise) {
    const client = new MongoClient(uri);

    cachedPromise = client
      .connect()
      .then(() => ({ client, db: client.db(dbName) }))
      .catch((err) => {
        // A refused DNS lookup or an unreachable cluster must not poison the
        // cache — drop it so the next request gets a fresh attempt rather than
        // replaying this rejection for the life of the process.
        cachedPromise = null;
        if (process.env.NODE_ENV === "development") global.mongoConnection = null;
        throw err;
      });

    // Hot reload throws away module state on every edit, so in development the
    // connection is also parked on `global`, which survives. Without this a long
    // dev session leaks a connection per file save until Mongo starts refusing
    // them. Production keeps the module cache and doesn't need the escape hatch.
    if (process.env.NODE_ENV === "development") {
      global.mongoConnection = cachedPromise;
    }
  }

  return cachedPromise;
}