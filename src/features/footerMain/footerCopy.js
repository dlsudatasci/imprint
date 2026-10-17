/**
 * Every string the footer shows, so tests can check them (16 Oct 2026): no em
 * dashes and no semicolons in user-facing copy.
 *
 * The thank-you line and the invitation are the old footer's, brought back
 * (Rans, 16 Oct 2026: they made it feel human).
 *
 * Imprint's name, its tagline and the photo credit line were taken out of the
 * footer on 17 Oct 2026 (Rans). The photos are credited one by one on the
 * annotation screen and in the tutorial (PhotoCredit).
 */
export const RESEARCHER_EMAIL = "francis_bawa@dlsu.edu.ph";
export const REPOSITORY_URL = "https://github.com/dlsudatasci/imprint";
export const LAB_URL = "https://dlsucomet.github.io/";

export const FOOTER_COPY = Object.freeze({
  // The old footer's words, brought back (Rans, 16 Oct 2026)
  thanks: "Thank you for joining us in knowing our streets better.",
  invite: "Feel free to send us a message or view our repository.",
  emailLabel: "Email",
  sourceLabel: "GitHub",
  linksLabel: "Site pages",
  copyright: (year) => `© ${year} Imprint`,
  labLabel: "Human-X Interactions Lab",
});

/** The site's pages, in the order the footer lists them. */
export const STUDY_LINKS = Object.freeze([
  Object.freeze({ href: "/about", label: "About" }),
  Object.freeze({ href: "/demo", label: "Annotation guide" }),
  Object.freeze({ href: "/terms-of-use", label: "Informed Consent" }),
  Object.freeze({ href: "/privacy", label: "Privacy Policy" }),
]);
