/**
 * Every string the About page shows, so tests can check them (16 Oct 2026): no
 * em dashes and no semicolons in user-facing copy.
 *
 * Written in general terms, like the page before it (Rans, 16 Oct 2026):
 * Imprint is a platform, so the page explains what volunteers do and why their
 * view matters, not what the study measures. What it still had to fix from the
 * old page, and where the replacement comes from:
 * - Labels "train the models": only the obstruction classifier is retrained,
 *   the detector is frozen (chapter_1.tex Scope). Now "help the model get
 *   better at telling which objects get in people's way".
 * - "Simple micro-tasks": chapter_3.tex places the task at the
 *   distributed-intelligence level. Removed.
 * - The lists of things people value and that get in the way (ramps, tactile
 *   paving, manholes): not what Imprint records. Replaced by the 18 categories
 *   (Table 4.1) and the four questions about the sidewalk (§7n).
 * - The same object judged differently by different people: chapter_1.tex and
 *   chapter_3.tex (the wheelchair user and the pole).
 * - The photos: Mapillary and ATLAS-3. ATLAS-3 is described, not named, as
 *   photos from an earlier research group (Rans, 16 Oct 2026). It was made by an earlier
 *   research group (§7h), not a public dataset, with faces and plates blurred.
 * - Taking part: appendix_C.tex (18 or older, voluntary, unpaid, stop any time).
 *
 * Left out on purpose: the study's hypotheses, which are withheld until the
 * debriefing (chapter_4.tex, Ethical Considerations), that some photos are
 * reference images (chapter_4.tex, Research Design), and devices, since the
 * consent form and the platform are being brought into line (§7u).
 */
export const ABOUT_COPY = Object.freeze({
  eyebrow: "About Imprint",
  title: "Mapping how accessible Metro Manila's sidewalks really are.",
  lead:
    "Imprint is a collaborative crowdsourcing platform for mapping urban walkability. Volunteers look at street photos and say which objects get in their way, and a model learns from their answers.",

  problem: Object.freeze({
    title: "Obstructions decide whether a sidewalk works.",
    paragraphs: Object.freeze([
      "Utility posts, trees and signs, parked cars and motorcycles, vendor carts and garbage all narrow the space a pedestrian can actually use.",
      "Yet they are what sidewalk audits most often leave out, and walking every street by hand to record them does not scale to a whole city.",
    ]),
    imageAlt: "A wide sidewalk lined with trees, hedges and lamp posts",
  }),

  person: Object.freeze({
    title: "The same pole, two different answers.",
    text:
      "A model can find a pole in a photo. It cannot say whether the pole stops you. Someone on foot may step around it, while a wheelchair user may have to leave the sidewalk entirely. That judgment belongs to the person walking, so Imprint asks people for it.",
    examples: Object.freeze([
      Object.freeze({ who: "On foot", answer: "Steps around it" }),
      Object.freeze({ who: "In a wheelchair", answer: "Has to leave the sidewalk" }),
    ]),
    exampleCaption: "An example of one object judged by two people.",
  }),

  steps: Object.freeze({
    title: "How it works",
    items: Object.freeze([
      Object.freeze({
        title: "A model suggests",
        text: "Before you see a street photo, a model has already boxed the objects in it.",
      }),
      Object.freeze({
        title: "You decide",
        text: "Open each box and say whether the object gets in your way as you normally travel, and if it does, how much, from 1 to 5. Mark a box with nothing real in it as Not an object, and draw any object the model missed.",
      }),
      Object.freeze({
        title: "You rate the sidewalk",
        text: "Answer four questions about the sidewalk as a whole: its width, its surface, how comfortable it looks, and whether you could get through.",
      }),
      Object.freeze({
        title: "The model learns",
        text: "Your answers help the model get better at telling which objects get in people's way.",
      }),
    ]),
    previewLink: "See it in action",
    guideLink: "Read the annotation guide",
  }),

  record: Object.freeze({
    title: "What you record",
    intro: "Eighteen kinds of object, some that come and go and some that stay put.",
    other: "Anything else can be named with Other.",
    surface: "Cracks and uneven paving are not boxed. A surface has no edges to draw a box around, so it is one of the questions about the sidewalk instead.",
    questionsTitle: "Four questions about each sidewalk",
  }),

  photos: Object.freeze({
    title: "The photos",
    text: "Street photos taken on foot around Metro Manila, from Mapillary and from an earlier research group, with faces and license plates blurred. You see streets from the cities you say you walk in first.",
  }),

  join: Object.freeze({
    title: "Taking part",
    text: "Anyone 18 or older can volunteer. Taking part is voluntary and unpaid. You choose how many photos to do in a session, and you can stop at any time.",
    before: "Before you sign up, read the",
    consent: "Informed Consent Form",
    and: "and the",
    privacy: "Privacy Policy",
  }),

  team: Object.freeze({
    title: "The team",
    text: "Imprint is developed by Francis Bawa, a BSMS Computer Science student at De La Salle University, under the Human-X Interactions Lab Research Center. His research focuses on human-computer interaction and human-centered mobility.",
    contact: "Questions about Imprint?",
    imageAlt: "The De La Salle University campus at dusk",
  }),
});
