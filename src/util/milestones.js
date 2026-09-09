/**
 * Turns a raw annotation count into a distance a contributor can picture.
 *
 * "You've annotated 340 images" means little to a volunteer; "you've mapped
 * the length of Roxas Boulevard" means something. The landmarks are all
 * Philippine ones, because that is where Imprint's contributors are.
 *
 * Distances are motivational, not survey-grade — see the estimate below.
 */

// Rough sidewalk frontage covered by one street-level image, in km (~2m).
// Images overlap and real frontage varies, so this is an estimate.
export const KILOMETERS_PER_ANNOTATION = 0.002;

// Must stay sorted ascending by km: getCrossedMilestone and the dashboard's
// "next goal" lookup both walk the list in order and rely on that.
export const MILESTONES = [
    { name: "the length of the San Juanico Bridge", km: 2.16 },
    { name: "the length of Roxas Boulevard", km: 7.6 },
    { name: "the entire length of EDSA", km: 23.8 },
    { name: "the length of C-5 Road", km: 32.5 },
    { name: "the distance from Manila to Tagaytay", km: 65.0 },
    { name: "the length of SCTEX", km: 93.7 },
    { name: "the distance from Manila to Baguio", km: 246.0 },
    { name: "the entire length of Palawan Island", km: 450.0 },
    { name: "the length of the Maharlika Highway", km: 3379.73 }
];

/**
 * Returns the milestone this session crossed, or null if it crossed none.
 *
 * Takes the before and after counts rather than a running total so the
 * celebration fires exactly once, on the session that crossed the line.
 * /api/annotationComplete returns both numbers for this purpose.
 *
 * A long session can clear several milestones at once, since the early ones sit
 * close together. The loop deliberately has no break, so the last match wins
 * and the largest milestone is the one celebrated.
 */
export function getCrossedMilestone(previousAnnotationCount, currentAnnotationCount) {
    const previousKm = previousAnnotationCount * KILOMETERS_PER_ANNOTATION;
    const currentKm = currentAnnotationCount * KILOMETERS_PER_ANNOTATION;

    let crossedMilestone = null;

    for (const milestone of MILESTONES) {
        if (previousKm < milestone.km && currentKm >= milestone.km) {
            crossedMilestone = milestone;
        }
    }

    return crossedMilestone;
}
