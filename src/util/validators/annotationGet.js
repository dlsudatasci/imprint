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
