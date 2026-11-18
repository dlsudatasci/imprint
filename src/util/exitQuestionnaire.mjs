import { sitePath } from "./notifications.mjs";

/**
 * The exit questionnaire invitation on the site (S33, 17 Nov 2026). Plain
 * module, the database handed in.
 *
 * One fact decides both the dashboard's Exit Questionnaire button and the
 * bell message's link: the person was sent `exit-questionnaire` and has no
 * response in `exit_surveys`. Both go once they submit. A preview writes no
 * send, so it never brings the button, and its bell message links until that
 * admin answers.
 */
export const EXIT_CAMPAIGN_ID = "exit-questionnaire";

/** `{ sent, answered }` for one account. `userId` is the id as text, as both collections store it. */
export async function exitQuestionnaireState(db, userId) {
  const id = String(userId);
  const [send, response] = await Promise.all([
    db.collection("email_sends").findOne({ campaign: EXIT_CAMPAIGN_ID, userId: id, status: "sent" }, { projection: { _id: 1 } }),
    db.collection("exit_surveys").findOne({ userId: id }, { projection: { _id: 1 } }),
  ]);
  return { sent: !!send, answered: !!response };
}

/** Whether the dashboard shows the Exit Questionnaire button: sent it, and not answered. */
export async function exitQuestionnaireOpen(db, userId) {
  const { sent, answered } = await exitQuestionnaireState(db, userId);
  return sent && !answered;
}

const isInvitation = (a) => a?.tag === "message" && a.campaign === EXIT_CAMPAIGN_ID && sitePath(a.href) !== null;

/** Whether the feed holds an invitation whose link is still to be decided. */
export function hasLinkedInvitation(activities) {
  return Array.isArray(activities) && activities.some(isInvitation);
}

/** The feed with the invitation's link taken off, for someone who has answered. */
export function withoutInvitationLink(activities) {
  if (!Array.isArray(activities)) return [];
  return activities.map((a) => {
    if (!isInvitation(a)) return a;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
    const { href, ...rest } = a;
    return rest;
  });
}
