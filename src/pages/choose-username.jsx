import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import Page from "@/ui/page";
import { AuthCard, Button, Input, Container } from "@/ui";

/**
 * Asks someone who signed in with Google to choose a username.
 *
 * Google supplies an email address and a real name, and neither belongs on
 * public annotations. Contributors are credited by username instead — a real
 * name is far more identifying than most people expect when the work involves
 * labelling photos of streets near where they live.
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
        const body = { username };

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
        <Page title="Choose Username - Imprint" contribute={false}>
            <Container as="section" className="py-4 my-12 mb-32 flex flex-col items-center justify-center">
                <AuthCard
                    title="Welcome to Imprint!"
                    subtitle="Please choose a username to continue."
                >
                    <form onSubmit={onSubmit}>
                        <Input
                            label="Choose a Username"
                            type="text"
                            placeholder="Unique Username"
                            name="username"
                            required
                            onInput={(e) => e.target.setCustomValidity("")}
                            error={serverError || null}
                            className="mb-8"
                        />

                        <Button submit fullWidth disabled={loadingForm}>
                            {loadingForm ? "Saving..." : "Continue to Dashboard"}
                        </Button>
                    </form>
                </AuthCard>
            </Container>
        </Page>
    );
}
