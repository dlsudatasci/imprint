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

// Global variable to cache the client in development mode
let cachedClient = global.mongoClient;
let cachedDb = global.mongoDb;

if (!cachedClient) {
  cachedClient = null;
  cachedDb = null;
}

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }
  const client = new MongoClient(uri);

  await client.connect();
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  // Cache in global scope for Next.js development mode
  if (process.env.NODE_ENV === "development") {
    global.mongoClient = client;
    global.mongoDb = db;
  }

  return { client, db };
}