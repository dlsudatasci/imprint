import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { getServerSession } from "next-auth/next";
import { ObjectId } from "mongodb";
import Image from "next/image";
import Link from "next/link";
import Page from "@/ui/page";
import { AuthCard, AuthScreen, Button } from "@/ui";
import { AUTH_COPY } from "@/features/auth/authCopy";
import { isRateLimited, readJson, rateLimitMessage } from "@/features/auth/authResponse";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { connectToDatabase } from "@/util/mongodb";
import { needsEmailVerification } from "@/util/validators/emailVerification.mjs";

const COPY = AUTH_COPY.checkEmail;

/**
 * "Check your inbox" (S9), where a new password account lands after signing
 * up, and where the dashboard and the annotate page send a contributor whose
 * email address is not confirmed yet. It names the address, sends a new link
 * (/api/auth/resend-verification, at most one per five minutes), and offers
 * the dashboard: the tutorial, the profile and the guide stay open while the
 * person waits. Only starting a session needs the confirmed address.
 *
 * Whether the address is confirmed is read from the database on every load, so
 * a link opened on another device shows here as confirmed, and the sign-in is
 * refreshed to match. Signed out goes to /login. Annotators and admins are
 * never held back, so they go straight to the dashboard.
 */
export default function CheckEmail({ email = null, confirmed = false }) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [resend, setResend] = useState({ busy: false, message: "", ok: false });
  const refreshed = useRef(false);
  const notSent = router.query.unsent === "1";

  useEffect(() => {
    if (!confirmed || refreshed.current || session?.user?.needsEmailVerification !== true) return;
    refreshed.current = true;
    update({ emailVerified: true });
  }, [confirmed, session, update]);

  const sendNew = async () => {
    setResend({ busy: true, message: "", ok: false });
    try {
      const r = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await readJson(r);
      // A 429 is the five-minute wait (the app's message) or the request limit (S8)
      const message = isRateLimited(r) ? rateLimitMessage(data) : data.message || COPY.offline;
      setResend({ busy: false, message, ok: r.ok });
    } catch {
      setResend({ busy: false, message: COPY.offline, ok: false });
    }
  };

  return (
    <Page title="Check your inbox - Imprint" description="Confirm the email address of your Imprint account." contribute={false}>
      <AuthScreen>
        <AuthCard
          masthead={
            <Image src="/images/logo/imprint.png" alt="Imprint" width={56} height={56} className="w-14 h-14 object-contain" />
          }
          title={confirmed ? COPY.confirmedTitle : COPY.title}
        >
          {confirmed ? (
            <div className="w-full text-center space-y-4 py-2">
              <p role="status" className="text-sm font-medium p-3 bg-success-soft rounded-control text-success border border-success-border">
                {COPY.confirmed}
              </p>
              <Link href="/contribute" tabIndex={-1} className="flex pt-2">
                <Button fullWidth>{COPY.toDashboard}</Button>
              </Link>
            </div>
          ) : (
            <div className="w-full space-y-4">
              <p className="text-sm text-body leading-relaxed text-center">
                {email ? COPY.sentTo(email) : COPY.sentToYou}
              </p>
              {notSent && !resend.message && (
                <p role="alert" className="text-sm font-medium p-3 bg-warning-soft rounded-control text-warning border border-warning-border text-center">
                  {COPY.notSent}
                </p>
              )}
              <p className="text-sm text-muted leading-relaxed text-center">{COPY.linkLife}</p>
              {resend.message && (
                <p
                  role="status"
                  className={
                    resend.ok
                      ? "text-sm font-medium p-3 bg-success-soft rounded-control text-success border border-success-border text-center"
                      : "text-sm font-medium p-3 bg-warning-soft rounded-control text-warning border border-warning-border text-center"
                  }
                >
                  {resend.message}
                </p>
              )}
              <Button fullWidth onClick={sendNew} disabled={resend.busy}>
                {resend.busy ? COPY.resending : COPY.resend}
              </Button>
              <p className="text-sm text-muted leading-relaxed text-center pt-2">{COPY.meanwhile}</p>
              <div className="flex flex-col gap-3">
                <Link href="/contribute" tabIndex={-1} className="flex">
                  <Button variant="neutral" fullWidth>{COPY.toDashboard}</Button>
                </Link>
                <Link href="/contribute/help" tabIndex={-1} className="flex">
                  <Button variant="neutral" fullWidth>{COPY.guide}</Button>
                </Link>
              </div>
            </div>
          )}
        </AuthCard>
      </AuthScreen>
    </Page>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session?.user) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  // A Google sign-in without a username has no account row yet. Google
  // accounts are created confirmed, so the dashboard's onboarding is next.
  if (!session.user._id || !ObjectId.isValid(session.user._id)) {
    return { redirect: { destination: "/contribute", permanent: false } };
  }

  try {
    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(session.user._id) },
      { projection: { email: 1, role: 1, emailVerifiedAt: 1 } }
    );
    if (!user) return { redirect: { destination: "/login", permanent: false } };
    if (user.emailVerifiedAt) return { props: { email: user.email ?? null, confirmed: true } };
    if (!needsEmailVerification(user)) return { redirect: { destination: "/contribute", permanent: false } };
    return { props: { email: user.email ?? null, confirmed: false } };
  } catch (error) {
    // The page still works from the sign-in: the resend button reads the
    // database itself
    console.error("check-email: could not read the account", error);
    return { props: { email: session.user.email ?? null, confirmed: false } };
  }
}
