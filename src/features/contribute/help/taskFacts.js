import { CATEGORY_OPTIONS } from "@/util/categoryOptions";
import { TAXONOMY_BY_PERMANENCE } from "@/util/taxonomy";

/**
 * What the contributor task asks, as the About page and the annotation guide
 * describe it (16 Oct 2026). Kept apart from both so they say the same thing,
 * and checked against the tool itself by taskFacts.test.jsx: the severity
 * wording against DefaultInputSection's `severityLabel`, the six questions and
 * their answers against a rendered SceneQuestions, and the categories against
 * the taxonomy and the category list's labels. Change the tool and the test
 * says which line here is now wrong.
 */

/** Step 2's severity scale, 1 to 5, as the severity picker words it. */
export const SEVERITY_SCALE = Object.freeze([
  Object.freeze({ value: 1, label: "Minor inconvenience" }),
  Object.freeze({ value: 2, label: "Noticeable reduction" }),
  Object.freeze({ value: 3, label: "Significant narrowing" }),
  Object.freeze({ value: 4, label: "Difficult to pass" }),
  Object.freeze({ value: 5, label: "Impassable" }),
]);

/**
 * Step 3, the six questions about the sidewalk (S15, 9 Nov 2026), as
 * SceneQuestions shows them: each one's answers worst to best, so a numbered
 * answer's place in its list is its stored number less one
 * (validators/sceneScale.mjs). Surface Type has no order. `meanings` says
 * what each answer means, one line per answer, for the guide and the about
 * page (not shown under the questions). `sidewalkOnly` marks the four not
 * asked when Step 1 says there is only a path (SIDEWALK_ONLY_KEYS in
 * validators/sceneQuestions.mjs). The entry named "Ease of Navigation" is the
 * one the dashboard reads its answer words from.
 */
export const SCENE_QUESTIONS = Object.freeze([
  Object.freeze({
    key: "sidewalkWidth",
    name: "Sidewalk Width",
    prompt: "How wide is the sidewalk?",
    answers: Object.freeze(["Narrow", "Limited", "Wide"]),
    meanings: Object.freeze([
      "Narrow: room for one direction only.",
      "Limited: two people can pass with no room to spare.",
      "Wide: people pass both ways with room to spare.",
    ]),
    note: "The sidewalk as built, from the building line to the curb. Objects on it are not counted here.",
    sidewalkOnly: true,
  }),
  Object.freeze({
    key: "overallAccessibility",
    name: "Ease of Navigation",
    prompt: "How easy would it be for you to walk through here?",
    answers: Object.freeze(["Fully obstructed", "Heavily obstructed", "Moderately obstructed", "Slightly obstructed", "Unobstructed"]),
    meanings: Object.freeze([
      "Fully obstructed: there is no way through, as with an Impassable obstruction in Step 2.",
      "Heavily obstructed: getting through means leaving the sidewalk or path.",
      "Moderately obstructed: getting through means weaving between objects.",
      "Slightly obstructed: getting through means a short step aside.",
      "Unobstructed: the way is clear.",
    ]),
    note: "What the objects on the sidewalk or path leave for getting through.",
    sidewalkOnly: false,
  }),
  Object.freeze({
    key: "surfaceEvenness",
    name: "Evenness",
    prompt: "How even is the walking surface?",
    answers: Object.freeze(["Uneven", "Sloped", "Flat"]),
    meanings: Object.freeze([
      "Uneven: it rises and dips, as at driveways.",
      "Sloped: it tilts.",
      "Flat: it stays level.",
    ]),
    note: "The shape of the whole sidewalk or path along its length, not its paving.",
    sidewalkOnly: false,
  }),
  Object.freeze({
    key: "surfaceType",
    name: "Surface Type",
    prompt: "What is most of the walking surface made of?",
    answers: Object.freeze(["Concrete or asphalt", "Tiles", "Bricks or paver blocks", "Unpaved"]),
    meanings: Object.freeze([
      "Concrete or asphalt: a poured surface.",
      "Tiles: tiles laid on the surface, common on shop and house frontages.",
      "Bricks or paver blocks: bricks or blocks laid side by side.",
      "Unpaved: soil, gravel or grass.",
    ]),
    note: "What most of the walking surface is made of.",
    sidewalkOnly: true,
  }),
  Object.freeze({
    key: "surfaceCondition",
    name: "Surface Condition",
    prompt: "Is the walking surface cracked or broken anywhere?",
    answers: Object.freeze(["Broken", "Cracked", "Intact"]),
    meanings: Object.freeze([
      "Broken: something is missing or out of level, such as a hole, a chipped edge, a missing tile or paver, or a sunken or raised piece.",
      "Cracked: lines in the surface, with every piece still in place and level.",
      "Intact: neither cracked nor broken.",
    ]),
    note: "Whether the walking surface is cracked or broken anywhere.",
    sidewalkOnly: true,
  }),
  Object.freeze({
    key: "roadBarrier",
    name: "Road Barrier",
    prompt: "Is there anything between the sidewalk and the road?",
    answers: Object.freeze(["No barrier", "Barrier"]),
    meanings: Object.freeze([
      "No barrier: nothing stands between the walking space and the road. A curb alone is No barrier, since a raised curb is what makes it a sidewalk.",
      "Barrier: a railing, bollards, plants or anything else standing between the walking space and the road.",
    ]),
    note: "Anything standing between the sidewalk and the road.",
    sidewalkOnly: true,
  }),
]);

/** Said under a sidewalkOnly question in the guide and on the about page */
export const PATH_NOT_ASKED = "Not asked when there is only a path.";

const LABELS = new Map(CATEGORY_OPTIONS.map((o) => [o.value, o.label]));

/** The 18 categories as the category list names them, grouped as Table 4.1 groups them. */
export const CATEGORY_GROUPS = Object.freeze([
  Object.freeze({
    key: "temporary",
    title: "Temporary",
    text: "They come and go with daily street use.",
    labels: Object.freeze(TAXONOMY_BY_PERMANENCE.temporary.map((v) => LABELS.get(v))),
  }),
  Object.freeze({
    key: "permanent",
    title: "Permanent",
    text: "They are part of the street itself.",
    labels: Object.freeze(TAXONOMY_BY_PERMANENCE.permanent.map((v) => LABELS.get(v))),
  }),
]);

/** Session sizes a contributor can choose (ALLOWED_SESSION_SIZES in annotationGet.js). */
export const SESSION_SIZES_TEXT = "5, 10, 20 or 40";
