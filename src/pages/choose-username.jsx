import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Link from "next/link";

import Page from "@/ui/page";
import { AuthCard, AuthScreen, Button, Input, Checkbox } from "@/ui";
import { AUTH_COPY } from "@/features/auth/authCopy";

const COPY = AUTH_COPY.username;

/**
 * Asks someone who signed in with Google to choose a username.
 *
 * Google supplies an email address and a real name, and neither belongs on
 * public annotations. Contributors are credited by username instead — a real
 * name is far more identifying than most people expect when the work involves
 * labelling photos of streets near where they live.
 *
 * 16 Oct 2026 (IMPRINT_public_redesign.md): AuthScreen, the same welcome as
 * before (authCopy.js), the username rule as a hint, and a description for
 * the page. The consent and age lines are unchanged (appendix_C.tex).
 */
export default function ChooseUsername() {
    const [loadingForm, setLoading] = useState(false);
    const { data: session, status, update } = useSession();
    const loading = status === "loading";
    const router = useRouter();

    const [serverError, setServerError] = useState("");

    useEffect(() => {
        if (!loading && session) {
            // If they somehow landed here but already have a full profile, kick them to contribute
            if (!session.user?.isNewGoogleUser) {
                router.replace("/contribute");
            }
        } else if (!loading && !session) {
            router.replace("/login");
        }
    }, [session, loading, router]);

    async function onSubmit(e) {
        e.preventDefault();
        setServerError("");
        setLoading(true);

        const usernameInput = e.currentTarget.username;
        const username = usernameInput.value;
        const consentAgreed = e.currentTarget["consent-agree"].checked;
        const ageConfirmed = e.currentTarget["consent-age"].checked;
        const body = { username, consentAgreed, ageConfirmed };

        try {
            const res = await fetch("/api/auth/choose-username", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (res.status === 200) {
                // Fold the new username into the JWT so isNewGoogleUser clears
                // — otherwise the dashboard bounces them straight back here
                if (update) {
                    await update({ username: username });
                }
                router.replace("/contribute");
            } else {
                if (data.message.toLowerCase().includes("username")) {
                    usernameInput.setCustomValidity(data.message);
                    usernameInput.reportValidity();
                } else {
                    setServerError(data.message || "Failed to update profile");
                }
            }
        } catch (error) {
            console.error(error);
            setServerError("An unexpected error occurred. Please try again.");
        }

        setLoading(false);
    }

    // Prevent flash while assessing session
    if (loading || !session?.user?.isNewGoogleUser) return null;

    return (
        <Page title="Choose a username - Imprint" description="Choose the username Imprint shows for your account." contribute={false}>
            <AuthScreen>
                <AuthCard
                    title={COPY.title}
                    subtitle={COPY.subtitle}
                >
                    <form onSubmit={onSubmit}>
                        <Input
                            label={COPY.label}
                            type="text"
                            name="username"
                            autoComplete="username"
                            autoCapitalize="none"
                            spellCheck={false}
                            hint={COPY.hint}
                            required
                            onInput={(e) => e.target.setCustomValidity("")}
                            error={serverError || null}
                        />

                        <div className="space-y-3 mt-6 mb-8">
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

                        <Button submit fullWidth disabled={loadingForm}>
                            {loadingForm ? COPY.submitting : COPY.submit}
                        </Button>
                    </form>
                </AuthCard>
            </AuthScreen>
        </Page>
    );
}
