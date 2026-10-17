import { SCENE_QUESTIONS } from "@/features/contribute/help/taskFacts";
import { formatDistance } from "@/util/milestones";

/**
 * Every string the contributor dashboard shows (17 Oct 2026,
 * IMPRINT_dashboard_audit.md), so tests can check them: no em dashes and no
 * semicolons in user-facing copy.
 *
 * What it shows is chapter_5.tex, Motivational Features: total contributions,
 * mean time per image, an active-day streak, the distance ladder with its
 * progress bar, recent sessions with thumbnails, an obstruction chart and the
 * color-coded mean accessibility answer. The audit kept every one of them
 * (the features are held constant across the field study, chapter_4.tex)
 * and fixed what each says. chapter_5 also lists rotating facts about
 * pedestrian accessibility. Those were removed (Rans, 17 Oct 2026), and the
 * sentence is to come out of chapter_5 (IMPRINT_dashboard_audit.md §7.2).
 */
export const DASHBOARD_COPY = Object.freeze({
  pageTitle: "Dashboard - Imprint",
  welcomeBack: "Welcome back,",
  welcome: "Welcome,",
  annotatorBadge: "Annotator",
  // The main button, one per onboarding state (unchanged order: tutorial, profile, annotate)
  startTutorial: "Start Tutorial",
  resumeTutorial: "Resume Tutorial",
  stopTutorial: "Stop Tutorial",
  replayTutorial: "Replay Tutorial",
  completeProfile: "Complete Profile to Start",
  annotate: "Let's Annotate!",
  resumeSession: "Resume Session",
  stopSession: "Stop Session",
  loading: "Loading...",
  stopDialog: Object.freeze({
    title: "Stop Session?",
    description: "Photos you already finished are saved. Your answers on the photo you are on now will be lost.",
    confirm: "Yes, Stop Session",
  }),
  recentTitle: "Recent sessions",
  noSessions: "Your finished sessions will show here.",
  // Shown in place of a figure or the session list when its request fails (17 Oct 2026)
  loadFailed: "This could not be loaded. Refresh the page to try again.",
  inProgress: "In progress",
  progress: (done, total) => `${done} of ${total} ${total === 1 ? "photo" : "photos"} done`,
  chartLabel: "Obstructions per photo",
  accessLabel: "Accessible to me",
  progressTitle: "Your progress",
  distanceLabel: "Sidewalk you've helped map",
  distanceValue: (meters) => formatDistance(meters),
  distanceNext: (left, place) => `${formatDistance(left)} more to match the length of ${place}.`,
  distanceDone: "You've passed every milestone. Thank you.",
  distanceStart: "Start",
  figures: Object.freeze({
    total: Object.freeze({ label: "Total contributions", unit: (n) => (n === 1 ? "photo annotated" : "photos annotated") }),
    streak: Object.freeze({ label: "Active streak", unit: (n) => (n === 1 ? "day" : "days"), caption: "in a row with at least one photo" }),
    time: Object.freeze({ label: "Time per photo", unit: "s", caption: "on average" }),
  }),
});

const ACCESS_ANSWERS = SCENE_QUESTIONS.find((q) => q.name === "Accessible to Me").answers;

/**
 * The answer word nearest a session's average "Accessible to Me" (1 Easily
 * accessible to 5 Not accessible), so "2.4" reads as "Mostly accessible".
 * The number alone read as a score where higher is better, and the old label
 * "Avg Score" did not say which question it averaged.
 */
export function accessWord(average) {
  const n = Number(average);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return ACCESS_ANSWERS[Math.round(n) - 1];
}

/** "Oct 17, 2026", in Philippine time */
export function sessionDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
}

/** Seconds per photo, whole, or null before any photo is done */
/** A landmark's name at the start of a label: "The Pasig River" (17 Oct 2026) */
export function labelStart(place) {
  return typeof place === "string" && place ? place[0].toUpperCase() + place.slice(1) : "";
}

export function secondsPerPhoto(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
