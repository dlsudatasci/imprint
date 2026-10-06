/**
 * "What Counts as Walking Space", shown beside the canvas in the annotator's
 * Sidewalk step. From chapter_4.tex line 64 (what is and is not walking space,
 * the full footprint, no sidewalk as an empty mask) and line 66 (keep the
 * outline on the sidewalk's edge). Points 3, 5 and 6 follow the 6 Oct 2026
 * decision to remove cut outs: a planting strip at the edge is traced around, a
 * tree and its box are drawn over like any object standing on the sidewalk,
 * and a planting bed in the middle gets one shape on each side.
 */
export const SIDEWALK_GUIDE = Object.freeze([
  "Outline the walking space: paved sidewalks and other clearly marked pedestrian paths, including curb ramps.",
  "A marked crosswalk counts. The road around it does not.",
  "Leave out the road, bicycle lanes, planting beds and private frontage. Trace the outline along a planting strip at the edge of the sidewalk.",
  "Outline the sidewalk's full footprint. Poles, carts and vehicles parked on the pavement stand on the sidewalk, so the outline runs under them.",
  "A tree and the small box or planter around it also stand on the sidewalk, so the outline runs over them.",
  "If a large planting bed sits in the middle of the walkway, draw one shape on each side of it.",
  "Keep the outline on the sidewalk's edge. Do not extend it past the edge.",
  "If there is no sidewalk or pedestrian path, tick No sidewalk.",
]);
