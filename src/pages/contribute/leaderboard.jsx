/**
 * Route for /contribute/leaderboard — the contributors' leaderboard (S32,
 * 17 Nov 2026). Signed-in contributors and admins: signed out goes to log
 * in, and an annotator goes back to the dashboard (the role read from the
 * database, since the login token keeps the one from sign-in).
 *
 * Signed out, the log in comes back here afterwards (18 Nov 2026, the
 * leaderboard announcement's link): `/login?next=/contribute/leaderboard`.
 */
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { isAnnotatorUser } from "@/util/userRole";
import { loginPathFor } from "@/util/loginReturn.mjs";
import Page from "@/ui/page";
import LeaderboardView from "@/features/contribute/leaderboard/LeaderboardView";
import { LEADERBOARD_COPY as COPY } from "@/features/contribute/leaderboard/leaderboardCopy";

export default function LeaderboardPage() {
  return (
    <Page title={COPY.pageTitle} description={COPY.pageDescription} contribute>
      <LeaderboardView />
    </Page>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session || !session.user?._id) {
    return { redirect: { destination: loginPathFor("/contribute/leaderboard"), permanent: false } };
  }
  if (await isAnnotatorUser(session)) {
    return { redirect: { destination: "/contribute", permanent: false } };
  }
  return { props: {} };
}
