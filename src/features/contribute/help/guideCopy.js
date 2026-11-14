import { SESSION_SIZES_TEXT } from "./taskFacts";
import { SIDEWALK_QUESTION_COPY } from "@/features/annotate/sidewalkQuestionCopy";
import { PROPOSAL_HINT_COPY } from "@/util/modelProposal";

/**
 * Every string the annotation guide shows (16 Oct 2026), so tests can check
 * them: no em dashes and no semicolons in user-facing copy.
 *
 * Rewritten from the tool as it is. The old guide described a tool that no
 * longer exists: white boxes, a "Selected Obstructions" list, "Others" in the
 * category list, a 1 to 10 accessibility slider and a surface-type step (the
 * three-step form, replaced by two steps, pipeline_methodology.md §7a and
 * §7n). Each step's wording here is the tool's own: Let's Annotate! and Start
 * Session (dashboard and session picker), "Does ... obstruct the sidewalk?",
 * Yes, No, Not an object, Delete box, Add box and Other... (the box panel),
 * the Step 3 questions (SceneQuestions), Next Image and Previous, Pause and
 * Stop (their dialogs). The pictures are the landing page's preview at the
 * same five moments, drawn from the tool's components, so they change when
 * the tool does. The first step's picture is the session picker, drawn from
 * its own words and size cards (SessionPickerStill).
 *
 * On phones and tablets (23 Oct 2026, IMPRINT_guide_touch_stills.md) the
 * pictures are the phone layout's, so the text names where things are on
 * both: the lists in the answers sheet, and the Step 3 line that brings
 * Step 3 up (the Step 2 line until S15).
 *
 * From 2 Nov 2026 (S12) the box panel asks first whether the object is on the
 * sidewalk or the path people walk on, in sidewalkQuestionCopy.js's words.
 * From 3 Nov 2026 (S16) the guide says a box is only the model's guess, lists
 * what counts as the path (pathPoints, under the question: only the sidewalk
 * nearest you counts), and says Step 2 rates that same sidewalk. The S16
 * follow-up (3 Nov 2026) names the two questions as the box panel does,
 * Question 1 and Question 2, in "Answer each suggestion" and "Mark boxes with
 * nothing in them", and no paragraph says to choose No without naming which
 * question it answers.
 *
 * Rans's wording (5 Nov 2026, after S18): the start step in one paragraph
 * without Pause, Stop or the tutorial, a box only a suggested object,
 * Question 2 asked if it is on the sidewalk, Not an object (and where the box
 * goes) in the same paragraph as the two Noes, no paragraph on the lists,
 * drawing the objects we missed (obstructing or not), and no "model" in
 * the text.
 *
 * S15 (9 Nov 2026): a new step first, "Say whether there is a sidewalk"
 * (Step 1, SidewalkPresence), with no picture. The objects are Step 2 and
 * the sidewalk questions Step 3, six of them, or two with only a path, whose
 * boxes have no Question 1.
 *
 * S30 (14 Nov 2026): the tutorial is one practice photo, so the lead says
 * "a practice photo" (it said "practice photos").
 *
 * Nothing here names the study's hypotheses or the reference images.
 */
export const GUIDE_COPY = Object.freeze({
  title: "Annotation guide",
  lead: "How a session goes, one step at a time. Before your first session, the tutorial takes you through the same steps on a practice photo.",
  contentsLabel: "On this page",
  steps: Object.freeze([
    Object.freeze({
      id: "start",
      title: "Start a session",
      // No preview still shows this step, so the guide draws the picker itself (SessionPickerStill)
      picker: true,
      paragraphs: Object.freeze([
        `From your dashboard, choose Let's Annotate!, pick how many photos to do (${SESSION_SIZES_TEXT}), and choose Start Session.`,
      ]),
    }),
    Object.freeze({
      id: "presence",
      title: "Say whether there is a sidewalk",
      paragraphs: Object.freeze([
        "First, check whether the photo has a sidewalk raised above the road on a curb, or only a path for people to walk on. Answer this before the objects. With only a path, each object asks only whether it obstructs the path, and Step 3 asks two questions instead of six. If you change this answer later, some objects ask again.",
      ]),
    }),
    Object.freeze({
      id: "answer",
      title: "Answer each suggestion",
      still: 0,
      paragraphs: Object.freeze([
        "Dashed yellow boxes are suggested objects. A box is only a suggested object, it doesn't necessarily mean it's on the sidewalk or an obstruction. Click one, or tap it on a phone, to open its panel.",
        `Check the category, then answer Question 1, “${SIDEWALK_QUESTION_COPY.question}”, with Yes or No.`,
        "With only a path, there is no Question 1. Each object asks only whether it obstructs the path.",
        "If it is on the sidewalk, then Question 2 asks “Does it obstruct the sidewalk?” Answer it for yourself if you believe the object obstructs your path or not. If it does obstruct, rate the severity of its obstruction from 1, a minor inconvenience, to 5, impassable.",
        // The classifier's proposal on Question 2 (S3), said whether or not
        // proposals are loaded yet, so the guide does not change on the day they are
        PROPOSAL_HINT_COPY.tutorial,
      ]),
      // What counts as the path, listed under the question (paragraph 2)
      pathPoints: SIDEWALK_QUESTION_COPY.pathPoints,
      pathPointsAfter: 2,
    }),
    Object.freeze({
      id: "not-an-object",
      title: "Mark boxes with nothing in them",
      still: 1,
      paragraphs: Object.freeze([
        "If an object is not on the sidewalk, choose No to Question 1. If it is on the sidewalk but not an obstruction, choose No to Question 2. If a box does not seem to be a real object, choose Not an object. The box then leaves the photo and is listed under Not an object, where you can open it and choose Restore.",
      ]),
    }),
    Object.freeze({
      id: "draw",
      title: "Draw the objects we missed",
      still: 2,
      paragraphs: Object.freeze([
        "Box every object on the sidewalk or the path people walk on that we missed, whether or not it is an obstruction. Leave out objects that are not on the sidewalk.",
        "With a mouse, drag a box around the object. On a phone or tablet, tap Add box and drag its corners to fit.",
        "Pick its category, or choose Other... to type one, and answer the same questions. To remove a box you drew, choose Delete box.",
      ]),
    }),
    Object.freeze({
      id: "rate",
      title: "Rate the sidewalk",
      still: 3,
      paragraphs: Object.freeze([
        "Step 3 asks six questions about the sidewalk nearest you as a whole, the same one as in Step 2, or two if there is only a path. On a phone or tablet, tap the Step 3 line in the answers sheet to bring them up.",
      ]),
      listsQuestions: true,
    }),
    Object.freeze({
      id: "next",
      title: "Go to the next photo",
      still: 4,
      paragraphs: Object.freeze([
        "Click Next Image once every object has an answer. Previous takes you back to a photo you already did, to change it.",
      ]),
    }),
  ]),
  reference: Object.freeze({
    id: "reference",
    title: "Quick reference",
    severityTitle: "Severity",
    categoriesTitle: "The 18 categories",
    categoriesNote: "Anything else can be named with Other...",
  }),
  stillCaption: "From the landing page's preview of the task.",
  pickerCaption: "The session picker, with 10 photos chosen.",
});
