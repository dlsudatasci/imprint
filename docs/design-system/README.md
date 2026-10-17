# Imprint Design System — v1.0 (implemented)

Reconstructed from `src/` at commit `ebf9e4c`, then applied. The library lives in
[`src/ui`](../../src/ui) and is the single source of every button, field, card and
heading in the app.

- **Build the library:** `npm run build:ui` → `src/ui/dist/`
- **Check the tokens agree:** `npm run lint:tokens`
- **Guardrails:** ESLint forbids raw `<button>` outside `src/ui` and hex colours in `className`

Companion documents:
- [`AUDIT.md`](./AUDIT.md) — the 16 inconsistencies this system is meant to resolve
- [`DECISIONS.md`](./DECISIONS.md) — the 5 open questions that block adoption

Method: every value below was counted across `src/`, not invented. Where the codebase
disagreed with itself, the most-used variant became canonical and the rest were marked
for retirement. Where the count came out tied, the question was escalated rather than
guessed — those are the five in `DECISIONS.md`.

---

## 1. Color

### Brand
| Token | Value | Notes |
|---|---|---|
| `primary` | `#004aad` | Already in `tailwind.config.js`. Also spelled `--c-primary` and as 21 raw literals — see F5. |
| `primary-hover` | `#003d8f` | **New.** Resolves the four competing hover recipes — see F6. |
| `primary-50` / `primary-100` | tinted from `#004aad` | **New.** Replaces the `blue-*` stand-ins — see F7. |
| `accent` | `#1d1d1d` → `#111827`? | Token and reality disagree — see D5. |
| `offwhite` | `#F8F7F9` | Page ground, set on `body`. |

### Neutrals — four roles, replacing six ad-hoc greys
| Role | Value | Uses today | Use for |
|---|---|---|---|
| `ink` | `gray-900` `#111827` | 54 | Headings, primary text |
| `body` | `gray-600` `#4b5563` | 26 | Running copy |
| `muted` | `gray-500` `#6b7280` | 46 | Labels, meta, captions |
| `subtle` | `gray-400` `#9ca3af` | 24 | Placeholders, disabled |

Retire: `gray-700` (21) → `body` · `gray-800` (14) → `ink` · `slate-700/800` (3) → nearest role.

### Surfaces & borders
| Token | Value | Uses |
|---|---|---|
| `border-default` | `gray-200` | 46 |
| `border-card` | `gray-100` | 27 |
| `surface` | `white` | — |
| `surface-subtle` | `gray-50` | 21 |
| `ground` | `#F8F7F9` | — |

Retire: `bg-[#f8fafc]` (2), `#f8f9fa` (1) — redundant spellings of "slightly grey white".

### Semantic — in use everywhere, declared nowhere
`danger` red-600 (36 in family) · `success` green-600 (10) · `warning` amber-600 (10) · `info` = `primary`.

---

## 2. Typography

Two faces, both variable, loaded via `next/font` in `_app.jsx`:

| Role | Face | Variable | Used by |
|---|---|---|---|
| Display | **Ysabeau** | `--font-ysabeau` | `font-display` — all headings (`h1`–`h3` get it by default in `globals.scss`) |
| Body / UI | **Plus Jakarta Sans** | `--font-jakarta` | `font-sans` — everything else |

Ysabeau is a humanist sans with Renaissance-flared stems; Plus Jakarta Sans was
designed as Jakarta's city-identity face. Both were chosen over Inter, which is
correct but ubiquitous.

> The variables are declared on `<main>` (next/font can't reach `<html>` from the
> Pages Router), so `body`'s own `font-family` uses an in-`var()` fallback. Without
> that fallback the declaration is invalid at body level and silently falls back to
> a serif.

### Weights — four roles, replacing six
| Role | Weight | Uses |
|---|---|---|
| `display` | `font-extrabold` 800 | 15 |
| `strong` | `font-bold` 700 | 88 |
| `label` | `font-semibold` 600 | 43 |
| `body` | `font-medium` 500 | 43 |

Retire: `font-black` (10) → `display` · `font-thin` (1, `help/helpItem.jsx:19`) → remove.

### Scale by role
| Role | Proposed | Today |
|---|---|---|
| Page title | `text-4xl lg:text-5xl · extrabold · tracking-tight · ink` | 5 spellings across 6 pages |
| Card title | `text-3xl · extrabold · tracking-tight · ink` | `text-2xl` or `text-3xl`, 5:2 |
| Section | `text-2xl · bold · ink` | 22 uses, mixed weights |
| Body | `text-sm md:text-base · medium · body` | `text-sm` dominates (61) |
| Meta | `text-xs · semibold · muted` | 21, already consistent |

---

## 3. Spacing

Keep seven steps on the 4px grid. Counts are all `p*`/`m*`/`gap*` uses of that step.

| Step | Value | Uses | Use for |
|---|---|---|---|
| `2` | 8px | 87 | Icon/label gaps, chip padding |
| `3` | 12px | 83 | Input padding, tight stacks |
| `4` | 16px | 111 | Default gap, small card padding |
| `6` | 24px | 83 | Card padding, internal gaps |
| `8` | 32px | 63 | Large card padding, block separation |
| `12` | 48px | 34 | Section rhythm, page gutters |
| `20` | 80px | 9 | Major section rhythm |

Retire the singletons: `p-3.5`, `py-2.5`, `py-3.5`, `gap-5`, `gap-24`, `mb-5`, `mb-32`, `py-24`.

### Containers
`max-w-md` (448px) forms · `max-w-3xl` (768px) reading · `max-w-7xl` (1280px) page shell.
Twelve `max-w-*` values are in use today; these three cover every real case.

---

## 4. Radius — four roles, replacing eight

| Token | Tailwind | Uses | Applies to |
|---|---|---|---|
| `radius-control` | `rounded-xl` 12px | 31 | Buttons, inputs, icon buttons |
| `radius-card` | `rounded-2xl` 16px | 26 | Cards, panels, wells |
| `radius-modal` | `rounded-3xl` 24px | 14 | Modals, hero panels |
| `radius-pill` | `rounded-full` | 32 | Badges, avatars, circular buttons |

Retire: `rounded-[2rem]` (18, see D3) · `rounded-lg` (14) · `rounded` (10) · `rounded-md` (3).

---

## 5. Elevation

**Revised by D6 (2026-08-26): elevation is border-led.** A resting surface is
separated by its edge, not by a shadow. Only a true overlay — something floating
over the page and needing to detach from it — earns one.

| Token | Value | Where |
|---|---|---|
| `elev-rest` | *(no shadow)* `border border-line` | every content card and panel |
| `elev-interactive` | `hover:border-subtle` | clickable cards |
| `elev-overlay` | `shadow-2xl` | modals, dropdowns, floating toolbars, `AuthCard` |

`elev-primary` (the `rgba(0,74,173,.3)` blue glow) is **deleted**, along with the
`boxShadow.primary` token that backed it. `shadow-sm`, `shadow-md`, `shadow-lg`,
`shadow-xl` and `shadow-inner` are no longer used anywhere in the app.

---

## 6. Motion

| Property | Proposed | Evidence |
|---|---|---|
| Duration | `duration-300` *(recommended — see D2)* | `500`: 27 · `300`: 24 |
| Easing | `ease-in-out` | 27 of 32 |
| Scope | `transition-colors` | `transition-all` is now unused on controls |
| Lift | **none** — removed by D6 | hover feedback is the colour change alone |

The `transition-colors` recommendation is the one place this document overrides a majority
on grounds other than count: `transition-all` animates every animatable property including
layout, and is the more common source of accidental animation.

One keyframe animation exists: `animate-tray-land`, a chip appearing in a contributor answer
list (scale 0.92 to 1 over 180 ms, §9a). It is always used as `motion-safe:animate-tray-land`.

On phones and tablets (§9b, 9 Oct 2026) two more things move: the answers sheet slides to its
resting point (`transform` over 200 ms ease-out, `motion-safe:` classes), and the photo pans
over 180 ms to keep an opened box clear of the sheet (in code). With
`prefers-reduced-motion: reduce` both happen at once.

On the landing page (15 Oct 2026) a preview of the contributor task plays as the page scrolls
(`HowItWorks`, §9c): it starts playing while it slides into view, growing from 0.88 to full
size as it arrives, then pins with `position: sticky`, and the next scroll goes close in.
A cursor moves between boxes and buttons, and a camera glides close in on the photo and back
out to the whole page. The camera never moves within a shot: the step card fades out of the way
instead. It is the one place motion follows the scroll. With `prefers-reduced-motion: reduce` it does not move at all: one still per step with
Previous step and Next step.

---

## 7. Button

Four variants, two sizes, **one component**. Replaces five competing systems.

| Property | Value | Derived from |
|---|---|---|
| Padding | `py-3 px-6` (md) · `py-2 px-4` (sm) | 7 uses — the plurality |
| Size | `text-base` (md) · `text-sm` (sm) | 7 uses |
| Weight | `font-bold` | bold 88 : semibold 43 |
| Radius | `rounded-xl` | 7:5 over `[2rem]` — see D3 |
| Hover (primary) | `bg-primary-hover` — colour only | see D6 |
| Disabled | `opacity-50 cursor-not-allowed` | consistent where present |

Variants: `primary` (filled) · `secondary` (outline, primary) · `neutral` (outline, gray-200) · `danger`.

The mobile menu toggle is **not** a button variant — it uses `IconButton`, the square
icon-button component this section called for.

---

## 8. Input

| Property | Status | Value |
|---|---|---|
| Focus | settled | `focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none` — 11 uses, effectively universal |
| Border | settled | `border border-gray-200` |
| Text | settled | `text-gray-900 font-medium`, placeholder `gray-400` |
| Surface/padding/radius | **open** | Split 5:5 — see D1 |
| Error | **missing** | No field-level error state exists anywhere — see F16 |

### 8a. Checkbox and radio (added 1 Oct 2026)

Use `<Checkbox>` and `<Radio>` from `@/ui`. Each renders the control and its label in a
flex row, with the control at a fixed `w-5 h-5` and **`shrink-0`**, coloured with
`accent-primary` (there is no Tailwind forms plugin, so these are native controls).

Why: a flex item shrinks by default. A raw checkbox beside a label that wraps onto two
lines loses width to the text, so two checkboxes with identical classes render at
different sizes. That is how the two consent boxes on the sign-up form drifted apart.
ESLint now rejects a raw `<input type="checkbox">` or `<input type="radio">` in
`src/pages` and `src/features`.

**General rule:** any fixed-size element (icon, avatar, thumbnail, control, round button)
placed in a flex row next to text that can wrap gets `shrink-0`. The 1 Oct 2026 scan
added it to the canvas error icon, the "Complete profile" menu icon, the recent-session
thumbnails and the tutorial tooltip's close button.

---

## 9. Card & surface

| Surface | Recipe | Status |
|---|---|---|
| Content card | `bg-surface border border-line rounded-card p-6`, hover `border-subtle` | settled — revised by D6, no shadow |
| Modal | `bg-surface rounded-modal p-8 max-w-md w-full shadow-2xl border border-line` | settled — the one place `rounded-modal` and `shadow-2xl` still apply |
| Stat figures | one bordered row, `divide-x divide-line`, no card chrome | settled — revised by D6. The old `bg-white/60 backdrop-blur-md` glass tiles are gone |
| Auth container | `AuthCard` — `max-w-md rounded-modal shadow-2xl p-8 sm:p-10` | settled — see D4 |

### 9a. Answers under the photo (contributor Step 1, added 7 Oct 2026)

`ObjectTrays` (`src/ui/annotation-tool/ObjectTrays.tsx`) lists the contributor's answers under
the photo. The heading, the photo well and the answers sit in **one card**
(`rounded-card border-line shadow-sm bg-surface overflow-hidden`), so the step reads as one
unit. Annotator steps keep their own layout.

**The canvas** (9 Oct 2026, both roles): the photo (`.rp-image`) and the boxes (`.rp-shapes`) are
two stacked canvases that must cover exactly the same box, so neither ever gets a border,
padding or outline. The photo well around them is the frame.

- **Still to decide**: one line, the count in muted text, then a chip per undecided object.
- **Two lists**, side by side: **Not obstructions** and **Obstructions**. Each is a
  `rounded-card border border-line bg-surface-subtle` box with its title and no count.
- **Empty slots**: while objects are still to decide, each list ends with chip-sized dashed
  slots with a "+" (three while the list is empty, one once it has chips), so it is clear that
  answers will go there. None once every object is answered. An image with no objects at all
  shows three in each list (17 Oct 2026), since the boxes the contributor draws go there.
- **Not an object**: a muted label and plain chips under the lists, named by the model's own
  category.
- **Chips** are the only element: `h-7 rounded-control border text-xs font-semibold`, and a
  click opens the box's panel, where answers are given and changed. No photos, no severity, no
  per-chip buttons.
- **Colour**: chips in the two lists are plain white (`bg-surface border-line text-ink`), since
  the list already says the answer. Still-to-decide chips are dashed like their boxes on the
  canvas: amber for a suggestion, blue (`border-primary`) for a box the contributor drew. A
  drawn box has a small pencil before its name in `text-primary`, the blue of its box on the
  canvas, with "Drawn by you" as its title and for screen readers. The open box's chip is
  highlighted (see below).
- **Hiding a box** (8 Oct 2026, both roles): each chip ends in an eye (`EyeIcon` from `@/ui`,
  14px, `text-subtle`) that hides its box on the photo. A hidden chip fades to `opacity-60` with
  `EyeOffIcon`, and a line at the right of the top row says "2 boxes hidden" with Show all. The
  annotators' Objects in This Image list uses the same eye. From 10 Oct 2026 the top line also
  has **Hide all** (beside Show all, until every box is hidden), and the box panel has the same
  eye (`EyeOffIcon`, "Hide this box on the photo"), which hides the open box and closes its
  panel.
- **The open box's chip** (10 Oct 2026): `border-primary bg-primary-50 ring-2 ring-primary/40`
  with `aria-current`, in the contributors' lists and the annotators' Objects in This Image.
- **Motion**: the chip appearing (`motion-safe:animate-tray-land`, §6) is the only animation.

The box panel (`DefaultInputSection`) asks the same question of every box: category, then Yes
or No as two equal buttons that fill with `bg-primary` once chosen. No closes it, Yes opens
the severity picker. A box answered Yes shows "Severity 3" and a Change button, which reopens
the picker. The severity's wording ("Significant narrowing") appears on the picker only. Not an object (suggestions) and Delete box (drawn boxes) are secondary
buttons at its foot, never entries in the category list.
On the desktop photo the panel opens beside the box (`panelPosition`) and, once rendered, moves up
just enough to end at the photo's bottom when it is taller than the room kept for it
(`fitPanelTop`, 16 Oct 2026), so its foot, with Not an object, is never cut off. The annotators'
panel does the same.

### 9b. Phone and tablet: the sheet layout (added 9 Oct 2026, annotators from 12 Oct 2026)

Everyone can annotate on any device: contributors from 9 Oct 2026, annotators from 12 Oct 2026
with their three steps. There is no device gate.

- **Which layout** (`useAnnotateLayout`): the sheet layout under 1024 CSS px wide, **and on
  every phone and tablet at any width** (a finger as the primary pointer, `(pointer:
  coarse)`), for both roles. The desktop layout above is for a mouse or trackpad from 1024 px.
  Before 12 Oct 2026 the layout went by width alone, so an iPad was the sheet layout upright
  and the desktop layout sideways with touch added to it: two tools on one device, and a
  tutorial with beacons over a touch screen. Now a tablet is the sheet layout either way up.
  The interaction is still chosen by input, so a finger on a touch-screen laptop (desktop
  layout, a mouse as its primary pointer) uses the touch interaction on the photo.
- **Screen**: one fixed surface covering the page (`annotate-sheet-screen`, `100dvh` with a
  `100vh` fallback, `#0b0f14` behind the photo). The page under it does not scroll, and the
  site's navbar and footer are **not rendered** while it is up (`useHideSiteChrome`, 12 Oct
  2026): the navbar is `relative z-50` and was painted over the top bar.
- **Top bar** (`MobileTopBar`): 48 px plus the safe-area inset, "Sidewalk 3 of 10" with a 4 px
  progress bar, and Pause and Stop as 44 px `IconButton`s. No thumbnails and no big title. In
  the tutorial it also has a **?** button (`HelpIcon`, "Show the tour").
- **Photo area**: from the top bar to the top of the collapsed sheet. The stage is the area
  itself in CSS px (no CSS scale), so labels stay 12 px and handles keep their size. The photo
  is letterboxed on the dark background and can be pinched to zoom (1 to 5 times), with a
  44 px **Fit** button top right while zoomed.
- **Sheet** (`BottomSheet`, not modal): `rounded-t-2xl`, a header that is always in view, a
  body that scrolls, and a footer (the action bar) that is always in view above the home
  indicator. Only the header drags, and it allows sideways scrolling for its chip rows. Resting
  points: collapsed (header and footer), half, full (all but 8 px), and panel while a box is
  open (its panel and the footer, at most 60%). The handle is a 36 x 5 px pill in a 44 px
  button ("Show more", "Show less").
- **The sheet's top part** (`ObjectTraysPeek`): "Still to decide n" with Next, then the
  Not obstructions and Obstructions rows (44 px each, chips scrolling sideways, an empty dashed
  slot when a row is empty), then the Step 2 line, which pulls the sheet up to Step 2. Fixed
  heights, so the photo area never changes size as objects are answered. With a box open the
  top shows only its name and the body shows its panel (`variant="sheet"`).
- **Touch handles**: four round corner handles, a 20 px dot (white, a 2.5 px ring in the box's
  colour, a soft shadow) with a 44 px reach. No edge handles. A rejected box gets none.
- **Magnifier**: a 112 px circle showing the photo at 2.5 times its display scale, the box's
  outline and a crosshair on the point being dragged. Dark past the photo's edge. Only while a
  corner is dragged with a finger, or, from 10 Oct 2026, while any of the eight resize handles
  is dragged with the mouse (both roles), so it is the same on every device. From 15 Oct 2026
  it sits outside the box being fitted, 12 px clear of it and its handles (`loupePlacement` in
  `loupe.ts`): above, beside or below the box, wherever is nearest the corner, 8 px inside the
  photo, clear of the finger (24 px) or pointer (16 px), above a pulled-up sheet, and off the
  floating panel when there is room. On touch it goes below the box only when nothing else is
  clear, since the hand is there. It keeps the side it used last while that stays clear. When
  nothing is clear (a box filling the photo) it covers as little of the box as it can. In the
  Sidewalk step, with no box, it is 96 px above the finger (below it near the top), as before.
- **Add box**: a 44 px white pill with a plus, bottom left of the photo (also on a desktop
  layout with a touch screen). It places a box of 30% of the visible photo in its middle, at
  least 48 px a side, and shows "Drag the corners to fit the object." until a corner is moved.
- **Targets and text**: every touch target is at least 44 px tall (chips and eyes 40 px with
  8 px between them, `[@media(pointer:coarse)]`). Text inputs are 16 px (`text-base`) so iOS
  does not zoom the page. Touch copy says "tap", never "click".
- **Sideways**: a phone held sideways (`(orientation: landscape) and (max-height: 500px)`)
  shows a notice over the tool, which stays mounted: "Turn your phone upright, or annotate
  sideways in full screen." with a primary button "Annotate in full screen". Not shown in full
  screen.
- **Nothing on this screen scrolls except the sheet's body** (12 Oct 2026). The screen, the
  photo area and the sheet's container hide their overflow, and a hidden-overflow box can
  still be scrolled by script: `scrollIntoView` on something in the sheet scrolled all three,
  which left the photo shifted with a dark gap under it and nothing to scroll it back. So
  they carry `data-no-scroll` with `overflow: clip` (`NO_SCROLL_STYLE`), the tool puts back
  any that scrolled anyway, and bringing something into view scrolls only the nearest
  `[data-sheet-scroll]` (`scrollSheetTo`). Never call `scrollIntoView` here. The touch tours
  set `skipScroll`, so the tour library does not scroll either.

**Annotators in the sheet (12 Oct 2026).** The same screen, with the sheet's content per step.

- **Header** (always in view, fixed row heights): the step heading (`text-xs font-bold
  text-muted`, 20 px), then the step's rows. Objects: "To decide n" with Next, then every
  object as a chip with its status (To decide, Kept, Drawn, Not an object) in one
  sideways-scrolling row. Sidewalk: the shape count at the right of the heading, the drawing
  toolbar, and a two-line hint (32 px). Obstructions: "Marked n of m", the objects as chips
  that toggle (red when marked), and the confirmation checkbox.
- **Body**: the step's instructions, then its cards in their `sheet` variant: full width, not
  sticky, no inner scroll, chips and buttons at least 44 px, no text under 12 px. The cards keep
  their ids, which the tours point at.
- **Footer**: the step's two buttons with short labels, so they fit a 360 px screen: "Back" or
  "Previous", and "Next: Sidewalk", "Next: Obstructions", "Next Image" or "Finish Session".
- **Sidewalk drawing tools** (`renderSidewalkToolbar`, rule in `sidewalkTools.js`, 13 Oct
  2026). Only the tools for what the annotator is doing show: **Finish**, **Undo**, **Cancel**
  while a shape is drawn. **Delete point**, **Delete shape** and, with a mouse, **Done** while a
  finished shape is selected. None otherwise. **Photo only** (a view setting) is always there.
  One set of labels on every device, with the full name (Finish shape, Undo point, Cancel
  shape, Show photo only) as the accessible name. Three variants:
  - `desktop`: a bar at the top of the photo's card, `min-h-[44px]`, one line that never
    wraps, so the photo does not move as the tools change. Left: a status line (`text-sm
    font-semibold`, shown from `xl`), "Drawing a shape: 3 points", "Shape 1: point 2 of 4", or
    what to do next. Right: the tools as `Button size="sm"` with a 16 px icon, Finish
    `primary` and the rest `neutral`, Done as the 38 px tick of the Objects box panel, a hairline
    divider, then Photo only (`primary` while on). Tooltips name the key: Finish shape
    (Enter), Undo point (Backspace), Cancel shape (Esc), Delete shape (Delete), Done (Esc).
  - `sheet`: a 44 px row at the top of the answers sheet, 44 px buttons with an 18 px icon
    and the label, Finish filled. Beside other tools Photo only is its icon alone, so the row
    fits a 360 px phone without scrolling.
  - `compact`: icons only, on the full-screen photo.

  A pop-up beside the shape, like the Objects box panel, was considered and turned down: a
  shape has nothing to answer, and a pop-up on the photo covers where the next point goes.
- **Outline handles on touch** (`sidewalkHandleRadii`): circles in CSS px, 8 for a point of the
  selected shape (filled when selected), 6 for the dot in the middle of an edge and for a point
  of the shape being drawn, 12 for the first point once the shape has 3 points. The mouse keeps
  its 6 px squares and 3 px dots.
- **Drawing with a finger**: a tap adds a point, a drag aims it with the magnifier, a tap on
  the first point closes the shape. A point of the selected shape is dragged, a dot on an edge
  adds a point. Reach is 22 px. The magnifier shows the outline in place of a box.

**Full-screen photo (phones and tablets, 12 Oct 2026).** Any device with a finger as its
primary pointer (`(pointer: coarse)`), on either layout. Never with a mouse. A phone is such a
device with a screen whose shorter side is under 600 px (`isPhone`).

- **Buttons**: a round 44 px button bottom right of the photo, level with Add box
  (`ExpandIcon`, "Full-screen photo"). In full screen the same corner holds Exit (`ShrinkIcon`,
  "Exit full screen").
- **The screen**: the sheet layout, which every phone and tablet has, with no top bar and the
  answers sheet down to its handle, so the photo has the screen either way up. The browser's own full screen is asked for where it exists (Android,
  iPad), and on a phone a sideways lock (Android). Both are ignored where they do not exist
  (iPhone). A tablet is never turned.
- **The sheet in full screen** (`BottomSheet compact`): at rest only the 44 px handle shows,
  above the home indicator. It is pulled up by the handle, or by the chip's button. Up, it is
  the usual sheet across the whole width, with everything in the part that scrolls and the
  footer (the message and the step's buttons) under it: the open box's name and panel, or the
  contributor's lists and Step 2 (without the short summary the sheet shows at rest elsewhere,
  which would say the lists twice), or the annotator's step. Where half would leave under
  160 px to scroll (a phone held sideways, about 390 px tall) it goes straight to full, and a
  box's panel takes the height it needs. A box selected on the photo leaves the sheet down.
  Answering a box, and moving to the next step, put it down again. A message from Next Image
  or a step button brings it up. The same elements as outside full screen, so nothing is
  rebuilt on the way in or out.
- **Status chip**, top left, white and rounded, 44 px: a selected box's name with Delete (a
  box the person drew, `TrashIcon`) and **Details**. Nothing selected: "3 still to decide"
  with **Answers** (contributors) or "3 to decide" with **Details** (annotators). Sidewalk:
  the compact toolbar with Details. Obstructions: "Marked 2 of 7" with Details. The button is
  a 36 px primary pill that pulls the sheet up, and is gone while the sheet is up.
- **Kept between images**: Next Image and Previous reload the page. A page left in full
  screen notes the time (`KEEP_FOCUS_KEY` in sessionStorage), and a page that loads within 15
  seconds starts in full screen. The browser's own full screen needs a tap, so the first tap
  asks for it again.
- **Safe areas**: the overlays sit at `max(12px, env(safe-area-inset-*))` from the top and
  sides, and 12 px above the sheet's handle.
- **The tutorial's tour waits** while the photo is full screen: its steps point at the top
  bar and the top of the sheet. A tour that would start there starts on leaving. Its first
  step says where the full-screen button is, on phones and on tablets.

**Step 2 in the sheet.** A row of options wraps when it does not fit (`flex-wrap`), and the
five accessibility options go three and two under 390 px. Before 12 Oct 2026 the fifth stuck
out of its card on a 360 px phone. The desktop layout keeps one row per question.

**The tutorial on touch (12 Oct 2026).** The touch tours (sheet layout) have **no beacons**:
over the photo and the sheet they blocked swipes and drags. The top bar's ? button replays the
step's tour, and "Tap ? to see the tour again." shows once after the first tour ends. A tooltip
that points at the whole photo, or at a card in the pulled-up sheet, is centred on the screen.
The desktop layout, for a mouse, keeps its tours and beacons. No phone or tablet gets them, and
none show while the photo is full screen.

**Wording.** The sheet layout says "tap", and so does the desktop layout if a finger is ever
its primary pointer (a guard: such a device has the sheet layout). They say "tap" in the tours, the annotator step paragraphs, the Sidewalk
Outline hints and the Keep or Not an object message (12 Oct 2026), and name Add box where the
mouse copy says to draw by dragging. With a mouse or
trackpad as the primary pointer the desktop copy is unchanged.

### 9c. Landing page preview (added 15 Oct 2026)

Below the city figures, the landing page plays the contributor task as the visitor scrolls
(`src/features/home/HowItWorks.jsx`, spec `IMPRINT_landing_task_preview.md`).

- **The scroll** (Rans, 15 Oct 2026: immersive, like Apple's product pages): a big centred
  heading, then the frame. The preview starts half a screen before the frame pins, the frame
  growing from 0.88 to its full size as it arrives, seen whole as it slides in and settles. A
  short scroll after it pins (about a twelfth of a screen, `HOLD_END`) the camera goes close in.
  It plays over 4.1 screens in all (a 4.6-screen track). The script is one timeline of named steps in `demoScript.js`, laid out over
  the scroll, so steps can be added, removed or lengthened without working out the ticks.
- **What it shows**: the annotation page as contributors see it on a laptop (the Step 1 card,
  Step 2 beside it, Next Image under them), without the session thumbnails and the
  "Sidewalk #n" title.
- **The frame**: in the page's `Container` margins like the hero and its map, as tall as the
  screen less `py-4 lg:py-6`, `rounded-card border border-line bg-ground` like the map.
- **The camera** films it: the whole page, then close in on the photo for Steps 1 to 3 without a break (fitted
  to the frame, never past 2), panned down so nothing above the photo's grey well shows: no
  Step 1 heading and no cut-off line of its instructions (`keepBelow`). Then back out to the whole page, centred, for Step 2 and
  Next Image (a close shot of Step 2 left empty ground beside it). The page is laid out at 1200 design px and never zoomed past 2.
  Beyond its edges is the same `bg-ground`. On phones Step 1, Step 2 or Next Image stand in
  for the whole page.
- **The step card** sits inside the photo's bottom-left corner, 16 px in, as the close shot
  shows it (`captionPlace`, across the width at the bottom on phones), worked out from the
  frame's size only, so it does not move while the preview plays. On a phone the camera frames
  its shots in the space above the card. The camera never moves for the card (panning around
  it made the view shake while scrolling, Rans, 15 Oct 2026). Instead the card fades to 0.3
  (faded, not hidden): where the script marks it (`{ card: "faded" }` in `demoScript.js`), from
  the moment Lamp Post #2's panel appears through its severity, steps close together (at full
  strength while the box is drawn), and wherever else the cursor comes near it or more than a
  twentieth of a box, panel or list goes under it at that screen size (`cardCovers`, Car #1's
  panel on a laptop, not Motorcycle #1's). It fades at once, so it is
  never over a panel that has just opened, and comes back over 300 ms. It is an overlay, so `shadow-2xl`.
- **Drawn from the tool's own components**: `Step1Card` (Step 1's heading, instructions, the
  photo's grey well and the answers under it), `DefaultInputSection`, `SeverityPicker`,
  `ObjectTrays` and `SceneQuestions`. The boxes take their colours, line widths and dashes,
  shadow, label size and handles from `Shape.ts` (`boxStrokeColor`, `boxIsSolid`,
  `boxLineStyle`, `boxLabelColors`, `defaultShapeStyle`), and the panel opens where the tool
  opens it (`panelPosition`). Any change to them shows in the preview. Nothing about the
  annotation screen may be restyled in the preview alone.
- **Keeping in step (15 Oct 2026)**: the cursor finds the panel's controls by `data-control`
  (`yes`, `no`, `confirm`, `category`, `severity`) and Step 2's by `data-scene-option`, never by
  their wording, so rewording a button does not lose it. Keep those attributes when changing
  the components. `DemoStage.test.jsx` renders every step of the script and fails, naming the
  step, when something the cursor goes to is missing. Still copies, to update by hand if the
  tool changes them: the photo's boxes drawn as SVG (the canvas needs a session), the open
  category list (a native list cannot be shown open), and the Next Image row (in the tool it
  depends on the session: Previous, Finish Session, the annotator steps). The answers and the
  order of the clicks are in `demoScript.js`.
- **Performance**: the camera's `will-change: transform` is set only while it moves.
- **Box labels** are 20 px tags whose top edge is the box's top line, as `Shape.paintLabel`
  draws them on the canvas.
- **Accessibility**: no skip link (Rans, 15 Oct 2026): nothing in the section takes focus, so Tab
  goes straight past it. The drawing is `inert` and `aria-hidden`, and the chapters are in the page
  as text (an `sr-only` list). With `prefers-reduced-motion: reduce` it is one still per step.
- **The script and its answers** are in `src/features/home/howItWorks/demoScript.js`.
- **The join card** (`ClosingSection`, 15 Oct 2026) is the end of the page, the Metro Manila and
  impact sections removed. Plain on purpose: `rounded-modal border border-line bg-surface`, no
  shadow (D6), the heading (`H2`, `lg:text-4xl`) and its line on the left and the button on the
  right, stacked on phones. Nothing else (Rans: better looking, not more extravagant).

---

## 10. Icons

Hand-drawn, in `src/ui/icons`. `lucide-react` was removed from the project by D6.

The set is deliberately small — eight icons — because an icon has to do work the
adjacent label can't. Roughly seventeen of the twenty-five original uses were
decoration sitting beside a heading, and were deleted rather than redrawn.

| | |
|---|---|
| Available | `MenuIcon` `CloseIcon` `ChevronDownIcon` `CheckIcon` `EyeIcon` `EyeOffIcon` `LogOutIcon` `AlertIcon` |
| Grid | 24x24 viewBox, rendered at `size` (default 24) |
| Stroke | `currentColor` at 1.8, round cap and join — colour comes from the surrounding text token |
| Style | Path geometry is deliberately irregular, matching `SidewalkLoader`. The wobble is in the coordinates, not an SVG filter, so each icon is self-contained with no shared `<defs>` to mount |
| A11y | `aria-hidden` by default. Pass `title` to give it an accessible name and `role="img"` — only for an icon with no adjacent label |

**Before adding one**, check the label doesn't already say it. Section headings,
card headers, and list bullets do not get icons.

### Rules

- Never reach for an icon library. If a new icon is genuinely needed, draw it in
  the same hand and add it here.
- Never use an emoji as an icon. `🎉 🏆 ⚠️ ☰` were all doing icon work before D6.
- Never use a check icon as a list bullet — that is a stock pattern. Use
  `list-disc` with a `marker:` colour.
