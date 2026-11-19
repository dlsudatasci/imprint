/**
 * The checks and the plan behind scripts/update-predictions.mjs, which writes
 * the obstruction classifier's proposed judgments after each retraining cycle
 * (16 Oct 2026).
 *
 * The manuscript keeps the detector's output fixed for the whole study and
 * refreshes only the classifier's: "The object detection and sidewalk
 * segmentation models are trained once and remain fixed for the entire study,
 * so the candidate boxes and masks a contributor sees never change" and "the
 * underlying candidate boxes and masks remain unchanged throughout, so the
 * proposed obstruction judgment is the only part of a suggestion that differs
 * from one cycle to the next" (chapter_4.tex, Human-in-the-Loop Workflow). After
 * each cycle "the same batch process reruns only the obstruction classifier
 * over every image in the deployment pool, updating their stored obstruction
 * judgments to the current model version and recording that version alongside
 * each judgment" (chapter_5.tex). The script used to replace every image's
 * suggestions with new boxes and new ids instead.
 *
 * So an update only adds, to suggestions the image already has, the
 * classifier's proposal for each: `proposedObstructs` (true or false) and
 * `obstructionProbability` (0 to 1), and sets the image's `modelVersion`, the
 * served model version that every annotation records. A box's id, category,
 * position, confidence and every other field stay as they are. Nothing is
 * written unless every check passes: every image in the file exists, every
 * suggestion of each image gets exactly one proposal, and, unless partial
 * runs are allowed, every image served to contributors is in the file (the
 * whole pool is recomputed, chapter_4.tex).
 *
 * `.mjs` with no `@/` imports, because the script imports it directly with
 * Node (only the mongodb driver, which the script needs anyway). Tests
 * import it normally.
 *
 * The file the retraining pipeline writes:
 *
 *   {
 *     "modelVersion": "v1-xgboost",
 *     "decisionThreshold": 0.42,
 *     "predictions": [
 *       {
 *         "imageID": 1459,
 *         "proposals": [
 *           { "boxId": "mly-0", "obstructs": false, "probability": 0.12 },
 *           { "boxId": "mly-3", "obstructs": true, "probability": 0.81 }
 *         ]
 *       }
 *     ]
 *   }
 *
 * `decisionThreshold` is the cut-off chosen on the validation split
 * (chapter_4.tex, Obstruction Classifier). Each proposal's `obstructs` must be
 * its probability at or above it, so a file whose two disagree is refused.
 */

import { ObjectId } from "mongodb";

export const MODEL_VERSION_PATTERN = /^v\d+-\w[\w-]*$/;

/** Where the proposal goes on each suggestion */
export const PROPOSAL_FIELDS = Object.freeze({ obstructs: "proposedObstructs", probability: "obstructionProbability" });

/** Images served to contributors (Step 5): deployment and reference images alike */
export const SERVED_POOL_STATUS = "served";

const isProbability = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** Problems with the file itself, as readable strings. Empty when it is valid. */
export function validatePredictionFile(data) {
  const problems = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["the file must hold one JSON object"];

  const { modelVersion, decisionThreshold, predictions } = data;
  if (typeof modelVersion !== "string" || !MODEL_VERSION_PATTERN.test(modelVersion)) {
    problems.push(`modelVersion ${JSON.stringify(modelVersion)} must look like v<number>-<name>, for example v1-xgboost`);
  }
  const thresholdOk = isProbability(decisionThreshold);
  if (!thresholdOk) problems.push("decisionThreshold must be a number from 0 to 1");
  if ("boxes" in data || (Array.isArray(predictions) && predictions.some((e) => e && typeof e === "object" && "boxes" in e))) {
    problems.push("boxes are not accepted: the detector's boxes never change, only the proposals do (use proposals)");
  }
  if (!Array.isArray(predictions) || predictions.length === 0) {
    problems.push("predictions must be a non-empty array");
    return problems;
  }

  const seen = new Set();
  predictions.forEach((entry, i) => {
    const tag = `predictions[${i}]`;
    if (!entry || typeof entry !== "object") {
      problems.push(`${tag} is not an object`);
      return;
    }
    const { imageID, proposals } = entry;
    if (!Number.isSafeInteger(imageID) || imageID < 1) {
      problems.push(`${tag}: imageID must be a positive whole number`);
    } else if (seen.has(imageID)) {
      problems.push(`${tag}: imageID ${imageID} appears twice`);
    } else {
      seen.add(imageID);
    }
    if (!Array.isArray(proposals)) {
      problems.push(`${tag} (imageID ${imageID}): proposals must be an array`);
      return;
    }
    const boxIds = new Set();
    proposals.forEach((p, j) => {
      const ptag = `${tag} (imageID ${imageID}) proposals[${j}]`;
      if (!p || typeof p !== "object") {
        problems.push(`${ptag} is not an object`);
        return;
      }
      if (typeof p.boxId !== "string" || !p.boxId) problems.push(`${ptag}: boxId must be a non-empty string`);
      else if (boxIds.has(p.boxId)) problems.push(`${ptag}: box ${p.boxId} has two proposals`);
      else boxIds.add(p.boxId);
      if (typeof p.obstructs !== "boolean") problems.push(`${ptag}: obstructs must be true or false`);
      if (!isProbability(p.probability)) problems.push(`${ptag}: probability must be a number from 0 to 1`);
      else if (thresholdOk && typeof p.obstructs === "boolean" && p.obstructs !== p.probability >= decisionThreshold) {
        problems.push(`${ptag}: obstructs is ${p.obstructs} but probability ${p.probability} is ${p.probability >= decisionThreshold ? "at or above" : "below"} the threshold ${decisionThreshold}`);
      }
    });
  });
  return problems;
}

/**
 * What an update would write, checked against the images as they are.
 *
 * `images` holds every image named in the file and every served image, each
 * with imageID, modelVersion, poolStatus and annotationList. Returns
 * `problems` (nothing may be written while there are any), `updates` (one per
 * image to change: its imageID, the modelVersion it had, the ids of its
 * suggestions, and its new annotationList) and `counts`.
 *
 * An image already at this modelVersion is skipped unless `force` is set, so a
 * run that stopped part way can be run again. Served images missing from the
 * file are a problem unless `allowPartial` is set.
 */
export function planPredictionUpdate(data, images, { force = false, allowPartial = false } = {}) {
  const problems = [];
  const byId = new Map((images || []).map((img) => [img.imageID, img]));
  const inFile = new Set();
  const updates = [];
  const counts = {
    imagesInFile: data.predictions.length,
    imagesUpdated: 0,
    imagesSkippedSameVersion: 0,
    proposalsWritten: 0,
    imagesNotServed: 0,
    servedImagesNotInFile: 0,
  };

  for (const entry of data.predictions) {
    inFile.add(entry.imageID);
    const img = byId.get(entry.imageID);
    if (!img) {
      problems.push(`imageID ${entry.imageID} is not in the Image collection`);
      continue;
    }
    if (img.poolStatus !== SERVED_POOL_STATUS) counts.imagesNotServed += 1;

    const list = Array.isArray(img.annotationList) ? img.annotationList : [];
    // Every box on an image record is a suggestion: drawn boxes live in the annotations
    const suggestionIds = list.filter((box) => box && box.editable !== true).map((box) => String(box.id));
    const proposals = new Map(entry.proposals.map((p) => [p.boxId, p]));
    for (const boxId of proposals.keys()) {
      if (!suggestionIds.includes(boxId)) problems.push(`imageID ${entry.imageID}: box ${boxId} is not one of its suggestions`);
    }
    for (const id of suggestionIds) {
      if (!proposals.has(id)) problems.push(`imageID ${entry.imageID}: suggestion ${id} has no proposal`);
    }

    if (!force && img.modelVersion === data.modelVersion) {
      counts.imagesSkippedSameVersion += 1;
      continue;
    }

    const annotationList = list.map((box) => {
      const p = box && box.editable !== true ? proposals.get(String(box.id)) : undefined;
      if (!p) return box;
      return { ...box, [PROPOSAL_FIELDS.obstructs]: p.obstructs, [PROPOSAL_FIELDS.probability]: p.probability };
    });
    updates.push({ imageID: img.imageID, fromVersion: img.modelVersion ?? null, suggestionIds, annotationList });
    counts.imagesUpdated += 1;
    counts.proposalsWritten += proposals.size;
  }

  const notInFile = (images || [])
    .filter((img) => img.poolStatus === SERVED_POOL_STATUS && !inFile.has(img.imageID))
    .map((img) => img.imageID)
    .sort((a, b) => a - b);
  counts.servedImagesNotInFile = notInFile.length;
  if (notInFile.length > 0 && !allowPartial) {
    const shown = notInFile.slice(0, 10).join(", ");
    problems.push(`${notInFile.length} image(s) served to contributors are not in the file (${shown}${notInFile.length > 10 ? ", ..." : ""}). Every served image is recomputed each cycle. Use --allow-partial only to finish a run that was split on purpose`);
  }

  return { problems, updates, counts };
}

/**
 * The bulkWrite operation for one planned update. It matches the image only
 * while it still has the modelVersion and the suggestions it was planned
 * from, so nothing changed since it was read is overwritten.
 */
export function updateOperation(update, modelVersion, now = new Date()) {
  const filter = {
    imageID: update.imageID,
    modelVersion: update.fromVersion,
    annotationList: { $size: update.annotationList.length },
  };
  if (update.suggestionIds.length > 0) filter["annotationList.id"] = { $all: update.suggestionIds };
  return {
    updateOne: {
      filter,
      update: { $set: { annotationList: update.annotationList, modelVersion, predictionUpdatedAt: now } },
    },
  };
}

/** A session a contributor or annotator still has open */
export const ACTIVE_SESSION_STATUS = "active";

/**
 * A session with no activity for this many hours does not hold back an
 * update (S34, 19 Nov 2026). 24 in the first draft of S34, lowered to 12 by
 * Rans on 19 Nov 2026 so retraining cycle 1 could go out that day. There is
 * no option to lower it.
 */
export const INACTIVE_SESSION_HOURS = 12;

const HOUR_MS = 60 * 60 * 1000;

const toTime = (d) => {
  const t = d instanceof Date ? d.getTime() : typeof d === "string" || typeof d === "number" ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * When a session was last in use (S34): the latest of its createdAt, any
 * telemetry event of its user at or after createdAt, and the date of any
 * pending annotation of its user. Any event counts, a leaderboard view
 * included, so it errs towards treating a session as in use. Returns a Date,
 * or null when none of the three is a date.
 */
export function sessionLastActivity({ createdAt, telemetryTimes = [], pendingDates = [] } = {}) {
  const created = toTime(createdAt);
  const times = [created];
  for (const t of telemetryTimes) {
    const time = toTime(t);
    // An event from before the session started is not activity in it
    if (time !== null && (created === null || time >= created)) times.push(time);
  }
  for (const d of pendingDates) times.push(toTime(d));
  const known = times.filter((t) => t !== null);
  return known.length > 0 ? new Date(Math.max(...known)) : null;
}

/**
 * True when a session last in use at lastActivity holds back an update at
 * now: less than INACTIVE_SESSION_HOURS before it. A session with no date at
 * all is treated as in use.
 */
export function isBlockingSession(lastActivity, now = new Date()) {
  const last = toTime(lastActivity);
  if (last === null) return true;
  return now.getTime() - last < INACTIVE_SESSION_HOURS * HOUR_MS;
}

/**
 * The counts, given each active session's _id and last activity:
 * { active, blocking, inactive, inactiveSessionIds }. The ids are the
 * sessions' own _ids, never user ids.
 */
export function blockingSessionCounts(sessions = [], now = new Date()) {
  const inactiveSessionIds = [];
  let blocking = 0;
  for (const s of sessions) {
    if (isBlockingSession(s.lastActivity, now)) blocking += 1;
    else inactiveSessionIds.push(s._id);
  }
  return { active: sessions.length, blocking, inactive: inactiveSessionIds.length, inactiveSessionIds };
}

/** A user id as stored either way: as text and, when it is one, as an ObjectId (as ownedFilter matches them) */
export function userIdValues(userId, ObjectIdClass = ObjectId) {
  const id = String(userId);
  return /^[0-9a-f]{24}$/i.test(id) ? [id, new ObjectIdClass(id)] : [id];
}

/**
 * Reads every active session and its user's latest activity, and counts the
 * sessions that hold back an update (S34). The sessions are only read, never
 * changed: their owners can resume them (Rans, 18 Nov 2026).
 */
export async function countBlockingSessions(db, { now = new Date() } = {}) {
  const sessions = await db
    .collection("sessions")
    .find({ status: ACTIVE_SESSION_STATUS }, { projection: { _id: 1, userId: 1, createdAt: 1 } })
    .toArray();

  const withActivity = await Promise.all(
    sessions.map(async (s) => {
      const ids = s.userId == null ? [] : userIdValues(s.userId);
      if (ids.length === 0) return { _id: s._id, lastActivity: sessionLastActivity({ createdAt: s.createdAt }) };
      const created = toTime(s.createdAt);
      const [event, pending] = await Promise.all([
        db.collection("telemetry_logs").findOne(
          { userId: { $in: ids }, ...(created === null ? {} : { timestamp: { $gte: new Date(created) } }) },
          { sort: { timestamp: -1 }, projection: { timestamp: 1 } }
        ),
        db.collection("annotations").findOne(
          { userId: { $in: ids }, status: "pending" },
          { sort: { date: -1 }, projection: { date: 1 } }
        ),
      ]);
      return {
        _id: s._id,
        lastActivity: sessionLastActivity({
          createdAt: s.createdAt,
          telemetryTimes: event ? [event.timestamp] : [],
          pendingDates: pending ? [pending.date] : [],
        }),
      };
    })
  );
  return blockingSessionCounts(withActivity, now);
}

const sessionsWord = (n) => (n === 1 ? "1 session has" : `${n} sessions have`);

/**
 * Whether an update may be written, given the session counts (S5, 29 Oct
 * 2026, and S34, 19 Nov 2026). annotationSubmit stores each contributor
 * answer with the image record's modelVersion, so a write while someone is
 * answering would label answers given on the old model's proposals with the
 * new one. With --apply any session with activity in the last
 * INACTIVE_SESSION_HOURS refuses the write, with no way round it. Sessions
 * inactive for longer are left open and ignored: the tool refuses an answer
 * given on suggestions that have since changed (MODEL_UPDATED) and loads the
 * photos again. A run without --apply only warns.
 *
 * Returns { refuse, line, message }: line is the counts, always printed, and
 * message the refusal or warning, or null. Counts only, never a name.
 */
export function activeSessionCheck({ active = 0, blocking = 0, inactive = 0 } = {}, { apply = false } = {}) {
  const h = INACTIVE_SESSION_HOURS;
  const line =
    active > 0
      ? `${active} active session(s): ${blocking} with activity in the last ${h} h, ${inactive} inactive for ${h} h or more (left open, ignored).`
      : "0 active session(s).";
  if (!(blocking > 0)) return { refuse: false, line, message: null };
  if (!apply) {
    return { refuse: false, line, message: `Warning: --apply will refuse to write while ${sessionsWord(blocking)} had activity in the last ${h} h.` };
  }
  return {
    refuse: true,
    line,
    message: `Refusing to write while ${sessionsWord(blocking)} had activity in the last ${h} h. No image was changed. Run again later.`,
  };
}

/** The session fields every logged update carries (S34), so the analysis can find answers given in the ignored sessions */
export function sessionLogFields(sessions) {
  return {
    activeSessions: sessions.active,
    inactiveSessionsIgnored: sessions.inactive,
    inactiveSessionIds: sessions.inactiveSessionIds,
    inactiveSessionHours: INACTIVE_SESSION_HOURS,
  };
}

/**
 * The write step of update-predictions.mjs, for a plan with no problems.
 * Counts the sessions first (countBlockingSessions). Without `apply`, or with
 * any session that had activity in the last INACTIVE_SESSION_HOURS, nothing
 * is written. Otherwise writes every planned update and, when any image
 * changed, logs MODEL_PREDICTIONS_UPDATED with the session counts. The
 * sessions are not changed in any way.
 *
 * Returns { activeSessions, blockingSessions, inactiveSessions,
 * inactiveSessionIds, sessionsLine, message, refused, written, modified,
 * unchanged, logged }, where unchanged is the number of planned images that
 * changed between the read and the write and were left alone.
 */
export async function runPredictionUpdate(db, { data, updates, counts }, { apply = false, partial = false, now = new Date() } = {}) {
  const sessions = await countBlockingSessions(db, { now });
  const { refuse, line, message } = activeSessionCheck(sessions, { apply });
  const result = {
    activeSessions: sessions.active,
    blockingSessions: sessions.blocking,
    inactiveSessions: sessions.inactive,
    inactiveSessionIds: sessions.inactiveSessionIds,
    sessionsLine: line,
    message,
    refused: refuse,
    written: false,
    modified: 0,
    unchanged: 0,
    logged: false,
  };
  if (!apply || refuse) return result;

  result.written = true;
  if (updates.length > 0) {
    const write = await db.collection("Image").bulkWrite(updates.map((u) => updateOperation(u, data.modelVersion, now)), { ordered: false });
    result.modified = write.modifiedCount;
    result.unchanged = Math.max(0, updates.length - write.matchedCount);
  }

  // A run that wrote nothing (every image already at this version) is not a cycle
  if (result.modified > 0) {
    await db.collection("telemetry_logs").insertOne({
      event: "MODEL_PREDICTIONS_UPDATED",
      modelVersion: data.modelVersion,
      decisionThreshold: data.decisionThreshold,
      predictionsInFile: counts.imagesInFile,
      imagesUpdated: result.modified,
      imagesSkippedSameVersion: counts.imagesSkippedSameVersion,
      proposalsWritten: counts.proposalsWritten,
      servedImagesNotInFile: counts.servedImagesNotInFile,
      partial,
      ...sessionLogFields(sessions),
      timestamp: now,
    });
    result.logged = true;
  }
  return result;
}
