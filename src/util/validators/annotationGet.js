export const ALLOWED_SESSION_SIZES = [5, 10, 20, 40];
export const ANNOTATOR_SESSION_SIZES = [10, 25, 50];

/**
 * Reference images are placed at one in eight of the images a contributor is
 * served (Chapter 4, Research Design), held uniform across their whole
 * participation.
 */
export const REFERENCE_RATE = 8;

export function ensureModelVersion(imgRecords) {
  for (const img of imgRecords) {
    if (!img.modelVersion) img.modelVersion = "v0-mapillary";
  }
}

function toCount(n) {
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * How many reference images a new contributor session of `totalCount` images
 * should carry, given `priorServed`, the number of images the contributor was
 * served in all earlier sessions.
 *
 * The count is the change in round(served / 8) across the session, so a
 * contributor's running total of reference images always stays within half an
 * image of one in eight, whatever session sizes they choose. Rounding each
 * session on its own (the earlier rule, with a floor of one) gave a 5-image
 * session one reference image in five and a 10-image session one in ten.
 * A session may therefore carry none (for example a 5-image session following
 * one that ended on a rounding boundary).
 */
export function calculateReferenceCount(totalCount, priorServed = 0) {
  const size = toCount(totalCount);
  const prior = toCount(priorServed);
  const cumulative = (n) => Math.floor((n + REFERENCE_RATE / 2) / REFERENCE_RATE);
  return cumulative(prior + size) - cumulative(prior);
}

/**
 * Pool membership rules (Step 5, decided 30 Sep 2026). Model-development images
 * (training, validation, test) go only to annotators, deployment images only to
 * contributors, reference images to both, and reserve images to nobody until a
 * block is promoted to "served".
 */
export const REFERENCE_MATCH = { isReference: true, poolStatus: "served" };
export const ANNOTATOR_MODEL_DEV_MATCH = { isReference: { $ne: true }, poolStatus: "model_dev" };
export const CONTRIBUTOR_DEPLOYMENT_MATCH = { isReference: false, poolStatus: "served" };

/**
 * The same rules as a predicate on one image record. annotationGet applies it to
 * every image of a new session after drawing, so no query mistake can put a
 * model-development image in front of a contributor.
 */
export function canServeImage(img, isAnnotator) {
  if (!img || typeof img !== "object") return false;
  if (img.isReference === true) return img.poolStatus === "served";
  if (isAnnotator) return img.poolStatus === "model_dev";
  return img.poolStatus === "served" && img.isReference === false;
}

/**
 * A copy of an Image document safe to send to the browser (6 Oct 2026, both
 * roles). referenceGroundTruth holds every annotator's answers on a reference
 * image, with their user ids: an annotator must not see the others' work, and
 * a contributor must not see the answer key they are scored against. The admin
 * quality routes read it from the database, so nothing in the browser needs it.
 */
export function toClientImage(image) {
  if (!image || typeof image !== "object") return image;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  const { referenceGroundTruth, ...rest } = image;
  return rest;
}

/**
 * Local testing only (6 Oct 2026). With ANNOTATOR_MODEL_DEV_FIRST=true in .env,
 * annotator sessions draw model-development images and skip the reference
 * images, so all three annotator steps (Objects, Sidewalk, Obstructions) can be
 * tried without first working through the 150 reference images. Ignored in a
 * production build, so the study order (reference images first) can never
 * change on the live site, even if the setting were copied there.
 */
export function annotatorModelDevFirst(env = process.env) {
  return env.NODE_ENV !== "production" && env.ANNOTATOR_MODEL_DEV_FIRST === "true";
}

function shuffled(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The model-development images an annotator may be served, each marked with
 * what the draw needs (S14, 28 Oct 2026):
 *
 *   doneCount      completed annotator annotations on the image, from the
 *                  `annotations` collection, not annotationCount, which is only
 *                  incremented when a session completes
 *   openElsewhere  in another user's active session
 *   completedByMe  completed by this annotator, so never picked
 *
 * `images` are model-development Image documents (at least _id and imageID),
 * `doneCounts` maps imageID to that count, `openImageIds` holds the Image _ids
 * of other users' active sessions (as strings or ObjectIds) and
 * `completedImageIDs` the imageIDs this annotator has completed.
 */
export function toModelDevCandidates({ images = [], doneCounts = new Map(), openImageIds = [], completedImageIDs = [] } = {}) {
  const open = new Set(openImageIds.map(String));
  const mine = new Set(completedImageIDs);
  return images
    .filter(Boolean)
    .map((img) => ({
      ...img,
      doneCount: doneCounts.get(img.imageID) ?? 0,
      openElsewhere: open.has(String(img._id)),
      completedByMe: mine.has(img.imageID),
    }));
}

/**
 * Which model-development images go into an annotator's session (S14, 28 Oct
 * 2026). Each annotator was asked for 200 images, which covers all 1,002 only
 * if nobody gets an image someone else already did, so the session is filled
 * in this order:
 *
 *   (a) images nobody has done and nobody else has open, in random order
 *   (b) images nobody has done but someone else has open, so a session is
 *       never short while untouched images exist
 *   (c) the least-done images, fewest completed annotator annotations first,
 *       random among ties
 *
 * No city shares: the 1,002 images are fixed, so which annotator does which
 * city does not change the training set (the earlier city-proportional draw
 * kept handing out images from finished cities). Candidates the annotator has
 * completed (`completedByMe`) are never picked. Returns at most `requested`
 * images, fewer when fewer remain. `random` is there for tests.
 */
export function pickAnnotatorModelDev({ candidates = [], requested = 0, random = Math.random } = {}) {
  const want = toCount(requested);
  const pool = candidates.filter((c) => c && !c.completedByMe);

  const untouchedFree = pool.filter((c) => !c.doneCount && !c.openElsewhere);
  const untouchedOpen = pool.filter((c) => !c.doneCount && c.openElsewhere);
  // Shuffled first, then a stable sort, so ties stay in random order
  const done = shuffled(pool.filter((c) => c.doneCount > 0), random)
    .sort((a, b) => a.doneCount - b.doneCount);

  return [
    ...shuffled(untouchedFree, random),
    ...shuffled(untouchedOpen, random),
    ...done,
  ].slice(0, want);
}
