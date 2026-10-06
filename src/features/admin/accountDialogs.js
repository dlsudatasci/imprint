/**
 * Wording for the admin Accounts tab dialogs (added 1 Oct 2026). Kept apart from
 * the component so the text and the delete summary can be tested without a browser.
 */
import { accountLabel } from "@/util/validators/accountAdmin";

/** What each count in a deletion preview stands for, in the order shown. */
const DELETION_ROWS = [
  ["annotations", "annotation", "annotations"],
  ["sessions", "session", "sessions"],
  ["telemetry_logs", "activity log entry", "activity log entries"],
  ["nasa_tlx", "NASA-TLX response", "NASA-TLX responses"],
  ["exit_surveys", "exit survey response", "exit survey responses"],
  ["referenceImages", "reference image answer key entry", "reference image answer key entries"],
];

/** Rows for the delete dialog, e.g. [{ key: "annotations", text: "12 annotations" }]. Zero counts are kept. */
export function deletionSummary(counts = {}) {
  return DELETION_ROWS.map(([key, one, many]) => {
    const n = Number(counts[key]) || 0;
    return { key, n, text: `${n.toLocaleString("en-US")} ${n === 1 ? one : many}` };
  });
}

/** Title, description and button label for switching an account's role. */
export function roleChangeCopy(account) {
  const name = accountLabel(account);
  const toAnnotator = account.role !== "annotator";
  return {
    nextRole: toAnnotator ? "annotator" : "user",
    title: toAnnotator ? `Make ${name} an annotator?` : `Make ${name} a contributor?`,
    description: toAnnotator
      ? "Their next session will draw from the annotator pool: model-development and reference images, with no suggested boxes on reference images. Annotations they already submitted stay as they are."
      : "Their next session will draw from the contributor pool: reference and deployment images. Annotations they already submitted stay as they are.",
    confirmLabel: toAnnotator ? "Make annotator" : "Make contributor",
  };
}

/** Title and description for deleting an account. */
export function deleteCopy(account) {
  const name = accountLabel(account);
  return {
    title: `Delete ${name}?`,
    description:
      "This permanently removes the account and everything it recorded. Image annotation counts and the images themselves are left as they are. This cannot be undone.",
    confirmLabel: "Delete account",
    typeLabel: `Type ${name} to confirm`,
    expected: name,
  };
}
