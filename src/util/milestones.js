export const KILOMETERS_PER_ANNOTATION = 0.002;

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
