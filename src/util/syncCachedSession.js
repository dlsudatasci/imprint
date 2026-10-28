import { readSessionData, readCurrentCount, writeSession, writeTutorialFlag, clearSession } from "@/util/sessionCache";
import { cachedSessionCheck } from "@/util/validators/sessionSync";

/**
 * Brings the browser's saved copy of a session into step with the server's
 * (27 Oct 2026). The dashboard and the navbar trusted the saved copy, so a
 * session finished on a phone still read Resume Session on the laptop until
 * Resume was pressed. They now show the saved copy at once and then ask.
 *
 * Asks /api/annotationGet (an empty body only reports what is active) and
 * keeps, replaces or clears the saved copy (validators/sessionSync.js).
 * Resolves to { active: false }, or { active: true, current, total }, or null
 * when the server could not be asked, in which case nothing is changed.
 */
export async function syncCachedSession() {
  let server = null;
  try {
    const res = await fetch("/api/annotationGet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    server = res.ok ? await res.json() : null;
  } catch {
    server = null;
  }
  if (!server) return null;

  const decision = cachedSessionCheck(readSessionData(), server);
  if (decision === "clear") {
    clearSession();
    return { active: false };
  }
  if (decision === "replace") {
    const current = server.currentCount || 1;
    writeSession({ total: server.imgRecords.length, current, data: server });
    writeTutorialFlag(false);
    return { active: true, current, total: server.imgRecords.length };
  }
  return { active: true, current: readCurrentCount(), total: server.imgRecords.length };
}
