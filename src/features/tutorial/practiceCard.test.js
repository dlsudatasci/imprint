import { describe, it, expect } from "vitest";
import { placeCard, coversTarget, unionRect, spotlightPath, centringScroll, photoAndQuestionScroll, CARD_MARGIN, SPOTLIGHT_PAD } from "./practiceCard";

/**
 * S19 (7 Nov 2026): the practice's card beside its target and never over it,
 * on screen at every size S16 checked: the five phone sizes and the four
 * laptop sizes.
 */

const PHONES = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const LAPTOPS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const CARD = { width: 264, height: 104 };
const rect = (left, top, width, height) => ({ left, top, width, height });

function onScreen(place, card, viewport) {
  return place.left >= CARD_MARGIN && place.top >= CARD_MARGIN
    && place.left + card.width <= viewport.width - CARD_MARGIN
    && place.top + card.height <= viewport.height - CARD_MARGIN;
}

describe("placeCard", () => {
  it("puts the card beside a box on the photo, on screen, at every phone size", () => {
    for (const viewport of PHONES) {
      const card = { ...CARD, width: Math.min(CARD.width, viewport.width - 16) };
      // The tree, near the photo's right edge under the top bar
      const tree = rect(viewport.width * 0.73, 90, viewport.width * 0.1, 95);
      const place = placeCard({ targets: [tree], card, viewport });
      expect(coversTarget(place, card, [tree]), JSON.stringify(viewport)).toBe(false);
      expect(onScreen(place, card, viewport), JSON.stringify(viewport)).toBe(true);
    }
  });

  it("goes over the photo, above the answers sheet, when a panel fills the sheet", () => {
    for (const viewport of PHONES) {
      const card = { ...CARD, width: Math.min(CARD.width, viewport.width - 16) };
      const topBar = rect(0, 0, viewport.width, 49);
      const sheet = rect(0, viewport.height * 0.42, viewport.width, viewport.height * 0.58);
      const yes = rect(16, sheet.top + 140, (viewport.width - 40) / 2, 44);
      const box = rect(viewport.width * 0.73, 70, viewport.width * 0.1, viewport.height * 0.12);
      const place = placeCard({ targets: [yes], avoid: [sheet, topBar, box], card, viewport });
      // The open box too where there is room: not on a 320 px phone, where the card is nearly the photo's width
      expect(coversTarget(place, card, [yes, sheet, topBar]), JSON.stringify(viewport)).toBe(false);
      if (viewport.width >= 360) expect(coversTarget(place, card, [box]), JSON.stringify(viewport)).toBe(false);
      expect(onScreen(place, card, viewport)).toBe(true);
      expect(place.top + card.height).toBeLessThanOrEqual(sheet.top);
    }
  });

  it("keeps clear of a button in the answers sheet at every phone size", () => {
    for (const viewport of PHONES) {
      const card = { ...CARD, width: Math.min(CARD.width, viewport.width - 16) };
      const yes = rect(16, viewport.height - 260, (viewport.width - 40) / 2, 44);
      const place = placeCard({ targets: [yes], card, viewport });
      expect(coversTarget(place, card, [yes])).toBe(false);
      expect(onScreen(place, card, viewport)).toBe(true);
    }
  });

  it("goes beside the box on a laptop, clear of the box and of the panel", () => {
    for (const viewport of LAPTOPS) {
      const left = (viewport.width - 960) / 2;
      const tree = rect(left + 700, 260, 90, 240);
      const panel = rect(left + 800, 260, 280, 230);
      const place = placeCard({ targets: [tree], avoid: [panel], card: CARD, viewport, prefer: "side" });
      expect(coversTarget(place, CARD, [tree])).toBe(false);
      expect(coversTarget(place, CARD, [panel])).toBe(false);
      expect(onScreen(place, CARD, viewport)).toBe(true);
      // Left of the tree, since the panel is on its right
      expect(place.side).toBe("left");
    }
  });

  it("never covers the model's line or the buttons at step 3", () => {
    for (const viewport of LAPTOPS) {
      const yes = rect(900, 420, 120, 36);
      const no = rect(1028, 420, 120, 36);
      const hint = rect(900, 390, 248, 22);
      const panel = rect(888, 300, 280, 230);
      const place = placeCard({ targets: [yes, no, hint], avoid: [panel], card: CARD, viewport, prefer: "side" });
      expect(coversTarget(place, CARD, [yes, no, hint, panel])).toBe(false);
      expect(onScreen(place, CARD, viewport)).toBe(true);
    }
  });

  it("moves inside the screen when the target is at its edge", () => {
    const viewport = PHONES[0];
    const atEdge = rect(300, 0, 20, 40);
    const place = placeCard({ targets: [atEdge], card: { width: 260, height: 100 }, viewport });
    expect(onScreen(place, { width: 260, height: 100 }, viewport)).toBe(true);
    expect(coversTarget(place, { width: 260, height: 100 }, [atEdge])).toBe(false);
  });

  it("covers the least of a target too big to keep clear of", () => {
    const viewport = PHONES[0];
    const huge = rect(0, 100, 320, 460);
    const place = placeCard({ targets: [huge], card: { width: 260, height: 100 }, viewport });
    // Above it, against the screen's top margin: the least it can cover
    expect(place.top).toBe(CARD_MARGIN);
    expect(place.side).toBe("above");
  });

  it("works with no target at all", () => {
    const place = placeCard({ targets: [], card: CARD, viewport: LAPTOPS[0] });
    expect(onScreen(place, CARD, LAPTOPS[0])).toBe(true);
  });
});

describe("placeCard next to something (touch, step 6)", () => {
  // Measured in headless Chrome on 8 Nov 2026: the Add box button, the post's
  // outline, the new box after Add box, and the card's size, at each phone size
  const box4 = ([l, t, r, b]) => rect(l, t, r - l, b - t);
  const MEASURED = [
    { viewport: PHONES[0], card: { width: 208, height: 180 }, addBox: [12, 229, 125, 273], post: [210, 121, 229, 189], box: [108, 136, 212, 198] },
    { viewport: PHONES[1], card: { width: 248, height: 161 }, addBox: [12, 401, 125, 445], post: [237, 202, 257, 277], box: [122, 219, 238, 287] },
    { viewport: PHONES[2], card: { width: 263, height: 142 }, addBox: [12, 473, 125, 517], post: [247, 236, 268, 314], box: [127, 253, 248, 325] },
    { viewport: PHONES[3], card: { width: 264, height: 142 }, addBox: [12, 505, 125, 549], post: [257, 250, 278, 331], box: [133, 268, 258, 342] },
    { viewport: PHONES[4], card: { width: 264, height: 142 }, addBox: [12, 593, 125, 637], post: [284, 289, 306, 377], box: [147, 309, 284, 389] },
  ];

  it("sits next to the Add box button, above it from 375 px wide", () => {
    for (const m of MEASURED) {
      const addBox = box4(m.addBox);
      const post = box4(m.post);
      const place = placeCard({ targets: [addBox, post], card: m.card, viewport: m.viewport, near: addBox });
      const at = JSON.stringify(m.viewport);
      expect(coversTarget(place, m.card, [addBox, post]), at).toBe(false);
      expect(onScreen(place, m.card, m.viewport), at).toBe(true);
      // On 320 and 360 px phones a card above it would cover the post: just below it instead
      expect(place.side, at).toBe(m.viewport.width >= 375 ? "above" : "below");
      if (place.side === "below") expect(place.top - (addBox.top + addBox.height), at).toBeLessThanOrEqual(12);
    }
  });

  it("sits above the post once the new box is open, clear of the box, from 360 px wide", () => {
    for (const m of MEASURED) {
      const post = box4(m.post);
      const box = box4(m.box);
      const place = placeCard({ targets: [post, box], card: m.card, viewport: m.viewport, near: post });
      const at = JSON.stringify(m.viewport);
      expect(coversTarget(place, m.card, [post, box]), at).toBe(false);
      expect(onScreen(place, m.card, m.viewport), at).toBe(true);
      if (m.viewport.width >= 360) expect(place.top + m.card.height, at).toBeLessThanOrEqual(post.top);
    }
  });

  it("sits just above the post, and beside it when above would cover the new box", () => {
    const viewport = PHONES[2];
    const card = { width: 260, height: 104 };
    const post = rect(250, 250, 14, 70);
    const above = placeCard({ targets: [post], card, viewport, near: post });
    expect(above.side).toBe("above");
    expect(above.top + card.height).toBeLessThanOrEqual(post.top);
    const box = rect(150, 140, 60, 60);
    const place = placeCard({ targets: [post, box], card, viewport, near: post });
    expect(coversTarget(place, card, [post, box])).toBe(false);
    expect(place.side).not.toBe("above");
  });
});

describe("unionRect", () => {
  it("holds every rectangle, and skips empty ones", () => {
    expect(unionRect([rect(10, 10, 10, 10), rect(30, 40, 10, 10), rect(0, 0, 0, 0)])).toEqual(rect(10, 10, 30, 40));
    expect(unionRect([])).toBeNull();
  });
});

// 8 Nov 2026 (Rans): the screen dimmed but for what the step lights up, as the tour does
describe("spotlightPath", () => {
  const cutOuts = (d) => d.split("M").filter(Boolean).length - 1;

  it("covers the whole page, with one rounded cut-out a lit part, padded", () => {
    const d = spotlightPath([rect(100, 200, 50, 40)], 1280, 2000);
    expect(d.startsWith("M0 0H1280V2000H0Z")).toBe(true);
    expect(cutOuts(d)).toBe(1);
    // Starts at the padded left edge plus the corner's radius, on the padded top
    expect(d).toMatch(new RegExp(`M${100 - SPOTLIGHT_PAD + 10} ${200 - SPOTLIGHT_PAD}H`));
  });

  it("leaves out a part inside another, and a repeat, so neither fills back in", () => {
    const photo = rect(0, 100, 600, 400);
    expect(cutOuts(spotlightPath([photo, rect(50, 150, 40, 40)], 800, 800))).toBe(1);
    expect(cutOuts(spotlightPath([photo, photo], 800, 800))).toBe(1);
    expect(cutOuts(spotlightPath([photo, rect(700, 100, 50, 50)], 800, 800))).toBe(2);
  });

  // S23 B (12 Nov 2026): the white post and the new box beside it on a phone
  it("cuts out parts that overlap as one, so their overlap never fills back in", () => {
    const post = rect(257, 250, 21, 81);
    const box = rect(150, 260, 110, 70);
    const d = spotlightPath([post, box], 400, 800);
    expect(cutOuts(d)).toBe(1);
    // Around both, padded
    expect(d).toMatch(new RegExp(`M${150 - SPOTLIGHT_PAD + 10} ${250 - SPOTLIGHT_PAD}H${257 + 21 + SPOTLIGHT_PAD - 10}`));
    // Three in a chain, the first and last apart: one cut-out
    expect(cutOuts(spotlightPath([rect(0, 0, 50, 50), rect(300, 0, 50, 50), rect(45, 0, 260, 20)], 800, 800))).toBe(1);
    // Close but apart even padded: two
    expect(cutOuts(spotlightPath([rect(0, 0, 50, 50), rect(50 + 2 * SPOTLIGHT_PAD + 1, 0, 50, 50)], 800, 800))).toBe(2);
  });

  it("dims everything when nothing is lit, and skips empty parts", () => {
    expect(spotlightPath([], 10, 10)).toBe("M0 0H10V10H0Z");
    expect(spotlightPath([rect(5, 5, 0, 10), null], 10, 10)).toBe("M0 0H10V10H0Z");
  });
});

describe("centringScroll", () => {
  it("brings the lit part's middle to the screen's middle", () => {
    // A photo 400 tall whose top is 600 px down a 720 px screen
    expect(centringScroll({ region: { top: 600, height: 400 }, viewportHeight: 720, scrollY: 0, maxScroll: 2000 })).toBe(440);
    // Already there
    expect(centringScroll({ region: { top: 160, height: 400 }, viewportHeight: 720, scrollY: 440, maxScroll: 2000 })).toBeNull();
  });

  it("puts a part taller than the screen at its top, under a margin", () => {
    expect(centringScroll({ region: { top: 300, height: 900 }, viewportHeight: 720, scrollY: 100, maxScroll: 2000 })).toBe(384);
  });

  it("stays inside the page", () => {
    expect(centringScroll({ region: { top: 20, height: 40 }, viewportHeight: 720, scrollY: 0, maxScroll: 2000 })).toBeNull();
    expect(centringScroll({ region: { top: 700, height: 40 }, viewportHeight: 720, scrollY: 0, maxScroll: 200 })).toBe(200);
    expect(centringScroll({ region: null, viewportHeight: 720, scrollY: 0, maxScroll: 200 })).toBeNull();
  });
});

describe("placeCard at Step 1 on a phone, with the picture lit (S31)", () => {
  // Measured in headless Chrome on the tutorial (17 Nov 2026): the picture
  // without its black margins, Step 1's heading and line, its Yes, the
  // Step 1 section in the answers sheet and the top bar. The card is the
  // full-width one (cardWide), its line on two lines.
  const LAYOUTS = [
    {
      viewport: { width: 360, height: 740 },
      picture: rect(0, 128, 360, 203), h2: rect(16, 465, 328, 24), p: rect(16, 491, 328, 40), yes: rect(16, 543, 328, 44),
      section: rect(0, 453, 360, 212), topBar: rect(0, 0, 360, 49),
    },
    {
      viewport: { width: 390, height: 844 },
      picture: rect(0, 178, 390, 219), h2: rect(16, 583, 358, 24), p: rect(16, 609, 358, 40), yes: rect(16, 661, 358, 44),
      section: rect(0, 571, 390, 198), topBar: rect(0, 0, 390, 49),
    },
  ];
  const card = { width: 264, height: 123 };

  for (const l of LAYOUTS) {
    it(`covers neither the picture, Step 1's question nor Yes at ${l.viewport.width} by ${l.viewport.height}`, () => {
      // As PracticeGuide gives it: the ring and the step's cardOff as targets, the lit parts and the top bar to avoid
      const targets = [l.yes, l.picture, l.h2, l.p];
      const place = placeCard({ targets, avoid: [l.section, l.picture, l.topBar], card, viewport: l.viewport, prefer: "vertical" });
      expect(coversTarget(place, card, targets)).toBe(false);
      expect(onScreen(place, card, l.viewport)).toBe(true);
      // Between the picture and Step 1: over the black margin and the darkened buttons
      expect(place.top).toBeGreaterThanOrEqual(l.picture.top + l.picture.height);
      expect(place.top + card.height).toBeLessThanOrEqual(l.h2.top);
      // And off the top bar
      expect(place.top).toBeGreaterThanOrEqual(l.topBar.height);
    });
  }

  it("at 360 by 740 sits in the middle of the gap, which is too small for the usual distance on both sides", () => {
    const l = LAYOUTS[0];
    const targets = [l.yes, l.picture, l.h2, l.p];
    const place = placeCard({ targets, avoid: [l.section, l.picture, l.topBar], card, viewport: l.viewport, prefer: "vertical" });
    expect(place.side).toBe("between");
    const room = l.h2.top - (l.picture.top + l.picture.height);
    expect(room).toBeLessThan(card.height + 2 * 12);
    expect(place.top - (l.picture.top + l.picture.height)).toBe(Math.round((room - card.height) / 2));
  });

  it("tries the gap between two targets only when the card fits in it", () => {
    const viewport = { width: 360, height: 740 };
    const targets = [rect(0, 100, 360, 200), rect(0, 400, 360, 200)];
    // 100 px of room: a 123 px card does not fit, and goes elsewhere
    const place = placeCard({ targets, card, viewport, prefer: "vertical" });
    expect(place.side).not.toBe("between");
  });
});

describe("photoAndQuestionScroll (S31)", () => {
  const page = { viewportHeight: 720, maxScroll: 2000 };

  it("centres the photo and the question when both fit", () => {
    // The photo 434 tall, the question below it, 680 from the photo's top to the question's bottom
    expect(photoAndQuestionScroll({ photo: { top: 100, height: 434 }, question: { top: 600, height: 180 }, scrollY: 0, ...page })).toBe(80);
    // A question beside the photo, its top above the photo's
    expect(photoAndQuestionScroll({ photo: { top: 800, height: 434 }, question: { top: 700, height: 180 }, scrollY: 0, ...page })).toBe(607);
  });

  it("puts the question's bottom 16 px from the screen's bottom when they do not fit, the photo's lower part above it", () => {
    const next = photoAndQuestionScroll({ photo: { top: 100, height: 434 }, question: { top: 700, height: 180 }, scrollY: 0, ...page });
    expect(next).toBe(176);
    // The question's bottom, after the scroll
    expect(700 + 180 - next).toBe(720 - 16);
    // The photo's bottom on screen, its top above it
    expect(100 + 434 - next).toBeGreaterThan(0);
  });

  it("keeps a question above the photo whole, at the top, when they do not fit (Step 1 at 1280 by 720, measured)", () => {
    // Step 1 at 288 (144 tall) and the photo at 638 (434 tall), scrolled 105
    const next = photoAndQuestionScroll({ photo: { top: 638, height: 434 }, question: { top: 288, height: 144 }, scrollY: 105, ...page });
    expect(288 + 105 - next).toBe(16);
  });

  it("shows the photo's bottom when the question is beside a photo taller than the screen", () => {
    const next = photoAndQuestionScroll({ photo: { top: 0, height: 900 }, question: { top: 300, height: 150 }, scrollY: 0, ...page });
    expect(900 - next).toBe(720 - 16);
    expect(300 - next).toBeGreaterThanOrEqual(16);
  });

  it("does not scroll when both are already on screen", () => {
    expect(photoAndQuestionScroll({ photo: { top: 20, height: 400 }, question: { top: 450, height: 180 }, scrollY: 300, ...page })).toBeNull();
    // One of them partly off screen: it moves
    expect(photoAndQuestionScroll({ photo: { top: 10, height: 400 }, question: { top: 450, height: 180 }, scrollY: 300, ...page })).toBe(260);
  });

  it("stays inside the page", () => {
    // Centring would scroll above the page's top
    expect(photoAndQuestionScroll({ photo: { top: 10, height: 434 }, question: { top: 460, height: 180 }, scrollY: 30, ...page })).toBe(0);
    // And past its end
    expect(photoAndQuestionScroll({ photo: { top: 100, height: 434 }, question: { top: 700, height: 180 }, scrollY: 0, viewportHeight: 720, maxScroll: 100 })).toBe(100);
  });

  it("centres what there is when the photo or the question is missing", () => {
    expect(photoAndQuestionScroll({ photo: null, question: { top: 600, height: 200 }, scrollY: 0, ...page })).toBe(340);
    expect(photoAndQuestionScroll({ photo: { top: 600, height: 400 }, question: { top: 0, height: 0 }, scrollY: 0, ...page })).toBe(440);
    expect(photoAndQuestionScroll({ photo: null, question: null, scrollY: 0, ...page })).toBeNull();
  });
});
