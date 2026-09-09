# IMPRINT: what exists, what the manuscript requires, what to build

**Written 9 September 2026** by reading the codebase against `chapter_4.tex` and
`chapter_5.tex`. Every "currently" statement below was verified against the
source, not inferred.

Read section 1 before doing anything. It changes what the platform is for.

---

## 1. The finding that matters most

**IMPRINT does not currently record whether an object obstructs anything.**

`POST /api/annotationSubmit` accepts exactly this:

| Field | Type | What it is |
|---|---|---|
| `imageID` | number | which image |
| `accessibilityRating` | int 1-10 | one scene-level slider |
| `pavementType` | enum(4) | `smooth_paving` / `rough_paving` / `slippery_paving` / `no_sidewalk` |
| `selectedObjectsID` | array | model suggestions the user ruled on |
| `newObjects` | array | boxes the user drew |
| `telemetry` | object | timing |

Boxes carry a `label` (the category) and nothing else. The string `obstruction`
appears in `src/features/home/ActionSection.jsx`, `about/index.jsx` and
`contribute/help/index.jsx` — all marketing and help copy — and in **no schema,
API, or database write anywhere in the codebase**.

Why this is the headline: §4.3.4 defines the obstruction classifier's target as
"a calibrated obstruction probability, thresholded into a binary obstruction /
non-obstruction decision", trained on one row per judgment per object. The
platform is built to collect the *features* of that model and not its *label*.
Deploying as-is would produce eight weeks of data that cannot train the model
the study is about.

Everything else in this document is smaller than this.

---

## 2. What exists today, verified

### Working
- Registration, login, Google OAuth, password reset (`src/pages/api/auth/*`)
- Demographic profile gate before annotating (`complete-profile.js`)
- Server-side sessions of 5/10/20/40 images, resumable across devices
- Batch assignment biased toward the contributor's frequently-walked cities
- Annotation canvas with model-suggested boxes, accept/reject/redraw
- One row per (image, user), enforced by a unique index
- Pending-until-complete accounting so abandoned sessions do not inflate totals
- Telemetry to `telemetry_logs` (open schema, never throws)
- Tutorial that reuses the real component with network calls intercepted
- Dashboard, public stats, streaks
- `/api/health` pinging Mongo
- `scripts/ensure-indexes.mjs`
- `users.role` field, defaulting to `"user"` — **the hook for annotator accounts already exists**

### Collections in use
`users`, `sessions`, `annotations`, `Image`, `telemetry_logs`

---

## 3. Gap table

Ordered by whether the study fails without it.

### BLOCKING — the study cannot produce its results without these

| # | Gap | Manuscript | Where |
|---|---|---|---|
| B1 | **No obstruction judgment per object** | §4.2.1, §4.3.4 | `annotationSubmit.js`, annotation tool |
| B2 | **No severity rating** (5-point, per obstruction) | §4.2.1 | same |
| B3 | **No annotator role or annotator mode** | §4.2.1, task D4 | `users.role`, new pages |
| B4 | **No reference-image handling** — no flag, no separate storage of annotator ground truth, no 1-in-8 placement | §4.5.2, task E1 | `Image` schema, `annotationGet.js` |
| B5 | **No served model version per annotation** — §4.5.3 makes this a covariate; without it the quality and fatigue models cannot be fitted as specified | §4.5.3, task E2 | `annotations` schema |
| B6 | **Scene-level battery is 2 items, manuscript specifies 7** | §4.2.1 | annotation form |
| B7 | **No stored predictions on image records** — boxes exist, but no masks, no on-sidewalk flag, no confidence, no proposed judgment | §4.4.1, §5.3 | `Image` schema |

### REQUIRED — committed to in the manuscript, study is weaker without them

| # | Gap | Manuscript |
|---|---|---|
| R1 | Demographics incomplete: missing educational attainment, occupation, walking frequency (distinct from commute), familiarity with pedestrian accessibility, prior annotation/AI experience | §4.5.5 |
| R2 | No NASA-TLX delivery (sessions 1, 3, then every 5th; dismissal logged as missing data) | §4.5.6, task E4 |
| R3 | No exit questionnaire | §4.5.6, task E5 |
| R4 | No tau thresholding in the render path | §4.4.3, task E3 |
| R5 | No deployment-pool membership or reserve extension | §4.5.2, task E13 |
| R6 | Contributor can be re-served an image they already completed | task E15 |
| R7 | Custom-category objects not excluded from the retraining feed | task E16 |
| R8 | Telemetry incomplete against §5.8 — see section 6 |
| R9 | No data export command | task E9 |
| R10 | No researcher admin dashboard | task E8 |

### KNOWN AND ACCEPTED (from your own DEPLOYMENT.md)
No HTTPS yet, no CSP, no rate limiting on `/api/auth/*`, sessions survive a
password reset, no backups, `telemetry_logs` grows unbounded.

---

## 4. Annotator accounts — your specific question

You asked how annotators get accounts whose output becomes your ground-truth
dataset. Here is the design.

### Why not a separate app
§4.3.4 and the 20 August fix 3 require the annotator dataset and the contributor
dataset to be **one dataset**: every row pairs the frozen pipeline's description
of an object with one person's decision and that person's demographic profile.
Two systems would produce two schemas and break that. Task A7 settled this:
annotate in IMPRINT itself, in an annotator mode.

### Schema

```js
// users
{
  role: "user" | "annotator" | "admin",   // field already exists, default "user"
  annotatorPass: 1 | 2 | null,            // two-pass split, see below
  annotatorActive: Boolean,
}
```

```js
// annotations  — add these
{
  source: "contributor" | "annotator",   // which dataset this row belongs to
  servedModelVersion: String | null,      // null for annotators, no model served
  pass: 1 | 2 | null,
}
```

### The two-pass split
Proposed 8 September, not yet in the manuscript (§4.2.1 change, pending the
adviser meeting).

- **Pass 1 — objective.** Boxes and category. No demographic diversity needed,
  because box position and object class have a correct answer.
  **Largely satisfied by the ATLAS-3 dataset**, 1,400 pedestrian-viewpoint
  images already labelled, so this pass may not need running at all.
- **Pass 2 — subjective.** Obstruction judgment, severity, scene-level. Needs
  annotators with diverse pedestrian profiles, because §3.2 argues obstruction
  is person-dependent. This is the pass that trains the classifier.

An annotator in Pass 2 sees pre-drawn boxes and answers only the subjective
questions. Roughly 45 seconds per image against about 2 minutes for Pass 1,
which is what makes a 5-hour ask recruitable where a 15-hour one is not.

### Rules annotator mode must enforce
1. Annotators never receive model suggestions. Pre-filled boxes come from the
   stored candidate layer or from Pass 1, never from a model. There is no model
   yet when they work, and anchoring them on one would contaminate the ground
   truth the model is later measured against.
2. Annotator rows never enter the contributor-facing public stats.
3. Annotators complete the **same** demographic profile as contributors. §4.2.1
   is explicit that this is a model input, not record-keeping.
4. Every annotator annotates the whole 150-image reference set. Their judgments
   on it are the ground truth contributor quality is scored against.
5. Reference-set annotator judgments are stored in a field that **cannot be
   confused with model predictions** during analysis (task E1).

### Creating the accounts
No public signup for annotators. Add an admin-only route or a CLI script that
promotes an existing account by email:

```
scripts/set-role.mjs --email someone@example.com --role annotator --pass 2
```

A script is safer than a UI here: it cannot be reached by a stranger, and it
leaves a record in your shell history of exactly who was promoted and when.

---

## 5. Build order for the website

Do these in order. Each is independently testable and the later ones depend on
the earlier ones.

### Step 1 — Object schema: obstruction and severity  `[B1, B2]`
The single most important change.

Extend the box object written by the annotation tool:

```js
{
  id, x, y, width, height,          // existing
  label,                            // existing: taxonomy category
  obstructs: Boolean,               // NEW. The classifier's training target
  severity: 1|2|3|4|5 | null,       // NEW. Only when obstructs === true
  source: "model" | "annotator" | "contributor_created",
  modelConfidence: Number | null,   // confidence of the suggestion responded to
}
```

**Wording matters.** §4.2.1 defines an obstruction as an object that "reduces
the walking space to the point where the annotator, **traveling as they normally
do**, could not pass it comfortably and safely." Ask it in the second person
about *them*, not about a generic pedestrian. That phrasing is the whole
perspectivist design.

**Two decisions, not one.** §5.5 (20 August fix 4) splits identifying a
candidate object from judging it. A contributor boxes taxonomy objects on or
beside the walking space whether or not they obstruct, then decides separately.
Off-sidewalk objects are the negative examples the classifier needs.

**Done when:** submitting an image writes `obstructs` for every object and
`severity` for every object where `obstructs` is true, and a created box carries
the contributor's own judgment rather than being assumed positive.

### Step 2 — Scene-level battery  `[B6]`
Currently 2 items. §4.2.1 specifies 7:
perceived walkability, pedestrian safety, overall sidewalk condition, surface
condition, overall accessibility, sidewalk presence, curb-ramp presence.

Keep `pavementType` as the surface-condition item. Replace the 1-10
`accessibilityRating` with the named scales.

**Watch the load.** Task E12 fixes a decision rule in advance: if the
scene-level and surface steps together exceed half of median per-image time in
the pilot, reduce the battery before deployment and report the reduction. The
LIVS study cut a six-item battery to three purely for cognitive fatigue, on a
task with no object-level component at all. You are asking seven on top of a
per-object decision and a severity rating, and annotation fatigue is one of your
three measured outcomes.

**Build the instrumentation now** so the pilot can evaluate the rule: time the
object step, the scene-level step and the surface step separately.

### Step 3 — Annotator role and annotator mode  `[B3]`
Per section 4. Includes `scripts/set-role.mjs`.

**Done when:** an annotator account completes a full image and the record lands
in `annotations` with `source: "annotator"`, in the same shape a contributor row
takes.

### Step 4 — Image record: predictions and pool state  `[B7, B4, R5]`

```js
// Image
{
  imageID, city,                        // existing
  annotationList,                       // existing: candidate boxes

  isReference: Boolean,                 // NEW
  referenceGroundTruth: [ ... ],        // NEW, annotator judgments, SEPARATE
                                        //   field from predictions (task E1)
  poolStatus: "model_dev" | "served" | "reserve",   // NEW (task E13)

  predictions: {                        // NEW (§5.3, task E2)
    modelVersion: String,
    boxes: [{ id, bbox, label, confidence, onSidewalk, proposedObstructs }],
    maskUri: String | null,
    computedAt: Date,
  },
}
```

`referenceGroundTruth` and `predictions` must be separate fields. §4.5.4 scores
contributors against annotator ground truth; if the two ever merge in a document
the comparison is silently invalid and nothing will tell you.

### Step 5 — Reference image placement  `[B4]`
1 in 8, uniform, applied **after** city-based selection, and completely
indistinguishable in the UI.

Uniform matters: non-uniform placement would make image difficulty covary with
position in session, which would contaminate the fatigue slopes that are one of
your three outcomes.

**Done when:** a 24-image session contains ~3 reference images, identifiable in
the database and nowhere in the interface.

### Step 6 — Served model version per annotation  `[B5]`
Store `servedModelVersion` on every contributor annotation. §4.5.3 makes it a
covariate in the quality and fatigue models. Without it those models cannot be
fitted as specified and that part of the study is lost.

### Step 7 — Assignment rules  `[R5, R6]`
- Draw only from `poolStatus: "served"`
- Never re-serve an image the contributor has **completed**, while still
  resuming genuinely interrupted ones (task E15)
- Promote a reserve block without a redeploy, logging date and size (task E13)

### Step 8 — Demographics completion  `[R1]`
Add: educational attainment, occupation, walking frequency (distinct from
commute frequency), familiarity with pedestrian accessibility, prior experience
with annotation platforms or AI-assisted systems.

The four the classifier consumes are mobility disability, age group, commute
frequency and familiarity with pedestrian accessibility. **Familiarity is
currently not collected at all and is a model input.**

### Step 9 — Telemetry completeness  `[R8]`
Verify each of these is actually written, by writing the analysis query first
and checking it returns data:

- wall-clock render to submission, per image
- image position within session
- session position within contributor history, and interval since previous session
- geometry changes at 3px tolerance, logged separately from label changes
- confidence of the suggestion each judgment responded to
- cumulative sessions, cumulative annotations, distinct active days
- session abandonment with images completed vs images selected
- per-step timings from step 2

### Step 10 — NASA-TLX  `[R2]`
Raw TLX on completion of session 1, session 3, then every 5th. Dismissible
without penalty, and **dismissal logged as missing data**, distinctly from
never having been presented.

### Step 11 — Exit questionnaire  `[R3]`
At the close of deployment, to **all** enrolled contributors including those who
stopped early. §4.5.4 makes early stoppers the most informative group for the
fatigue question, so they must not be excluded.

### Step 12 — Tau thresholding  `[R4]`
Only predictions above tau render as dashed candidate boxes. Changing tau in
config must change what the canvas shows without reprocessing.

### Step 13 — Custom-category exclusion  `[R7]`
Free-text categories have no valid one-hot encoding over the eighteen classes.
Mark them in the export, skip them in retraining, report how many.

### Step 14 — Data export  `[R9]`
One command dumping annotations, telemetry, questionnaires and demographics into
analysis-ready files, with the pseudonymous identifier as the **only** link
between demographic and behavioural data (§4.5.5).

**Done when:** the export runs and you have loaded it and fitted one throwaway
mixed-effects model on synthetic data. Do not consider this done until you have
actually done that.

### Step 15 — Admin dashboard  `[R10]`
Not in the manuscript, but you will be lost without it during deployment.
Minimum: contributor count and demographic composition against targets,
cumulative annotations, judgments since the last retraining cycle, image
coverage across the pool, reference-image completion per contributor.

### Step 16 — Quality-control instrumentation
Three need platform support: accurate per-image timing (step 9), stored
coordinates (already present), and enforced email verification.

**Write the flagging thresholds down and date them before deployment opens.**
Deciding them after seeing the data is exactly the researcher degree of freedom
a panel will ask about.

---

## 6. Then, and only then, deployment

The VM is provisioned by `deploy/vm-setup.sh` (written 9 September). Do not run
this until the website work above is done, or you will be redeploying constantly.

1. **Build locally first.** `npm run build:ui && npm run build`. `deploy.sh`
   ships a local build, so a broken build should fail on your laptop.
2. **Provision.** `./deploy/vm-setup.sh user@vm-host` — installs Node 22, nginx,
   MongoDB 8 bound to `127.0.0.1`, creates the `imprint` service user and
   `/srv/imprint`, installs the systemd unit and nginx site, writes a `.env`
   skeleton with `NEXTAUTH_SECRET` generated.
3. **Fill `/srv/imprint/.env`.** `NEXTAUTH_URL` must be exactly what a
   participant types including the port, no trailing slash. Gmail needs an app
   password, not the account password.
4. **Google OAuth redirect URI** must be exactly `<NEXTAUTH_URL>/api/auth/callback/google`.
5. **Deploy.** `./deploy/deploy.sh user@vm-host`
6. **Indexes.** `npm run db:indexes` against production, once, before real traffic.
7. **Verify.** `curl -i http://host:port/api/health` → `{"status":"ok","database":"connected"}`
8. **Backups.** `mongodump` on a schedule, and **restore one into a scratch
   database to prove it works**. Losing the database in week five ends the thesis.
9. **HTTPS** before **21 September**, when Pass 2 annotators (recruited
   strangers) first use it. Not 28 September. They submit consent and disability
   status exactly as contributors do.

### Environment facts, confirmed 9 September
- Ubuntu 24.04, 4 vCPU, 16 GB RAM, 29 GB free, 8 GB swap
- **No GPU.** Train on Colab or Kaggle, serve from the VM
- Reachable from the public internet on a **custom external port** forwarded to
  the VM's port 80
- External 443 on that host is the **Proxmox hypervisor UI**, not you. Standard
  ports are not available, so free certificates need either IT mapping them or a
  Cloudflare Tunnel
- MongoDB must stay local: Appendix C promises university-managed infrastructure

---

## 7. Things to check that are not code

- **Faces and plates in ATLAS-3.** The protocol claims no PII *because Mapillary
  blurs before publication*. ATLAS-3 is student-captured video. Run a face
  detector over all 1,400 and count. If any are unblurred, blur before an
  annotator sees them and tell the REO.
- **REO notification.** The approved protocol names Mapillary as the imagery
  source. You now have a second source and a third-party dataset. Also the
  deployment is 6 weeks, not the 8 the protocol states, and the consent form in
  `appendix_C.tex:45` still says eight.
- **"Eight weeks" is wrong in six places**: `appendix_C.tex:45`,
  `chapter_4.tex:235,265,424`, `chapter_1.tex:99`, and the ethics form.

---

## 8. Suggested order if time is short

If everything cannot be built, this is the order that preserves the most:

1. **Steps 1, 3, 4, 6** — obstruction judgment, annotator mode, image schema,
   model version. Without these there is no study.
2. **Steps 5, 7** — reference placement and assignment rules. Without these
   there is no contributor-quality measure.
3. **Steps 2, 8, 9** — full scene battery, demographics, telemetry. Without
   these, specific analyses drop out but the primary outcome survives.
4. **Steps 10, 11** — TLX and exit questionnaire. Losing these costs H03 and the
   qualitative analysis.
5. **Steps 12 to 16** — everything else.

Step 1 alone is the difference between a study and eight weeks of unusable data.
