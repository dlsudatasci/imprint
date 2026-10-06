/**
 * The role a new account starts with, for both password sign-up
 * (/api/auth/register) and Google sign-up (/api/auth/choose-username).
 *
 * New accounts are contributors ("user"). Annotators are made by an admin
 * changing the role in the database.
 *
 * Local testing only (6 Oct 2026). With REGISTER_AS_ANNOTATOR=true in .env, new
 * accounts start as annotators, so the annotator flow can be tried without
 * editing each test account by hand. The setting is ignored in a production
 * build and against the study database ("imprint"), so it can never turn a
 * real participant into an annotator, even if it were copied there. Existing
 * accounts are never changed.
 */
export const DEFAULT_ROLE = "user";
export const ANNOTATOR_ROLE = "annotator";
export const STUDY_DATABASE = "imprint";

export function registerAsAnnotator(env = process.env) {
  return (
    env.NODE_ENV !== "production" &&
    env.MONGODB_DB !== STUDY_DATABASE &&
    env.REGISTER_AS_ANNOTATOR === "true"
  );
}

export function newAccountRole(env = process.env) {
  return registerAsAnnotator(env) ? ANNOTATOR_ROLE : DEFAULT_ROLE;
}
