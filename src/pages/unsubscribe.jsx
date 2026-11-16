import Page from "@/ui/page";
import UnsubscribeView from "@/features/email/UnsubscribeView";
import { UNSUBSCRIBE_COPY } from "@/features/email/unsubscribeCopy";
import { checkUnsubscribe } from "@/util/emailLinks.mjs";

/**
 * /unsubscribe?u=...&t=... (S29), opened from the stop link in a campaign
 * email. No sign-in. The signature is checked here, on the server, so the
 * secret never reaches the browser. The page itself is UnsubscribeView.
 */
export default function Unsubscribe(props) {
  return (
    <Page title={`${UNSUBSCRIBE_COPY.pageTitle} - Imprint`} description="Stop or restart emails from Imprint." contribute={false}>
      <UnsubscribeView {...props} />
    </Page>
  );
}

export async function getServerSideProps({ query }) {
  const u = typeof query.u === "string" ? query.u : null;
  const t = typeof query.t === "string" ? query.t : null;
  const valid = checkUnsubscribe(u, t, process.env.NEXTAUTH_SECRET);
  return { props: valid ? { valid: true, u, t } : { valid: false } };
}
