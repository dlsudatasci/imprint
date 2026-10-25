import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Page from "@/ui/page";
import { AuthCard, AuthScreen, Button, Input } from "@/ui";
import { AUTH_COPY } from "@/features/auth/authCopy";
import { isRateLimited, readJson, rateLimitMessage } from "@/features/auth/authResponse";

const COPY = AUTH_COPY.forgot;

/**
 * Requests a password reset link by email.
 *
 * The confirmation message is deliberately vague ("if that email exists") and
 * appears whether or not the address is registered. The endpoint answers
 * identically in both cases, so this page can't be used to find out who has an
 * account.
 *
 * Only applies to password accounts. Someone who signed up with Google has no
 * password to reset and receives nothing, which the page now says under the
 * form (16 Oct 2026), so they are not left waiting for an email.
 *
 * 16 Oct 2026 (IMPRINT_public_redesign.md): the same AuthScreen as the other
 * auth pages (it had its own full-height wrapper), wording from authCopy.js,
 * autocomplete, and the result announced to screen readers.
 */
export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage("");
        setError("");

        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email }),
            });

            // The request limit (S8) answers before the app, so the status
            // comes first and the body may not be the app's JSON
            const data = await readJson(res);

            if (isRateLimited(res)) {
                throw new Error(rateLimitMessage(data));
            }

            if (!res.ok) {
                throw new Error(data.message || "Failed to send reset link.");
            }

            setMessage(data.message);
            setEmail(""); // clear on success
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Page
            title="Forgot Password - Imprint"
            description="Request a password reset link for your Imprint account."
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
                    footer={
                        <Link href="/login">
                            <span className="font-semibold text-muted hover:text-ink transition-colors duration-300 cursor-pointer inline-flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                {COPY.back}
                            </span>
                        </Link>
                    }
                >
                    <form onSubmit={handleSubmit} className="w-full">
                        <Input
                            type="email"
                            placeholder={COPY.email}
                            aria-label={COPY.email}
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            error={error || null}
                            className="mb-6"
                        />

                        {message && (
                            <p role="status" className="text-sm mb-4 text-success font-medium p-3 bg-success-soft rounded-control text-center border border-success-border">
                                {message}
                            </p>
                        )}

                        <Button submit fullWidth disabled={loading}>
                            {loading ? COPY.submitting : COPY.submit}
                        </Button>
                        <p className="mt-4 text-xs text-muted text-center">{COPY.googleNote}</p>
                    </form>
                </AuthCard>
            </AuthScreen>
        </Page>
    );
}
