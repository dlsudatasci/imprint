/**
 * Every string the landing page's task preview shows (HowItWorks). Kept here
 * so tests can check them: no em dashes and no semicolons in user-facing copy.
 * One caption per chapter of demoScript.js, in the same order, and one per
 * chapter of touchScript.js for phones and tablets (touchChapters). Not an object
 * is offered for the model's boxes only (a box you drew is deleted instead,
 * annotationSubmit refuses it otherwise), so it is in chapter 2, not 3.
 */
export const HOW_IT_WORKS_COPY = Object.freeze({
  eyebrow: "How contributing works",
  title: "See what one sidewalk takes",
  intro: "Scroll to watch a photo get annotated from start to finish, with the same steps and buttons you will use.",
  stepOf: (n, total) => `Step ${n} of ${total}`,
  previous: "Previous step",
  next: "Next step",
  chapters: Object.freeze([
    Object.freeze({
      title: "Say what blocks your way",
      text: "Our model has already boxed the objects it found. Open a box and say whether it gets in your way as you normally travel. If it does, rate it from 1, a minor inconvenience, to 5, impassable.",
    }),
    Object.freeze({
      title: "Answer every suggestion",
      text: "Go through the rest the same way. If a box has nothing real in it, mark it Not an object. Every answer sorts the object into a list under the photo.",
    }),
    Object.freeze({
      title: "Draw what the model missed",
      text: "Drag a box around anything the model missed, pick its category, and answer the same question.",
    }),
    Object.freeze({
      title: "Rate the sidewalk",
      text: "Four quick questions about the sidewalk as a whole: how wide it is, its surface, how comfortable it looks, and whether you could get through.",
    }),
    Object.freeze({
      title: "On to the next sidewalk",
      text: "Once every object is answered, move to the next photo. A session is 5, 10, 20 or 40 photos, and you can pause at any time.",
    }),
  ]),
  /**
   * The same chapters on phones and tablets (22 Oct 2026), where the preview
   * plays the tool's phone layout (touchScript.js): the same titles, shorter
   * text in the tool's words for a finger (tap, Next, Add box, the Step 2
   * line), at most two lines on a phone.
   */
  touchChapters: Object.freeze([
    Object.freeze({
      title: "Say what blocks your way",
      text: "Tap a box. If it gets in your way, tap Yes and rate it from 1 to 5.",
    }),
    Object.freeze({
      title: "Answer every suggestion",
      text: "Tap Next for the next box. Nothing real in it? Tap Not an object.",
    }),
    Object.freeze({
      title: "Draw what the model missed",
      text: "Tap Add box, drag its corners to fit, and pick its category.",
    }),
    Object.freeze({
      title: "Rate the sidewalk",
      text: "Tap the Step 2 line and answer four questions about the sidewalk.",
    }),
    Object.freeze({
      title: "On to the next sidewalk",
      text: "Tap Next Image for the next photo. You can pause at any time.",
    }),
  ]),
});
