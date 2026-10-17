import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";

import Page from "@/ui/page";
import { AuthCard, AuthScreen, Button, Input, Checkbox } from "@/ui";
import GoogleMark from "@/features/auth/GoogleMark";
import { AUTH_COPY } from "@/features/auth/authCopy";

const COPY = AUTH_COPY.register;

/**
 * Sign-up for a password account.
 *
 * Registering signs the new contributor in and sends them to the dashboard.
 * Demographic questions come later at /complete-profile, so this screen asks
 * for as little as possible.
 *
 * "Sign up with Google" goes straight to Google, like the login page's button.
 * It does not need the consent boxes below it: a new Google account is only
 * created at /choose-username, which asks for consent and the age confirmation
 * itself, and the server refuses to create it without them. Until 6 Oct 2026
 * the button waited for these boxes and reported the missing tick under the
 * Submit button, off screen, so clicking it seemed to do nothing.
 *
 * 16 Oct 2026 (IMPRINT_public_redesign.md): wording from authCopy.js ("Create
 * account" for Submit, "Continue with Google"), a hint under the username and
 * the password with the rules the server applies (USERNAME_PATTERN,
 * MIN_PASSWORD_LENGTH), autocomplete so password managers offer a new
 * password, and the inline Google mark in place of an image from svgrepo.com.
 *
 * Field errors use the browser's own validation bubbles rather than messages
 * rendered on the page. That is why each input clears its custom message as
 * soon as it is typed in — a leftover bubble would otherwise block the form
 * from being resubmitted after the problem was fixed.
 */
export default function Register() {
  const [loadingForm, setLoading] = useState(false);
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) {
      router.push("/contribute");
    }
  }, [session, loading, router]);

  const [serverError, setServerError] = useState("");

  function handleGoogleSignIn() {
    signIn("google", { callbackUrl: `${window.location.origin}/contribute` });
  }


  async function onSubmit(e) {
    e.preventDefault();
    setServerError("");
    setLoading(true);

    const username = e.currentTarget.username.value;
    const email = e.currentTarget.email.value;
    const password = e.currentTarget.password.value;
    const confirmPassword = e.currentTarget.confirmPassword.value;
    const consentAgreed = e.currentTarget["consent-agree"].checked;
    const ageConfirmed = e.currentTarget["consent-age"].checked;

    const body = {
      username,
      email,
      password,
      confirmPassword,
      consentAgreed,
      ageConfirmed,
    };

    const confirmInput = e.currentTarget.confirmPassword;
    const emailInput = e.currentTarget.email;
    const usernameInput = e.currentTarget.username;
    const passwordInput = e.currentTarget.password;

    if (password !== confirmPassword) {
      confirmInput.setCustomValidity(COPY.mismatch);
      confirmInput.reportValidity();
      setLoading(false);
      return;
    } else {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (res.status === 201) {
          signIn("credentials", {
            username,
            password,
            callbackUrl: `${window.location.origin}/contribute`,
          });

        // Route the server's message to whichever field it's about, by keyword.
        // Brittle — it depends on the API's wording — but it puts the error on
        // the offending input instead of in a generic banner.
        } else if (res.status === 409 || res.status === 422) {
          if (data.message.toLowerCase().includes("email")) {
            emailInput.setCustomValidity(data.message);
            emailInput.reportValidity();
          } else if (data.message.toLowerCase().includes("username")) {
            usernameInput.setCustomValidity(data.message);
            usernameInput.reportValidity();
          } else if (data.message.toLowerCase().includes("password")) {
            passwordInput.setCustomValidity(data.message);
            passwordInput.reportValidity();
          } else {
            setServerError(data.message);
          }
        } else if (res.status === 500) {
          setServerError(COPY.serverError);
        } else {
          setServerError(COPY.unexpected);
        }
      } catch (err) {
        // A thrown fetch (offline, DNS, connection reset) used to skip both the
        // error message and setLoading(false) below, leaving the button stuck
        // on "Registering..." with nothing said.
        console.error("Registration request failed:", err);
        setServerError(COPY.offline);
      }
    }

    setLoading(false);
  }

  return (
    <Page
      title="Create account - Imprint"
      description="Create an Imprint account to start annotating sidewalks."
      contribute={false}
    >
      <AuthScreen>
        <AuthCard
          title={COPY.title}
          subtitle={
            <>
              {COPY.haveAccount}{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                {COPY.login}
              </Link>
            </>
          }
        >
          <form onSubmit={onSubmit}>
            <Button
              variant="neutral"
              fullWidth
              className="mb-6"
              onClick={handleGoogleSignIn}
            >
              <GoogleMark />
              {AUTH_COPY.google}
            </Button>

            <div className="flex items-center gap-3 mb-6">
              <hr className="flex-1 border-line" />
              <span className="text-xs font-medium text-muted">{AUTH_COPY.or}</span>
              <hr className="flex-1 border-line" />
            </div>

            <div className="space-y-4">
              <Input
                label={COPY.username}
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                hint={COPY.usernameHint}
                required
                onInput={(e) => e.target.setCustomValidity("")}
              />
              <Input
                label={COPY.email}
                type="email"
                placeholder={COPY.emailPlaceholder}
                name="email"
                autoComplete="email"
                required
                onInput={(e) => e.target.setCustomValidity("")}
              />
              <Input
                label={COPY.password}
                type="password"
                name="password"
                autoComplete="new-password"
                hint={COPY.passwordHint}
                required
                onInput={(e) => e.target.setCustomValidity("")}
              />
              <Input
                label={COPY.confirmPassword}
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                required
                onInput={(e) => e.target.setCustomValidity("")}
              />
            </div>

            <div className="space-y-3 mt-8">
              <Checkbox
                id="consent-agree"
                required
                label={
                  <>
                    I have read and understood the{" "}
                    <Link
                      href="/terms-of-use"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer text-primary font-semibold hover:underline"
                    >
                      Informed Consent Form
                    </Link>
                    {" "}and agree to participate
                  </>
                }
              />
              <Checkbox
                id="consent-age"
                required
                label="I confirm that I am at least 18 years old"
              />
            </div>

            <Button submit fullWidth className="mt-6" disabled={loadingForm}>
              {loadingForm ? COPY.submitting : COPY.submit}
            </Button>

            {serverError && (
              <p role="alert" className="text-sm mt-6 text-danger font-medium text-center bg-danger-soft p-3 rounded-control border border-danger-border">
                {serverError}
              </p>
            )}
          </form>
        </AuthCard>
      </AuthScreen>
    </Page>
  );
}

