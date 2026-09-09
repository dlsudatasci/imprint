import { connectToDatabase } from "@/util/mongodb";

/**
 * GET /api/health — liveness and readiness for the VM.
 *
 * systemd and nginx can tell whether the process is listening, but not whether
 * it can reach Mongo — and an app that boots fine and then 500s every request
 * because the database is unreachable looks healthy from the outside. This
 * pings the database so a deploy check catches that case.
 *
 * Returns 200 only when the database answers; 503 otherwise, so it can be used
 * directly as a readiness probe. Deliberately leaks nothing: no version, no
 * connection string, no error detail.
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  // Never let a proxy or browser serve a stale health result.
  res.setHeader("Cache-Control", "no-store");

  try {
    const { db } = await connectToDatabase();
    await db.command({ ping: 1 });
    return res.status(200).json({ status: "ok", database: "connected" });
  } catch {
    return res.status(503).json({ status: "degraded", database: "unreachable" });
  }
}
