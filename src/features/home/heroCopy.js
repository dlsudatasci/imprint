/**
 * Every string the landing page's hero shows, so tests can check them (16 Oct
 * 2026): no em dashes and no semicolons in user-facing copy.
 *
 * Kept close to the page as it was (Rans, 16 Oct 2026): Imprint is presented
 * as a platform, not as one study, so the hero does not describe the research.
 * The welcome, the map and the figures stay (15 Oct 2026). The one change to
 * the old line is "safety" to "obstructions": safety is not something Imprint
 * asks about (dropped from the scene questions, pipeline_methodology.md §7n),
 * and obstructions are what it collects. The hint under the map ("Select a
 * city to see its figures below.") was taken out on 17 Oct 2026 (Rans).
 */
export const HERO_COPY = Object.freeze({
  // "Imprint" is drawn in the brand blue, as before
  titleLead: "Welcome to",
  titleName: "Imprint",
  lead:
    "We aim to accelerate crowdsourced streetscape data collection to understand how people perceive accessibility, obstructions, and walkability in urban environments.",
  ctaSignedOut: "Start volunteering",
  ctaSignedIn: "Go to your dashboard",
  secondary: "Learn more",
});
