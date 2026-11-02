/**
 * Every string the landing page's task preview shows (HowItWorks). Kept here
 * so tests can check them: no em dashes and no semicolons in user-facing copy.
 * One caption per chapter of demoScript.js, in the same order, and one per
 * chapter of touchScript.js for phones and tablets (touchChapters). Not an object
 * is offered for the model's boxes only (a box you drew is deleted instead,
 * annotationSubmit refuses it otherwise), so it is in chapter 2, not 3. From
 * 2 Nov 2026 (S12) the first three chapters, laptop and phone alike, name the
 * two questions on every box: on the sidewalk or the path people walk on,
 * then in your way.
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
      text: "Our model has already boxed the objects it found. Open a box and say if it is on the sidewalk or the path people walk on, then if it obstructs your path. If it does, rate its severity from 1 to 5.",
    }),
    Object.freeze({
      title: "Answer every suggestion",
      text: "Go through the rest the same way. If an object is off the path or not in your way, click No. If a box has nothing real in it, mark it Not an object.",
    }),
    Object.freeze({
      title: "Draw what the model missed",
      text: "Drag a box around anything the model missed, pick its category, and answer both questions.",
    }),
    Object.freeze({
      title: "Rate the sidewalk",
      text: "Four quick questions about the sidewalk as a whole: how wide it is, its surface, how comfortable it looks, and whether you could get through.",
    }),
    Object.freeze({
      title: "On to the next sidewalk",
      text: "Once every object is answered, move to the next photo. You can pause and stop your session any time.",
    }),
  ]),
  /**
   * The same chapters on phones and tablets (22 Oct 2026), where the preview
   * plays the tool's phone layout (touchScript.js): the same titles, shorter
   * text in the tool's words for a finger (tap, Next, Add box, the Step 2
   * line), at most two lines on a phone. From 2 Nov 2026 (S12) the second and
   * third name the two questions on every box: on the walking path, then in
   * your way.
   */
  touchChapters: Object.freeze([
    Object.freeze({
      title: "Say what blocks your way",
      text: "Tap a box. If it gets in your way, tap Yes and rate its severity from 1 to 5.",
    }),
    Object.freeze({
      title: "Answer every suggestion",
      text: "Tap Next. Is it on the walking path? In your way? Or tap Not an object.",
    }),
    Object.freeze({
      title: "Draw what the model missed",
      text: "Tap Add box, fit it, pick its category, and answer both questions.",
    }),
    Object.freeze({
      title: "Rate the sidewalk",
      text: "Tap the Step 2 line and answer four questions about the sidewalk.",
    }),
    Object.freeze({
      title: "On to the next sidewalk",
      text: "Tap Next Image for the next photo. You can pause and stop your session any time.",
    }),
  ]),
});
