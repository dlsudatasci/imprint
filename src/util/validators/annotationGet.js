export const ALLOWED_SESSION_SIZES = [5, 10, 20, 40];
export const ANNOTATOR_SESSION_SIZES = [10, 25, 50];

export function ensureModelVersion(imgRecords) {
  for (const img of imgRecords) {
    if (!img.modelVersion) img.modelVersion = "v0-mapillary";
  }
}

export function calculateReferenceCount(totalCount) {
  return Math.max(1, Math.round(totalCount / 8));
}
