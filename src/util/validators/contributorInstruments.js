// The NASA-TLX and the exit questionnaire are contributor instruments (thesis
// Chapter 4, "Periodic Questionnaires" and "Exit Questionnaire"). Annotators
// are never prompted and cannot submit either (decided 3 Oct 2026).
//
// The role passed in must come from the database, not session.user.role,
// because an admin can change it after sign-in. A missing role counts as a
// contributor, the same way isAnnotator is computed everywhere else.
export function takesContributorInstruments(role) {
  return role !== "annotator";
}

export const CONTRIBUTOR_ONLY_MESSAGE = "This questionnaire is for contributors only.";
