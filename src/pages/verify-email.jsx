import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import Page from "@/ui/page";
import { AuthCard, AuthScreen, Button } from "@/ui";
import { AUTH_COPY } from "@/features/auth/authCopy";
import { isRateLimited, readJson, rateLimitMessage } from "@/features/auth/authResponse";
import { LINK_EXPIRED, LINK_USED } from "@/util/validators/emailVerification.mjs";

const COPY = AUTH_COPY.verify;

/**
 * Opened by the link in "Confirm your email for IMPRINT" (S9):
 * /verify-email?token=...&email=...
 *
 * Opening the page changes nothing on its own. It posts the token to
 * /api/auth/verify-email once, so a mail scanner that only opens the link does
 * not use it up. Then it says what happened:
 *
 *   confirmed   and, when signed in on this browser, refreshes the sign-in so
 *               the dashboard and the navbar know at once
 *   expired, not valid
 *               why, with a way to send a new link (signed in) or to log in
 *               and send one (signed out)
 *   used        the address is already confirmed, nothing more to do
 */
export default function VerifyEmail() {
  const router = useRouter();
  const { status, update } = useSession();
  const [result, setResult] = useState({ phase: "checking", message: "" });
  const [resend, setResend] = useState({ busy: false, message: "", ok: false });
  const posted = useRef(false);
  const refreshed = useRef(false);

  useEffect(() => {
    if (!router.isReady || posted.current) return;
    posted.current = true;
    const { token, email } = router.query;
    if (typeof token !== "string" || typeof email !== "string" || !token || !email) {
      setResult({ phase: "failed", message: COPY.missing });
      return;
    }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok) setResult({ phase: "confirmed", message: data.message || COPY.confirmed });
        else if (data.code === LINK_USED) setResult({ phase: "used", message: data.message });
        else setResult({ phase: data.code === LINK_EXPIRED ? "expired" : "failed", message: data.message || COPY.missing });
      })
      .catch(() => setResult({ phase: "failed", message: COPY.offline }));
  }, [router.isReady, router.query]);

  // The sign-in token still says the address needs confirming. Ask for a
  // fresh one, which reads the database (the jwt callback).
  useEffect(() => {
    if (refreshed.current || status !== "authenticated") return;
    if (result.phase !== "confirmed" && result.phase !== "used") return;
    refreshed.current = true;
    update({ emailVerified: true });
  }, [result.phase, status, update]);

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

  const failed = result.phase === "failed" || result.phase === "expired";
  const done = result.phase === "confirmed" || result.phase === "used";
  const title =
    result.phase === "confirmed" ? COPY.confirmedTitle
      : result.phase === "used" ? COPY.usedTitle
        : failed ? COPY.failedTitle
          : COPY.title;

  return (
    <Page title="Confirm your email - Imprint" description="Confirm the email address of your Imprint account." contribute={false}>
      <AuthScreen>
        <AuthCard
          masthead={
            <Image src="/images/logo/imprint.png" alt="Imprint" width={56} height={56} className="w-14 h-14 object-contain" />
          }
          title={title}
        >
          {result.phase === "checking" && (
            <p role="status" className="text-sm text-muted font-medium text-center py-4">{COPY.checking}</p>
          )}

          {done && (
            <div className="w-full text-center space-y-4 py-2">
              <p role="status" className="text-sm font-medium p-3 bg-success-soft rounded-control text-success border border-success-border">
                {result.phase === "confirmed" ? COPY.confirmed : result.message}
              </p>
              <Link href={status === "authenticated" ? "/contribute" : "/login"} tabIndex={-1} className="flex pt-2">
                <Button fullWidth>{status === "authenticated" ? COPY.toDashboard : COPY.toLogin}</Button>
              </Link>
            </div>
          )}

          {failed && (
            <div className="w-full text-center space-y-4 py-2">
              <p role="alert" className="text-sm font-medium p-4 bg-danger-soft rounded-control text-danger border border-danger-border">
                {result.message}
              </p>
              {resend.message && (
                <p
                  role="status"
                  className={
                    resend.ok
                      ? "text-sm font-medium p-3 bg-success-soft rounded-control text-success border border-success-border"
                      : "text-sm font-medium p-3 bg-warning-soft rounded-control text-warning border border-warning-border"
                  }
                >
                  {resend.message}
                </p>
              )}
              {status === "authenticated" ? (
                <Button fullWidth onClick={sendNew} disabled={resend.busy}>
                  {resend.busy ? COPY.resending : COPY.resend}
                </Button>
              ) : (
                <Link href="/login" tabIndex={-1} className="flex pt-2">
                  <Button fullWidth>{COPY.loginToResend}</Button>
                </Link>
              )}
            </div>
          )}
        </AuthCard>
      </AuthScreen>
    </Page>
  );
}
