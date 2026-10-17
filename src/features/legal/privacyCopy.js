/**
 * The Privacy Policy's text (16 Oct 2026), kept as data so tests can check it:
 * no em dashes and no semicolons, and every question on the profile form is
 * named (privacyCopy.test.js, against PROFILE_QUESTIONS).
 *
 * Rewritten because the old policy did not match what Imprint collects. It
 * listed "city of residence", "usage of mobility aids" and "frequency of
 * commuting in a public utility vehicle", none of which the profile form asks,
 * and left out gender, disability, temporary conditions, education,
 * occupation, accessibility familiarity, annotation experience, walking
 * frequency, the questionnaires, the activity log and the device details.
 * Its retention section said the period was "being confirmed".
 *
 * Where each part comes from:
 * - Account: register.js (username, email, bcrypt hash), choose-username.js
 *   (Google's email, name and picture link are stored), consentAgreedAt and
 *   ageConfirmedAt on both.
 * - Profile: profileFields.js (PROFILE_QUESTIONS), the server's allowlists.
 * - Contributions and activity: appendix_C.tex, Confidentiality and Data
 *   Handling ("your annotations, the interface actions you take, the time you
 *   spend, and your questionnaire responses"), plus the device class, browser
 *   family and screen size recorded per image since 11 Oct 2026
 *   (pipeline_methodology.md §7u). The consent form's own list does not name
 *   the device details yet: that change waits on the ethics board (§7u). If
 *   that telemetry is ever removed, remove its line here.
 * - Protection, retention, deletion and the dataset: appendix_C.tex, word for
 *   word where it can be. The retention line is the consent form's, which
 *   answers the old TODO. If the ethics approval names a date, add it.
 * - Cookies and storage: [...nextauth].js (a day, or 30 days with Remember
 *   me, and Google sign-ins always 30), sessionCache.js and the landing
 *   page's intro timestamp. Imprint has no analytics or advertising scripts.
 * - Other services: Google sign-in, and the map tiles from CARTO.
 *
 * Nothing here names the study's hypotheses or the reference images.
 */
export const PRIVACY_COPY = Object.freeze({
  title: "Privacy Policy",
  intro:
    "This policy explains how the Human-X Interactions Lab and its student researchers collect, use and protect the data you provide when you visit and use Imprint.",
  introConsentLead: "For what taking part involves, see the",
  introConsentLink: "Informed Consent Form",
  sections: Object.freeze([
    Object.freeze({
      title: "What Imprint collects",
      items: Object.freeze([
        "Your account: your username, your email address, and the password you set, which is stored only as a secure hash. If you sign in with Google, Google shares your email address, your name and a link to your profile picture, and Imprint keeps them with your account.",
        "Your profile: the cities you often walk in, your age group, your gender, whether you have a mobility impairment or disability, any temporary condition that affects how you walk, your highest level of education, your occupation, how familiar you are with accessibility issues, whether you have done image or data annotation before, and how often you commute and walk.",
        "Your contributions: the boxes, categories and answers you give for each photo, and your answers to the workload questionnaire and the exit questionnaire.",
        "How you use the annotation screen: the actions you take, the time each step takes, and the type of device, browser and screen size you use.",
        "That you agreed to the Informed Consent Form and confirmed you are 18 or older, and when.",
      ]),
    }),
    Object.freeze({
      title: "Why Imprint collects it",
      items: Object.freeze([
        "To study how people judge what blocks a sidewalk, and to improve a model that learns from those judgments.",
        "To understand the background of the people who take part, and how it relates to the answers they give.",
        "To run the platform: to sign you in, keep your place in a session, and send a password reset link when you ask for one.",
      ]),
    }),
    Object.freeze({
      title: "How it is protected",
      items: Object.freeze([
        "You are identified only by a pseudonymous identifier. No personally identifying information is attached to your annotations or activity logs.",
        "Your profile answers are stored separately from your annotations and activity, and are linked to them only through that identifier.",
        "All data is stored on university-managed infrastructure.",
        "Results are reported in aggregate in a thesis and any resulting publications. No individual contributor will be identifiable in any output.",
        "Your personal information is never leased, sold or given to any third party. It is used only for this research.",
        "The annotations you produce may form part of a research dataset used in future accessibility research, in de-identified form.",
      ]),
    }),
    Object.freeze({
      title: "How long it is kept",
      paragraphs: Object.freeze([
        "Your data is kept only for the duration of the study and the analysis that follows it.",
      ]),
    }),
    Object.freeze({
      title: "Your choices",
      items: Object.freeze([
        "You can stop taking part at any time, without telling anyone and without any penalty.",
        "You can ask for your data to be deleted at any time. It will be removed unless it has already been irreversibly aggregated for analysis.",
      ]),
      contact: "To ask for deletion, or with any question about your data, email",
    }),
    Object.freeze({
      title: "Cookies and browser storage",
      items: Object.freeze([
        "A sign-in cookie keeps you signed in for a day, or for 30 days if you choose Remember me or sign in with Google.",
        "Your browser keeps your place in a session, so you can pick up where you stopped, and the time you last saw the landing page's opening animation, so it is not shown again for a day.",
        "Imprint uses no advertising or analytics cookies.",
      ]),
    }),
    Object.freeze({
      title: "Other services",
      items: Object.freeze([
        "If you sign in with Google, Google handles that sign-in under its own privacy policy.",
        "The map on the landing page loads its images from CARTO, which receives your browser's request for them like any website would.",
      ]),
    }),
  ]),
});
