import { SESSION_SIZES_TEXT } from "./taskFacts";

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
 * the four questions (SceneQuestions), Next Image and Previous, Pause and
 * Stop (their dialogs). The pictures are the landing page's preview at the
 * same five moments, drawn from the tool's components, so they change when
 * the tool does. The first step's picture is the session picker, drawn from
 * its own words and size cards (SessionPickerStill).
 *
 * Nothing here names the study's hypotheses or the reference images.
 */
export const GUIDE_COPY = Object.freeze({
  title: "Annotation guide",
  lead: "How a session goes, one step at a time. Before your first session, the tutorial takes you through the same steps on practice photos.",
  contentsLabel: "On this page",
  steps: Object.freeze([
    Object.freeze({
      id: "start",
      title: "Start a session",
      // No preview still shows this step, so the guide draws the picker itself (SessionPickerStill)
      picker: true,
      paragraphs: Object.freeze([
        `From your dashboard, choose Let's Annotate!, pick how many photos to do (${SESSION_SIZES_TEXT}), and choose Start Session.`,
        "The first time, the tutorial comes first. It uses practice photos, and nothing you do in it is saved.",
        "Pause keeps your work, so you can pick up where you left off from the dashboard. Stop ends the session and keeps the photos you already finished.",
      ]),
    }),
    Object.freeze({
      id: "answer",
      title: "Answer each suggestion",
      still: 0,
      paragraphs: Object.freeze([
        "Dashed boxes are the model's suggestions. Click one, or tap it on a phone, to open its panel.",
        "Check the category, then answer the question “Does it obstruct the sidewalk?” with Yes or No. Answer for yourself, as you normally travel. If you choose Yes, rate how much from 1, a minor inconvenience, to 5, impassable.",
      ]),
    }),
    Object.freeze({
      id: "not-an-object",
      title: "Mark boxes with nothing in them",
      still: 1,
      paragraphs: Object.freeze([
        "If a box has nothing real in it, choose Not an object at the foot of its panel.",
        "Every answer sorts the object into a list under the photo, Not obstructions or Obstructions. Click a name in a list to open its panel and change the answer.",
      ]),
    }),
    Object.freeze({
      id: "draw",
      title: "Draw what the model missed",
      still: 2,
      paragraphs: Object.freeze([
        "With a mouse, drag a box around the object. On a phone or tablet, tap Add box and drag its corners to fit.",
        "Pick its category, or choose Other... to type one, and answer the same question. To remove a box you drew, choose Delete box.",
      ]),
    }),
    Object.freeze({
      id: "rate",
      title: "Rate the sidewalk",
      still: 3,
      paragraphs: Object.freeze([
        "Step 2 asks four questions about the sidewalk as a whole. If there is no sidewalk, choose None for its width, and the other three are skipped.",
      ]),
      listsQuestions: true,
    }),
    Object.freeze({
      id: "next",
      title: "Go to the next photo",
      still: 4,
      paragraphs: Object.freeze([
        "Next Image is ready once every object has an answer and all four questions are answered. Previous takes you back to a photo you already did, to change it.",
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
