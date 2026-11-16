/**
 * Every string the leaderboard page shows (S32, 17 Nov 2026), for Rans to
 * edit and for the tests to check: no em dashes and no semicolons in
 * user-facing copy.
 *
 * A hidden row's name ("Imprint Contributor #12") is made on the server:
 * HIDDEN_NAME_PREFIX in util/leaderboard.mjs.
 */
export const LEADERBOARD_COPY = Object.freeze({
  pageTitle: "Leaderboard - Imprint",
  pageDescription: "Imprint contributors ranked by the photos they have finished.",
  title: "Leaderboard",
  intro: "Contributors ranked by the photos they have finished.",
  // The viewer's own place, above the board
  yourPlace: (rank, photos) => `You: #${rank} with ${photos} ${photos === 1 ? "photo" : "photos"}`,
  noPhotosYet: "Finish a session to join the leaderboard.",
  // The card under the board, and its button (the dashboard's wording)
  improve: "Ready to improve your ranking?",
  annotate: "Let's Annotate!",
  nameSwitch: "Show my username on the leaderboard",
  nameSaveFailed: "Your choice could not be saved. Try again.",
  // The one-time question
  question: Object.freeze({
    title: "Show your username?",
    description: "Your place on the leaderboard can show your username, or a number instead. You can change this anytime.",
    show: "Show my username",
    hide: "Keep it hidden",
    close: "Close",
  }),
  // The board
  boardLabel: "Top 20 contributors",
  rank: (rank) => `#${rank}`,
  photos: (n) => `${n} ${n === 1 ? "photo" : "photos"}`,
  you: "You",
  yourRowLabel: "Your place",
  empty: "No one is on the leaderboard yet.",
  loadFailed: "This could not be loaded. Refresh the page to try again.",
});
