import { vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockCollection } from "@/test-utils/api-helpers";

/**
 * The three collections countBlockingSessions reads (S34), held in memory:
 * the active sessions, the telemetry events and the pending answers. The
 * userId match is as strict as MongoDB's, so an id stored as an ObjectId is
 * found only by an ObjectId and one stored as text only by text. `logs` is
 * also where an update logs its entry (insertOne).
 */
const sameId = (a, b) => (a instanceof ObjectId || b instanceof ObjectId ? a instanceof ObjectId && b instanceof ObjectId && a.equals(b) : a === b);
const idMatches = (filter, doc) => (filter.userId?.$in || []).some((id) => sameId(id, doc.userId));

function latest(docs, field) {
  return [...docs].sort((a, b) => b[field].getTime() - a[field].getTime())[0] ?? null;
}

export function sessionActivityCollections({ sessions = [], telemetry = [], pending = [] } = {}) {
  const sessionsColl = createMockCollection({
    find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(sessions) }),
  });
  const logs = createMockCollection({
    findOne: vi.fn(async (filter) => {
      const since = filter.timestamp?.$gte;
      return latest(telemetry.filter((e) => idMatches(filter, e) && (!since || e.timestamp >= since)), "timestamp");
    }),
  });
  const annotations = createMockCollection({
    findOne: vi.fn(async (filter) => latest(pending.filter((a) => idMatches(filter, a) && a.status === filter.status), "date")),
  });
  return { sessions: sessionsColl, telemetry_logs: logs, annotations };
}
