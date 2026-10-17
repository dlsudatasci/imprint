import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import Link from "next/link";
import Page from "@/ui/page";
import { AuthCard, AuthScreen, Button, Input } from "@/ui";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/util/validation";
import { AUTH_COPY } from "@/features/auth/authCopy";

const COPY = AUTH_COPY.reset;
import { EyeIcon, EyeOffIcon } from "@/ui";

/**
 * Sets a new password, using the token and email carried in the reset link.
 *
 * Checks the token as soon as the page opens, so an expired link says so
 * straight away rather than after someone has typed a new password twice.
 *
 * That check is for convenience only. The endpoint verifies the token again
 * before changing anything.
 *
 * 16 Oct 2026 (IMPRINT_public_redesign.md): the length rule comes from
 * MIN_PASSWORD_LENGTH and MAX_PASSWORD_LENGTH, the server's own (it was a 6
 * typed in here), plus AuthScreen, wording from authCopy.js, autocomplete
 * and announced results.
 */
export default function ResetPassword() {
    const router = useRouter();
    // From the query string, so they're undefined on the first render until
    // router.isReady — hence the guard in the effect below
    const { token, email } = router.query;

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    // Manage preemptive token validity checking
    const [pageStatus, setPageStatus] = useState("loading");

    // Clear errors when typing
    useEffect(() => {
        if (error) setError("");
    }, [newPassword, confirmPassword]);

    useEffect(() => {
        if (!router.isReady) return;
        if (!token || !email) {
            setPageStatus("invalid");
            return;
        }

        fetch("/api/auth/verify-reset-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, token })
        })
            .then(res => res.json())
            .then(data => setPageStatus(data.valid ? "valid" : "invalid"))
            .catch(() => setPageStatus("invalid"));
    }, [router.isReady, token, email]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage("");
        setError("");

        if (!token || !email) {
            setError(COPY.missingLink);
            setLoading(false);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError(COPY.mismatch);
            setLoading(false);
            return;
        }

        if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
            setError(COPY.lengthRule);
            setLoading(false);
            return;
        }

        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, token, newPassword }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "Failed to reset password.");
            }

            setMessage(data.message);
            setSuccess(true);
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Page
            title="Set a new password - Imprint"
            description="Create a new password for your Imprint account."
            contribute={false}
        >
            <AuthScreen>
                <AuthCard
                    masthead={
                        <Image
                            src="/images/logo/imprint.png"
                            alt="Imprint"
                            width={56}
                            height={56}
                            className="w-14 h-14 object-contain"
                        />
                    }
                    title={COPY.title}
                    subtitle={COPY.subtitle}
                >
                    {pageStatus === "loading" && (
                        <div className="w-full text-center space-y-4 py-8">
                            <div className="mx-auto w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin motion-reduce:animate-none"></div>
                            <p role="status" className="text-sm text-muted font-medium">{COPY.checking}</p>
                        </div>
                    )}

                    {pageStatus === "invalid" && (
                        <div className="w-full text-center space-y-4 py-4">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-danger-soft">
                                <svg className="h-6 w-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <p role="alert" className="text-sm font-medium p-4 bg-danger-soft rounded-control text-danger border border-danger-border">
                                {COPY.invalid}
                            </p>
                            <Link href="/forgot-password" className="block pt-2">
                                <Button fullWidth>{COPY.requestNew}</Button>
                            </Link>
                        </div>
                    )}

                    {pageStatus === "valid" && !success && (
                        <form onSubmit={handleSubmit} className="w-full">
                            <div className="space-y-4 mb-6">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder={COPY.newPassword}
                                    aria-label={COPY.newPassword}
                                    autoComplete="new-password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    trailing={
                                        // eslint-disable-next-line react/forbid-elements -- affordance inside Input's trailing slot, not a standalone button
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                            className="text-subtle hover:text-body transition-colors duration-300 focus:outline-none"
                                        >
                                            {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                                        </button>
                                    }
                                />
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder={COPY.confirmPassword}
                                    aria-label={COPY.confirmPassword}
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    error={error || null}
                                />
                            </div>

                            <Button submit fullWidth disabled={loading}>
                                {loading ? COPY.submitting : COPY.submit}
                            </Button>
                        </form>
                    )}

                    {pageStatus === "valid" && success && (
                        <div className="w-full text-center space-y-4 py-2">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-success-soft">
                                <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <p role="status" className="text-sm font-medium p-3 bg-success-soft rounded-control text-success border border-success-border">
                                {message}
                            </p>
                            <Link href="/login" className="block pt-2">
                                <Button fullWidth>{COPY.toLogin}</Button>
                            </Link>
                        </div>
                    )}
                </AuthCard>
            </AuthScreen>
        </Page>
    );
}
