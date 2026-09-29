import { vi } from "vitest";

export function createMockReq(overrides = {}) {
  return {
    method: "POST",
    body: {},
    query: {},
    headers: {},
    ...overrides,
  };
}

export function createMockRes() {
  const res = {
    _status: null,
    _json: null,
    _headers: {},
    status(code) {
      res._status = code;
      return res;
    },
    json(data) {
      res._json = data;
      return res;
    },
    setHeader(key, val) {
      res._headers[key] = val;
      return res;
    },
  };
  return res;
}

export function createMockCollection(overrides = {}) {
  const collection = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    countDocuments: vi.fn().mockResolvedValue(0),
    insertOne: vi.fn().mockResolvedValue({ insertedId: "mock-id" }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
    bulkWrite: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  return collection;
}

export function createMockDb(collectionMap = {}) {
  return {
    collection: vi.fn((name) => {
      if (collectionMap[name]) return collectionMap[name];
      return createMockCollection();
    }),
    command: vi.fn().mockResolvedValue({ ok: 1 }),
  };
}

export const MOCK_USER_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

export function mockAuthSession(user = {}) {
  return {
    user: {
      _id: MOCK_USER_ID,
      username: "testuser",
      email: "test@example.com",
      ...user,
    },
  };
}
