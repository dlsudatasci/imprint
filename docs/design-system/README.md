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

---

## 9. Card & surface

| Surface | Recipe | Status |
|---|---|---|
| Content card | `bg-surface border border-line rounded-card p-6`, hover `border-subtle` | settled — revised by D6, no shadow |
| Modal | `bg-surface rounded-modal p-8 max-w-md w-full shadow-2xl border border-line` | settled — the one place `rounded-modal` and `shadow-2xl` still apply |
| Stat figures | one bordered row, `divide-x divide-line`, no card chrome | settled — revised by D6. The old `bg-white/60 backdrop-blur-md` glass tiles are gone |
| Auth container | `AuthCard` — `max-w-md rounded-modal shadow-2xl p-8 sm:p-10` | settled — see D4 |

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
