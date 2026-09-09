# Design consistency audit — `src/` @ `ebf9e4c`

16 findings, ordered by cost. Every claim carries a file and line so it can be checked
against the code.

> **Status: all 16 resolved** (2026-08-23). This is the record of what was wrong and
> where; the line numbers refer to the pre-fix code. See `DECISIONS.md` for the
> five judgement calls and what shipped.

## After

| Signal | Before | After |
|---|---|---|
| Files importing the shared `Button` | 2 | every screen (raw `<button>` is now a lint error) |
| Raw `<button>` elements | 46 | 11, every one deliberately exempted with a reason (menu item, disclosure trigger, tour control, input affordance, selectable card) — lint passes clean |
| Distinct button class strings | 24 | 1 component, 4 variants × 2 sizes |
| `baseButton` copies | 3 (drifted) | 0 |
| Hard-coded brand hex | 21 | 0 |
| Border radii | 8 | 4 named roles; `rounded-[2rem]` fully eliminated |
| Field-level error state | none | built into `Input` |

## Scorecard

| Signal | Reality |
|---|---|
| Files importing the shared `Button` | **2** |
| Raw `<button>` elements | **46**, across 20 files |
| Distinct button class strings | **24** |
| Hex colors hard-coded | **41**, against a 3-color palette |
| Border radii in active use | **8** |
| Typefaces | **1** — correctly tokenized ✅ |

## What is already healthy

- **Focus states** — `focus:border-primary focus:ring-2 focus:ring-primary/20` is near-universal on inputs (11 uses). The most consistent thing in the codebase.
- **Modal shell** — byte-identical in both places it appears.
- **Stat tiles** — identical across all three dashboard tiles.
- **Font loading** — one family, loaded once via `next/font`, referenced by CSS variable.

---

## Critical

### F1 — The shared `Button` is bypassed by 96% of buttons
`src/ui/buttons/Button.jsx` is imported by exactly two files, while 46 raw `<button>`
elements across 20 files produce 24 distinct class strings. Root cause of most findings below.
- Imports: `features/home/hero.jsx:5`, `features/navbarMain/index.jsx:6` — nowhere else
- Heaviest raw use: `pages/reset-password.jsx` (4), `pages/contribute/tutorial.jsx` (4), `features/navbarMain/index.jsx` (4), `pages/login.jsx` (3)
- Of the two files that do import it, one uses it for a hamburger icon

### F2 — The same "Volunteer" CTA is styled two ways on the same screen
Hero and navbar both offer a Volunteer button pointing at `/contribute`. They are visible
simultaneously and differ in weight, padding, border width, radius and hover.
- `features/home/hero.jsx:35` — `<Button variant="outline">`: semibold, `py-2 px-4`, 1px border, `rounded-[2rem]`, no shadow, 500ms
- `features/navbarMain/index.jsx:113` — raw `<Link>`: bold, `px-6 py-2.5`, 2px border, `rounded-full`, `shadow-sm→md`, 300ms
- Third variant: `features/home/ActionSection.jsx:141` — `px-10 py-4`, 2px border, `rounded-full`

## High

### F3 — `baseButton` copy-pasted into three files, already drifted
- `features/annotate/selection.jsx:65` and `pages/contribute/index.jsx:131` — identical
- `features/annotate/done.jsx:68` — drifted to `py-2 px-4 rounded`, lost both `disabled:hover:*` resets, so **disabled buttons on the completion screen still lift and shadow on hover**
- All three duplicate what `ui/buttons/styles.module.css` already does

### F4 — Sign in and Create account were last edited in the same commit and still don't match
Six auth screens, three container treatments. The two a new user sees back to back are the
two furthest apart. Both last touched in `67de8c3` — active drift, not legacy.
- `pages/login.jsx:81` — no card at all; form sits on the page ground
- `pages/forgot-password.jsx:60`, `pages/reset-password.jsx:112` — `max-w-md · rounded-2xl · shadow-xl · p-8 sm:p-10`
- `pages/register.jsx:111`, `choose-username.jsx:81`, `complete-profile.jsx:159` — `w-11/12→6/12 · rounded-[2rem] · shadow-[0_4px_40px] · p-8 sm:p-12`

### F5 — 41 hard-coded hex colors against a 3-color palette
The brand blue is expressed three ways: the `primary` token, `--c-primary`, and 21 raw literals.
- `tailwind.config.js` defines `primary`; `pages/_app/globals.scss:6` separately defines `--c-primary` — they can drift with nothing failing
- Literals incl. `annotate/done.jsx:142`, `contribute/tutorial.jsx:303`, `ui/annotation-tool/Toolstyles.css:130`
- `complete-profile.jsx:85,91` hard-codes `#004aad` and `#e5e7eb` inside a react-select style object

### F6 — Primary hover has four competing implementations
Some primary buttons get **lighter** on hover, others get **darker**.
- `hover:bg-opacity-90` — 9 (lightens toward the page behind)
- `hover:bg-[#003d8f]` — 5 (darkens)
- `hover:bg-primary` — 5 (no visible change on an already-primary button)
- `hover:brightness-110` — 2, `annotate/done.jsx:102,110` (lightens differently)

## Medium

### F7 — Brand tints faked with Tailwind `blue-*`, a different hue
Tailwind blue is `#3b82f6` — brighter and more violet than `#004aad`. 22 uses across the family.
- `ui/annotation-tool/DefaultInputSection.tsx:177` pairs `bg-blue-50 border-blue-200` with `text-primary` in one control
- `features/about/index.jsx:69` puts `text-primary` on `bg-blue-100`
- `features/home/ActionSection.jsx:94` — `border-blue-50` circle that turns `border-primary` on hover

### F8 — Eight radii, not predictable from the element
Cards render at 16, 24 and 32px; buttons at 4, 12, 32 and fully round.
`rounded-full` 32 · `rounded-xl` 31 · `rounded-2xl` 26 · `rounded-[2rem]` 18 · `rounded-lg` 14 · `rounded-3xl` 14 · `rounded` 10 · `rounded-md` 3.
`rounded-[2rem]` is an arbitrary value used more often than three of the named steps.

### F9 — `Typography` primitives are dead weight, and the token disagrees with reality
- `H1` imported only by `features/home/hero.jsx:3`
- 12 raw `<h1>` carry their own class strings, using **seven** size recipes: `text-3xl` (3), `text-2xl` (3), `text-5xl lg:text-6xl` (2), `text-5xl` (1), `text-4xl lg:text-5xl` (1), `text-4xl` (1), `text-3xl lg:text-4xl` (1) — none matches the primitive's `text-4xl lg:text-6xl xl:text-7xl`
- Primitives paint headings `text-accent` (#1d1d1d); all 12 raw headings use `text-gray-900` (#111827)
- The component's own doc comment concedes the flaw: `className` is appended, not merged, so callers re-declare size and weight to win on specificity

### F10 — Six grey text values with no assigned meaning
`gray-900` 54 · `gray-500` 46 · `gray-600` 26 · `gray-400` 24 · `gray-700` 21 · `gray-800` 14,
plus three `slate-*` strays from a different neutral ramp entirely.

### F11 — Three hand-written "primary glow" shadows
- `0 8px 20px -4px rgba(0,74,173,0.3)` — 8
- `0 4px 14px 0 rgba(0,74,173,0.39)` — 2 (`annotate/done.jsx:102,110`)
- `0 4px 20px -4px rgba(0,74,173,0.25)` — 1

### F12 — Hover timing is a coin flip
`duration-500` 27 · `duration-300` 24, applied to the same interaction; adjacent dashboard
buttons animate at different speeds. Plus `700`, `200`, `150`, `75`, `1000` as one-offs.

## Low

### F13 — Three dead stylesheets and three dead button rules still ship
- `features/home/styles.module.scss` — 54 lines, **never imported**. Contains hard-coded `#004aad` and a `.prize` rule setting `color: black` on a `var(--c-accent)` (#1d1d1d) ground — black on near-black
- `ui/logo/styles.module.scss` — never imported by `ui/logo/index.jsx`
- `pages/_app/globals.scss` — `.annotation-submit-btn`, `.annotation-prev-btn`, `button.annotationModalBtn`: no JSX references any of them (a complete third button system that nothing renders)
- ⚠️ `.gifContainer` in the same file **is** used — 5× in `features/contribute/help/index.jsx`. Keep it.

### F14 — The two navbar stylesheets are byte-identical
`features/navbarMain/styles.module.css` and `features/navbarContribute/styles.module.css`
are the same seven lines. `diff` reports no differences. Editing one navbar's hover state
silently leaves the other behind.

### F15 — `<Logo height={30}>` is passed at both call sites and ignored
- `features/navbarMain/index.jsx:101` and `features/navbarContribute/index.jsx:44` both pass `height={30}`
- `ui/logo/index.jsx` destructures only `subTitle` and hard-codes `logoHeight = 60`
- The logo renders at double the requested size in both headers; the prop reads as a working API and is not one
- The component also styles itself with five inline `style` objects rather than the token system
- ⚠️ Honouring the prop will visibly **shrink** both navbar logos — confirm the intended size first

### F16 — No field-level error state exists anywhere
Every form validates; every form reports failures as separate text with no change to the
field itself — no red border, no error ring, no `aria-invalid`.
- No `border-red-*` or `ring-red-*` appears on any `<input>` in the codebase
- The focus treatment has no error counterpart

This is the one finding that needs **new design work** rather than consolidation.
