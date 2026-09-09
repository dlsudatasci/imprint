# Decisions — resolved and implemented

> **Status: D1-D5 answered and applied** (2026-08-23); **D6 added 2026-08-26**.
> Kept as the record of what was chosen and why. See `AUDIT.md` for what each fixed.

Everything else in the design system was settled by counting. These five could not be:
three came out tied or near-tied, and two are cases where the majority is arguably the
wrong answer — so they went to the product owner as taste calls.

---

## D1 — Which input treatment becomes the standard?

Five uses each. A true tie, with no recency tiebreak — both appear in code from the same period.

| | Option A — Recessed *(recommended)* | Option B — Raised |
|---|---|---|
| Recipe | `p-3 · bg-gray-50 · rounded-xl · no shadow` | `p-3 · bg-white · rounded-xl · shadow-sm` |
| Used by | register, choose-username, complete-profile | login, forgot-password, reset-password |
| Case for | Fields read as inset wells; pairs better with the white card most Imprint forms live in, and drops a shadow the app doesn't otherwise use on controls | Fields sit above the surface — but this is only used on login, the one auth screen with a split-panel background, so it may solve that layout rather than being a general choice |

*Both options normalise padding from `p-3.5` and radius from `rounded-2xl`.*

**Decision: A — recessed.** `p-3 · bg-surface-subtle · rounded-control`, implemented in `src/ui/Input.tsx`.

---

## D2 — How fast should hover transitions be?

27 against 24 is not a majority worth acting on, and the two are used interchangeably on the same controls.

| | 300 ms *(recommended)* | 500 ms *(nominal majority)* |
|---|---|---|
| Case for | Standard for hover feedback. At 500ms a colour change is still visibly moving after the cursor has settled, which reads as lag rather than polish | What the existing `Button` component already uses. Choose it if the slower, softer feel is deliberate |
| Cost | 27 edits | 24 edits |

**Decision: 300 ms.** `duration-300 ease-in-out` throughout; the 27 `duration-500` uses were migrated.

---

## D3 — Are Imprint's buttons rounded rectangles or pills?

The most visible decision here — it sets the app's silhouette. The count favours the rounded
rectangle for filled buttons, but every *navigational* CTA is a pill, so the codebase may be
expressing a real distinction rather than an accident.

| | A — Rectangle *(recommended)* | B — Split by role | C — Pill |
|---|---|---|---|
| Recipe | `rounded-xl` everywhere | `rounded-xl` in forms, `rounded-full` for nav CTAs | `rounded-full` everywhere |
| Case for | One shape for every button. Wins on count (7:5), matches the input radius so forms read as a unit, removes `rounded-[2rem]` entirely | Preserves today's feel and encodes a real distinction — but means two shapes and a rule people must remember | Softest, most consumer-facing silhouette. Most common radius at 32 uses, though mostly badges/avatars rather than buttons |

**Decision: A — rectangle.** `rounded-control` (12px) on every button. `rounded-[2rem]` is gone from the codebase.

---

## D4 — What should the auth screens look like?

Three treatments across six screens. The wide card has the numbers (4 files to 2), but it is
also the widest — and auth forms are short. A 6/12-width panel holding one email field is a
lot of empty space.

| | A — Narrow card *(recommended)* | B — Wide card *(majority)* | C — Keep login bare |
|---|---|---|---|
| Recipe | `max-w-md · rounded-3xl · shadow-2xl · p-8 sm:p-10` | `w-11/12→6/12 · rounded-[2rem] · soft ambient · p-8 sm:p-12` | Split panel, no card |
| Case for | Fits the content, and reuses the modal recipe already settled — auth and modals share one surface language. Loses on raw count, wins on coherence | Used by the three multi-field screens where the width earns itself. Keeps the ambient shadow, which would need to become a token | Login's split layout is genuinely different and arguably deserves its own treatment — worth it only if login is meant to be the showpiece |

**Decision: A — narrow card.** All six auth screens now use `AuthCard` (`max-w-md · rounded-modal · shadow-2xl · p-8 sm:p-10`), including login, which previously had no card.

---

## D5 — What colour is a heading: the token, or what actually ships?

`accent` says `#1d1d1d`. Every heading in the app says `#111827`. Close but not the same —
`#111827` is a blue-tinted near-black, `#1d1d1d` is neutral. One has to give.

| | A — Adopt gray-900 *(recommended)* | B — Enforce the token |
|---|---|---|
| Value | `#111827` (54 uses) | `#1d1d1d` (the declared value) |
| Effect | Redefine `accent` as `#111827`. Nothing visible changes, the token becomes true, and its slight blue cast is sympathetic to the brand blue. **One config edit** | Migrate 54 headings onto the token. Every heading shifts very slightly warmer. Choose if the neutral near-black is a deliberate brand decision |

**Decision: A — adopt gray-900.** `accent` is now `#111827`, and `ink` is its preferred name. Nothing shifted visually.

---

## D6 — How much of the system is borrowed default? *(2026-08-26)*

Not a tie this time. This came out of an audit against a list of the visual
habits that make a site read as machine-generated, and three of the hits were
things D2 and D3 had deliberately chosen. That is worth stating plainly: the
earlier decisions were reasonable in isolation, and still added up to a stock
look, because each one picked the most common answer.

The call was **tighten, not reverse** — keep the silhouette, drop the effects
that were doing decoration rather than work.

| | Kept | Changed |
|---|---|---|
| Radius | `rounded-control` 12px on every control (D3 stands) | Content cards moved from `rounded-modal` 24px to `rounded-card` 16px. `rounded-modal` is now **modals and `AuthCard` only** |
| Elevation | `shadow-2xl` on true overlays — modals, dropdowns, floating toolbars | `Card` elevation is border-led: `rest` has no shadow at all, `interactive` hovers to `border-subtle` instead of `shadow-md` |
| Hover | 300ms colour transitions (D2 stands) | `hover:-translate-y-0.5` and `hover:shadow-primary` removed from all four `Button` variants. Base is `transition-colors`, not `transition-all` |
| Tokens | — | `boxShadow.primary` **deleted**. Its only two uses were the button lift and a selected-state glow, both gone |

### Also settled here

- **Icons are hand-drawn.** `lucide-react` is removed from the project. Roughly
  17 of its 25 uses were decoration beside a heading and were deleted outright;
  the ~8 that were doing real work became `src/ui/icons`, drawn in the same hand
  as `SidewalkLoader` with the wobble baked into the path geometry. An icon has
  to earn its place now — if the adjacent label already says it, it goes.
- **One colour family per surface.** The seven saturated 500-weights in
  `CityMap`'s `CITY_COLORS` became a muted set drawn from the SidewalkLoader
  illustration palette. Annotation-tool box colours moved onto `success` /
  `warning` / `primary` instead of indigo and a stray yellow.
- **`font-black` is gone**, as the README already said it should be.
- **The ground has texture.** `body` carries a 3.5%-alpha paper grain, the same
  recipe the loader uses. An off-white with no variation still reads as
  unstyled; this is what makes it read as paper.
- **Skeletons over blank renders.** New `Skeleton` primitive and a shared
  `ContentSkeleton`. The dashboard in particular used to render zeroed stats
  while telemetry was in flight — a `0` that becomes `47` is worse than a
  placeholder, because it looks like an answer.

---

## Adoption order — completed

1. ~~Answer D1–D5~~ — done, above
2. ~~Delete the dead code~~ (F13, F14) — 3 stylesheets + 3 rules removed; `.gifContainer` verified intact
3. ~~Land the tokens~~ (F5, F7, F10, F11) — `tailwind.config.js`, `globals.scss`, `src/ui/tokens.ts`, kept in sync by `npm run lint:tokens`
4. ~~Rebuild `Button`~~ (§7, D2, D3) — `src/ui/Button.tsx`, 4 variants × 2 sizes, plus `IconButton`
5. ~~Migrate buttons by surface~~ (F1, F2, F3, F6) — all three `baseButton` constants deleted
6. ~~Build `Input` and `AuthCard`~~ (F4, F16, D1, D4) — including the error state that did not previously exist
7. ~~Resolve the `Typography` question~~ (F9, D5) — primitives rewritten, CSS module deleted, `Meta` added
8. ~~Add a lint rule~~ — `react/forbid-elements` on raw `<button>` outside `src/ui`, plus a hex-in-className ban and `scripts/check-tokens.mjs`

### Also done, beyond the original plan

- **Typeface change** — Inter replaced by **Ysabeau** (display) + **Plus Jakarta Sans** (body)
- **`ConfirmDialog`** — the duplicated "Stop Session?" modal became one component
- **`Logo` gained a `src` prop** — the mark is a host asset, so an absolute path made the component non-portable
