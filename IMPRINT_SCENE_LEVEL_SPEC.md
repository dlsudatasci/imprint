# Scene-level battery: specification

**Written 9 September 2026.** Companion to `IMPRINT_GAP_ANALYSIS.md`, which
covers the whole platform. This file covers step 2 of that document's build
order only, because the decision needed evidence and the evidence changed the
answer.

**Decision: build 4 scene-level items, not the 7 the manuscript names.**

---

## 1. Why 4 and not 7

§4.2.1 names seven scene-level assessments: perceived walkability, pedestrian
safety, overall sidewalk condition, surface condition, overall accessibility,
sidewalk presence, curb-ramp presence.

Tracing each through the analysis sections of §4.5:

**None of them trains anything.** §4.2.1 is explicit: *"they are not inputs to
any model and are not used in retraining, which operates only on the binary
obstruction judgment."* Cutting scene-level items cannot break a model.

**§4.5 severity metrics does not use them.** It opens by naming scene-level
assessments, but the three quantities it actually reports are severity
distribution by category, an ordinal mixed model on severity, and a logistic
model on the binary obstruction judgment. No scene-level item appears in any of
the three.

**§4.5 quality metrics does use them**, inside Krippendorff's alpha with ordinal
weighting, but as a group. Four items instead of seven changes how many things
agreement is computed over, not whether the measure works.

Three items have a job beyond agreement scoring:

| Item | Job |
|---|---|
| Surface condition | §4.2.1 deliberately excludes surface barriers (cracked pavement, uneven surfaces) from the object taxonomy and captures them "as a scene-level attribute". Drop this and **nothing in the study records surface at all** |
| Sidewalk presence | §4.2.1 records absence as a scene-level accessibility barrier, and it is the human cross-check on the segmenter's minimum-area no-sidewalk decision in §4.3.3 |
| Overall accessibility | Already built, so free |

Perceived walkability is kept as the single perceptual item because walkability
is the construct Chapter 1 frames the study around.

**Dropped:** pedestrian safety, overall sidewalk condition, curb-ramp presence.

### This applies a rule already committed to
Task E12 fixes a decision rule in advance: if the scene-level and surface steps
together exceed half of median per-image time in the pilot, reduce the battery
and report the reduction. LIVS cut a six-item battery to three purely for
cognitive fatigue **on a task with no object-level component at all**. IMPRINT
asks these on top of a per-object obstruction decision and a severity rating,
and annotation fatigue is one of the three measured outcomes.

Applying the rule before collecting data is a stronger position than building
seven and being forced to cut after the pilot.

---

## 2. Current state

`POST /api/annotationSubmit` accepts exactly two scene-level fields:

```js
accessibilityRating: Number,   // integer 1-10, validated 422 outside range
pavementType: String,          // "smooth_paving" | "rough_paving"
                               // | "slippery_paving" | "no_sidewalk"
```

### A design fault to fix while you are here
`pavementType` mixes two different questions. `no_sidewalk` answers *is there a
sidewalk*; the other three answer *what is the surface like*. §4.2.1 treats
these as separate items, and it matters: sidewalk absence is a barrier record
that feeds the §4.3.3 segmenter cross-check, while surface type is a quality
rating. **Split them.**

### A second fault
`pavementType`'s options are **nominal** — smooth, rough and slippery are not
ordered, and slippery is a traction property rather than a condition. But §4.5
quality metrics applies **ordinal weighting** to scene-level ratings in
Krippendorff's alpha. An ordinal measure over a nominal scale is meaningless.
The replacement below is a genuine ordinal condition scale.

---

## 3. Target state

Replace both fields. There is no production data to migrate — the platform has
never been deployed — so this is a clean replacement rather than a migration.

```js
// annotationSubmit body, scene-level portion
sceneLevel: {
  sidewalkPresent: "yes" | "partial" | "no",
  surfaceCondition: 1 | 2 | 3 | 4 | null,   // null iff sidewalkPresent === "no"
  walkability: 1 | 2 | 3 | 4 | 5,
  overallAccessibility: 1 | 2 | 3 | 4 | 5,
},
schemaVersion: 2,
```

Validate server-side. These are closed choices in the UI and the endpoint is
reachable directly, so a direct POST must not be able to write anything else.
Follow the pattern already used in `complete-profile.js`.

### Item 1 — Sidewalk presence

> **Is there a sidewalk or designated pedestrian path in this image?**
> - Yes, along the walking route
> - Partly, it exists but is interrupted or incomplete
> - No sidewalk or pedestrian path

`partial` exists because intermittent sidewalks are the norm on many Metro
Manila streets and forcing a binary would lose that. For the §4.3.3 cross-check
against the segmenter's present-versus-absent decision, treat `partial` as
present and **report the three-way distribution separately** rather than
silently collapsing it.

### Item 2 — Surface condition

Shown only when item 1 is `yes` or `partial`. Ordinal, low to high severity.

> **How would you describe the condition of the walking surface?**
> 1. Even and well maintained
> 2. Mostly even, minor cracks or small defects
> 3. Noticeably uneven, cracked or patchy
> 4. Severely damaged, broken or unusable in places

This item carries the entire surface-barrier construct that Chapter 3 excludes
from the object taxonomy on the grounds that surface defects are continuous
properties of the walking surface rather than boundable objects. It is the only
place surface is recorded.

### Item 3 — Perceived walkability

> **Thinking about how you normally travel, how easy would this stretch be to walk?**
> 1. Very difficult
> 2. Difficult
> 3. Manageable
> 4. Easy
> 5. Very easy

The phrase **"how you normally travel"** is deliberate and must not be edited to
something generic. It mirrors §4.2.1's definition of an obstruction as something
the annotator "traveling as they normally do, could not pass comfortably and
safely". The whole perspectivist design of the study rests on asking about the
respondent rather than about a hypothetical average pedestrian. A reworded
"how walkable is this street" measures something else.

### Item 4 — Overall accessibility

> **Overall, how accessible is this sidewalk for people with mobility needs?**
> 1. Not accessible
> 2. Slightly accessible
> 3. Moderately accessible
> 4. Mostly accessible
> 5. Fully accessible

Currently a 1-10 slider. **Move it to 5 points.** Reasons: severity is already a
five-point scale and walkability is proposed as one, so a single scale length
across every ordinal item keeps the Krippendorff ordinal weighting consistent
and reduces what a contributor has to hold in mind. Ten-point scales also carry
well-known reliability problems relative to five to seven points. Nothing is
lost, because no data has been collected on the 1-10 version.

If you would rather keep 1-10, that is defensible, but then say so in §4.2.1
and do not mix scale lengths without a reason.

---

## 4. Instrumentation, required

Task E12's decision rule cannot be evaluated unless the steps are timed
separately. Log three durations per image:

```js
telemetry: {
  msObjectStep: Number,     // canvas: boxes, categories, obstruction, severity
  msSceneStep: Number,      // items 1, 3, 4
  msSurfaceStep: Number,    // item 2
  // ... existing fields
}
```

The rule, fixed in advance: **if `msSceneStep + msSurfaceStep` exceeds half of
median per-image time in the pilot, reduce the battery further and report the
reduction.** Build the timers now or the pilot cannot evaluate the rule and E12
fails its definition of done.

---

## 5. Acceptance criteria

- [ ] A submitted image writes all four fields under `sceneLevel`
- [ ] `surfaceCondition` is `null` exactly when `sidewalkPresent === "no"`, and the UI hides the question in that case
- [ ] A direct POST with an out-of-range or unrecognised value returns 422, matching the existing validation style
- [ ] `pavementType` and the 1-10 `accessibilityRating` are gone from the request body, the validator, and the database write
- [ ] `mergeUserAnnotations` in `annotationGet.js` restores all four answers on a resumed session, as it currently does for `userSliderValue` and `userPavementType`
- [ ] Three separate step timings appear in `telemetry_logs`
- [ ] The tutorial shows the same four items, since it renders the real component

---

## 6. Manuscript change this requires

§4.2.1 currently reads:

> "each image receives scene-level assessments of perceived walkability,
> pedestrian safety, overall sidewalk condition, surface condition, and overall
> accessibility, together with the presence or absence of a sidewalk and of curb
> ramps where expected"

It needs to name four items instead of seven, with one sentence of
justification on cognitive-load grounds citing the LIVS precedent and §4.4.3's
decision rule.

**This is a proposed change, not an applied one.** Do not edit any `.tex` file.
Rans reviews manuscript wording before it is written, and this goes to his
adviser alongside the other proposed changes.

---

## 7. If you have spare capacity

**Curb-ramp presence** is the best of the three dropped items to reinstate.
Cheap as yes / no / not applicable, directly accessibility-relevant, and
Mapillary supplies `construction--flat--curb-cut` detections on about 10 per
cent of images, which gives an external cross-check nothing else in the study
has. Add it only after the four above are working.

Do not reinstate pedestrian safety or overall sidewalk condition. Both overlap
heavily with walkability and overall accessibility, and neither is consumed by
any analysis in §4.5.
