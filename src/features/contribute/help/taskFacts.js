import { CATEGORY_OPTIONS } from "@/util/categoryOptions";
import { TAXONOMY_BY_PERMANENCE } from "@/util/taxonomy";

/**
 * What the contributor task asks, as the About page and the annotation guide
 * describe it (16 Oct 2026). Kept apart from both so they say the same thing,
 * and checked against the tool itself by taskFacts.test.jsx: the severity
 * wording against DefaultInputSection's `severityLabel`, the four questions and
 * their answers against a rendered SceneQuestions, and the categories against
 * the taxonomy and the category list's labels. Change the tool and the test
 * says which line here is now wrong.
 */

/** Step 1's severity scale, 1 to 5, as the severity picker words it. */
export const SEVERITY_SCALE = Object.freeze([
  Object.freeze({ value: 1, label: "Minor inconvenience" }),
  Object.freeze({ value: 2, label: "Noticeable reduction" }),
  Object.freeze({ value: 3, label: "Significant narrowing" }),
  Object.freeze({ value: 4, label: "Difficult to pass" }),
  Object.freeze({ value: 5, label: "Impassable" }),
]);

/**
 * Step 2, the four questions about the sidewalk, as SceneQuestions shows them:
 * each one's answers worst to best (22 Oct 2026), so an answer's place in its
 * list is its stored number less one (validators/sceneScale.mjs).
 */
export const SCENE_QUESTIONS = Object.freeze([
  Object.freeze({
    name: "Sidewalk Width",
    prompt: "How much usable walking space does this sidewalk have?",
    answers: Object.freeze(["None", "Narrow", "Moderate", "Wide"]),
  }),
  Object.freeze({
    name: "Surface Condition",
    prompt: "How does the walking surface affect movement?",
    answers: Object.freeze(["Difficult or dangerous", "Some difficulty", "Easy to traverse"]),
  }),
  Object.freeze({
    name: "Walking Comfort",
    prompt: "How comfortable does this sidewalk look for walking?",
    answers: Object.freeze(["Uncomfortable", "Somewhat uncomfortable", "Comfortable"]),
  }),
  Object.freeze({
    name: "Accessible to Me",
    prompt: "Could you personally navigate this sidewalk?",
    answers: Object.freeze(["Not accessible", "Very difficult", "Somewhat difficult", "Mostly accessible", "Easily accessible"]),
  }),
]);

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
