/**
 * Every string the landing page's task preview shows (HowItWorks). Kept here
 * so tests can check them: no em dashes and no semicolons in user-facing copy.
 * One caption per chapter of demoScript.js, in the same order, and one per
 * chapter of touchScript.js for phones and tablets (touchChapters). Not an object
 * is offered for the model's boxes only (a box you drew is deleted instead,
 * annotationSubmit refuses it otherwise), so it is in chapter 2, not 3. From
 * 2 Nov 2026 (S12) the first three chapters, laptop and phone alike, name the
 * two questions on every box: on the sidewalk (from 13 Nov 2026, "or the path
 * people walk on" until then), then in your way. From 3 Nov 2026 (S16 follow-up) the phone's first chapter
 * names them too, the path question first, and both "Rate the sidewalk"
 * texts say it is the sidewalk nearest you, as the tour and the guide do.
 * From 5 Nov 2026 (Rans) the copy says "we" where it said "the model", and
 * the drawing chapter is about the objects we missed, obstructing or not.
 */
export const HOW_IT_WORKS_COPY = Object.freeze({
  eyebrow: "How contributing works",
  title: "See what one sidewalk takes",
  intro: "Scroll to watch a photo get annotated from start to finish, with the same steps and buttons you will use.",
  stepOf: (n, total) => `Step ${n} of ${total}`,
  previous: "Previous step",
  next: "Next step",
  /** The phone and tablet preview's cue at its start (S16): scrolling is what plays it */
  scrollCue: "Keep scrolling to play",
  chapters: Object.freeze([
    Object.freeze({
      title: "Say what blocks your way",
      text: "Say if there is a sidewalk or only a path. Then open a box we found and say if it is on the sidewalk, then if it obstructs your path. If so, rate its severity from 1 to 5.",
    }),
    Object.freeze({
      title: "Answer every suggestion",
      text: "Go through the rest the same way. If an object is off the sidewalk or not an obstruction, click No. If a box does not seem to be a real object, mark it Not an object.",
    }),
    Object.freeze({
      title: "Draw the objects we missed",
      text: "Drag a box around any object on the sidewalk we missed, pick its category, and answer both questions.",
    }),
    Object.freeze({
      title: "Rate the sidewalk",
      text: "Six quick questions about the sidewalk nearest you: its width, how obstructed it is, how even it is, its surface, and whether anything separates it from the road.",
    }),
    Object.freeze({
      title: "On to the next sidewalk",
      text: "Once every object is answered, move to the next photo. You can pause and stop your session any time.",
    }),
  ]),
  /**
   * The same chapters on phones and tablets (22 Oct 2026), where the preview
   * plays the tool's phone layout (touchScript.js): the same titles, shorter
   * text in the tool's words for a finger (tap, Next, Add box, the Step 3
   * line from S15), at most two lines on a phone. From S15 (9 Nov 2026) the
   * first chapter, desktop and touch, begins with Step 1, whether there is a sidewalk. From 2 Nov 2026 (S12) the second and
   * third name the two questions on every box: on the walking path, then in
   * your way, and from 3 Nov 2026 (S16 follow-up) the first does too. From
   * 13 Nov 2026 the first question is "on the sidewalk", as the box panel
   * asks it once Step 1 says there is a sidewalk.
   */
  touchChapters: Object.freeze([
    Object.freeze({
      title: "Say what blocks your way",
      // Step 1 first (S15), in the same short questions, within two lines on a phone
      text: "Sidewalk or path? Tap a box. On the sidewalk? In your way? Rate it.",
    }),
    Object.freeze({
      title: "Answer every suggestion",
      text: "Tap Next. Is it on the sidewalk? In your way? Or tap Not an object.",
    }),
    Object.freeze({
      title: "Draw the objects we missed",
      text: "Tap Add box, fit it, pick its category, and answer both questions.",
    }),
    Object.freeze({
      title: "Rate the sidewalk",
      text: "Tap the Step 3 line and answer the questions about the sidewalk nearest you.",
    }),
    Object.freeze({
      title: "On to the next sidewalk",
      text: "Tap Next Image for the next photo. You can pause and stop your session any time.",
    }),
  ]),
});
