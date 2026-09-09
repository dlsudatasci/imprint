# IMPRINT Gap Closure — Build Status

> Updated 2026-09-10. Covers all work from the gap analysis through today's session.

## Overview

IMPRINT is a sidewalk accessibility annotation platform for a thesis. Contributors annotate Mapillary street-view images: judging model-suggested obstructions, drawing new ones, rating severity, and answering a scene-level battery about the sidewalk.

**Tech stack**: Next.js 16, React 19, MongoDB 7 (raw driver, no Mongoose), NextAuth 4, Tailwind CSS 3, Yarn (npm fails on eslint peer conflict).

**Branch**: `design-system`

---

## Completed (Chunks 1–3)

### Chunk 1 — Obstruction judgment + severity [B1, B2] ✅

Every bounding box now carries `obstructs: boolean` and `severity: 1–5 | null`.

**Key files changed:**
- `src/ui/annotation-tool/Annotation.ts` — added `obstructs` and `severity` to `IAnnotation`
- `src/ui/annotation-tool/DefaultInputSection.tsx` — full popup rewrite:
  - Model suggestions: Yes/No → (if Yes) SeverityPicker with local state + Confirm button → dismiss
  - User-drawn boxes: label picker + severity slider directly (no Yes/No, they're always obstructions, default severity 3)
  - Severity slider uses native `<input type="range">` for reliable grab-and-drag
  - Confirmed boxes show editable severity slider (not read-only)
  - All popup containers have `stopPropagation` on mousedown/mouseup
- `src/ui/annotation-tool/ReactPictureAnnotation.tsx` — wired callbacks:
  - `onSetSeverity` saves severity to shape data; only auto-dismisses popup on *first* confirmation (not when editing existing severity)
  - `onSetObstructs` toggles obstruction status
  - `onSelectObstruction` for editable boxes sets `obstructs: true`, `severity: 3`
  - Both `selectAnnotation` and `onShapeChange` read per-box `obstructs`/`severity` from shape data into component state (prevents severity sharing across boxes)
  - Popup positioned LEFT/RIGHT of bounding box (not above/below) to prevent canvas scrolling
- `src/pages/api/annotationSubmit.js` — validates `obstructs` boolean on every box, `severity` 1–5 when obstructing

**Popup positioning logic** (in `selectAnnotation` and `onShapeChange`):
```
const stageW = 960, popupW = 290, margin = this.props.marginWithInput;
const rightLeft = x + boxW + margin;
const leftLeft = x - popupW - margin;
const useLeft = rightLeft + popupW > stageW && leftLeft >= 0;
const popupTop = Math.max(0, Math.min(y, 600 - 220));
```

### Chunk 2 — Scene-level battery [B6] ✅

Replaced the old single 1–10 accessibility slider + pavementType radio cards with a 4-item battery per `IMPRINT_SCENE_LEVEL_SPEC.md`.

**Step 2 now has 4 items:**
1. **Sidewalk Present** — Yes / Partial / No
2. **Surface Condition** — 1–4 ordinal (always visible; disabled with opacity when "No sidewalk" selected; clears to null when "No")
3. **Perceived Walkability** — 1–5 ordinal
4. **Overall Accessibility** — 1–5 ordinal

**Step 3 (pavementType radio cards)**: Removed entirely.

**State**: `sceneLevel: { sidewalkPresent, surfaceCondition, walkability, overallAccessibility }` replaces old `sceneRatings` + `pavementType`.

**Files changed:**
- `src/ui/annotation-tool/ReactPictureAnnotation.tsx` — state, UI, validation, submit body, cache all updated
- `src/pages/api/annotationSubmit.js` — validates `sceneLevel` object (sidewalkPresent enum, surfaceCondition 1–4 conditional, walkability 1–5, overallAccessibility 1–5)
- `src/pages/api/publicStats.js` — uses `$avg: "$sceneLevel.overallAccessibility"`
- `src/pages/api/recentSessions.js` — fallback chain: `sceneLevel?.overallAccessibility ?? sceneRatings?.accessibility ?? accessibilityRating`
- `src/pages/api/getAnnotation/[id].js` — returns `sceneLevel`
- `src/pages/viewann/[pid].jsx` — displays with fallback chain

**Validation** (submit): sidewalkPresent required; surfaceCondition required when sidewalk present, null when not; walkability and overallAccessibility always required.

### Chunk 3 — Model version + source tagging + fixes [B5, B7 stub] ✅

- `src/pages/api/annotationGet.js` — `ensureModelVersion()` defaults `modelVersion` to `"v0-mapillary"` on all Image records; called on both existing-session and new-session paths
- `src/features/annotate/form/index.jsx` — passes `servedModelVersion={data.modelVersion}` to ReactPictureAnnotation
- `src/pages/api/annotationSubmit.js` — stores `servedModelVersion`, `source: "contributor"`, `schemaVersion: 2`
- `src/pages/api/auth/register.js` — fixed: insert now includes `role: "user"`, `createdAt`, `updatedAt`
- `scripts/ensure-indexes.mjs` — added index on `annotations.source`

---

## Completed (Chunks 4–6)

### Chunk 4 — Annotator role + annotator mode [B3] ✅

Annotators are trained raters who see images WITHOUT model suggestions and produce ground-truth labels.

**Key files changed:**
- `scripts/set-role.mjs` — CLI to promote/demote users:
  ```
  node --env-file=.env scripts/set-role.mjs --email someone@example.com --role annotator --pass 2
  ```
  Sets `role`, `annotatorPass`, `annotatorActive` on the user record. Validates role is one of `user`, `annotator`, `admin`. `--pass` required for annotators.
- `src/pages/api/auth/[...nextauth].js` — `role` passes through the session callback (denylist approach, role not stripped). New demographic fields (`educationalAttainment`, `occupation`, `walkingFrequency`, `accessibilityFamiliarity`, `priorAnnotationExperience`) added to the session denylist.
- `src/pages/api/annotationGet.js` — branches on `user.role === "annotator"`:
  - Annotators draw from `isReference: true` images only (no city bias)
  - `annotationList` stripped (no model suggestions, ever — both new and resumed sessions)
  - Separate `ANNOTATOR_SESSION_SIZES` [10, 20, 40, 80]
  - User record fetched early for role check + city preferences
- `src/pages/api/annotationSubmit.js` — looks up `user.role`; sets `source: "annotator"` and `servedModelVersion: null` for annotators
- `src/pages/api/publicStats.js` — `source: { $ne: "annotator" }` applied to all annotation queries (not to Image counts, which have no source field)

### Chunk 5 — Demographics completion [R1] ✅

5 new fields added to the profile form and API.

**Fields:**
1. `educationalAttainment` — enum: High school, Some college, Bachelor's, Master's, Doctorate, Other, Prefer not to say
2. `occupation` — free text, max 100 chars, trimmed
3. `walkingFrequency` — enum: Daily, Several times a week, Once a week, A few times a month, Rarely, Never (radio buttons)
4. `accessibilityFamiliarity` — enum: Very familiar, Somewhat familiar, Slightly familiar, Not at all familiar (model input)
5. `priorAnnotationExperience` — enum: Yes, No

**Files changed:**
- `src/pages/api/auth/complete-profile.js` — added allowlists and validation for all 5 fields; occupation validated as non-empty string ≤ 100 chars; all stored in `$set`
- `src/pages/complete-profile.jsx` — added Select dropdowns for education, accessibility familiarity, annotation experience; text input for occupation; radio fieldset for walking frequency. All required for submission.

### Chunk 6 — Reference images + assignment rules [B4, R5, R6] ✅

**Scripts (new):**
- `scripts/migrate-image-schema.mjs` — adds `isReference` (false), `poolStatus` ("served"), `referenceGroundTruth` ([]), `predictions` (null) to all Image records. Uses `$ifNull` to avoid overwriting existing values. Idempotent.
- `scripts/flag-reference-images.mjs` — flags 150 images as `isReference: true`, distributed across cities. Clears previous flags first. Supports `--count N`.
- `scripts/promote-reserve.mjs` — moves `poolStatus: "reserve"` images to "served". Supports `--city`, `--count`, `--dry-run`.

**API changes:**
- `src/pages/api/annotationGet.js`:
  - Fetches completed image IDs for the user; excludes them from all draws (`imageID: { $nin: completedImageIDs }`)
  - Contributor sessions: mixes ~1 in 8 reference images (shuffled in randomly), draws regular images from `poolStatus: "served", isReference: false`
  - Annotator sessions: draws from `isReference: true` only, excludes completed
- `src/pages/api/annotationComplete.js` — after session completion, finds reference images in the session, fetches the user's annotations for them, and appends `{ userId, source, sceneLevel, selectedObjectsID, newObjects, submittedAt }` to `referenceGroundTruth` on each Image record via bulkWrite
- `scripts/ensure-indexes.mjs` — added `Image.pool_reference` (poolStatus + isReference compound) and `Image.isReference` indexes

**Deployment order:**
1. `node --env-file=.env scripts/migrate-image-schema.mjs`
2. `node --env-file=.env scripts/ensure-indexes.mjs`
3. `node --env-file=.env scripts/flag-reference-images.mjs`
4. Deploy code
5. `node --env-file=.env scripts/set-role.mjs --email <annotator> --role annotator --pass 1`

---

## Architecture notes for new sessions

### Annotation tool component structure
- **`ReactPictureAnnotation.tsx`** — class component (~1300+ lines), two stacked canvases, manages all annotation state
- **`DefaultInputSection.tsx`** — functional popup component rendered via `inputElement` render prop pattern
- **`Annotation.ts`** — `IAnnotation` interface with `obstructs`/`severity` fields
- Popup callbacks: `onSelectObstruction`, `onUnselectObstruction`, `onSetSeverity`, `onSetObstructs` passed from class component to popup

### Key patterns
- **Upsert on `{imageID, userId}`** unique index for annotations — resubmitting same image replaces previous answer
- **Session cache** in localStorage survives page reloads between images — saves/restores `userSceneLevel`
- **`inputPosition` type**: `Record<string, number>` to support varying popup position keys
- **Backward-compatible read paths**: fallback chains like `sceneLevel?.overallAccessibility ?? sceneRatings?.accessibility ?? accessibilityRating`
- **`schemaVersion: 2`** on all new annotation records
- **Role-based branching in `annotationGet`**: user record fetched early; `isAnnotator` flag drives session sizes, image source (reference vs served pool), and `annotationList` stripping
- **Completed-image exclusion**: `annotationGet` queries completed annotation `imageID`s for the user and passes them as `$nin` to all image draws
- **Reference image mixing**: contributor sessions get ~1-in-8 reference images shuffled into the batch (Fisher-Yates); the UI is identical so contributors can't tell
- **`referenceGroundTruth` append**: `annotationComplete` looks up which session images are reference, fetches the user's annotations for them, and bulk-writes each judgment into the Image record
- **NextAuth session denylist**: demographic fields stripped from the JWT-to-session copy so research data never reaches the client; `role` is explicitly NOT stripped

### Design decisions
- User-drawn boxes are always obstructions (skip Yes/No, default severity 3)
- Obstruction question kept simple: "Does [label] obstruct the sidewalk?" — verbose perspectivist wording goes in tutorial
- Severity slider uses native `<input type="range">` — custom slider had drag issues
- Popup positioned left/right of box (not above/below) to prevent canvas scrolling
- Surface condition always visible but disabled when "No sidewalk" selected
- `SeverityPicker` component wraps slider with local state for model suggestion first-confirmation (Confirm button), preventing popup dismiss during drag
- `onSetSeverity` only auto-dismisses popup on first confirmation, not when editing existing severity
- Annotator source tagging is server-side (role lookup in `annotationSubmit`), not client-trusted
- `publicStats` uses separate `imageFilter` (no source clause) and `filter` (excludes annotator) to avoid applying annotation filters to Image collection queries
- Demographic fields use the same react-select styling as existing fields (tokens from the design system, not hardcoded hex)
