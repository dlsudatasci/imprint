import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Page from "@/ui/page";
import { AuthCard, Button, Input } from "@/ui";

/**
 * Requests a password reset link by email.
 *
 * The confirmation message is deliberately vague ("if that email exists") and
 * appears whether or not the address is registered. The endpoint answers
 * identically in both cases, so this page can't be used to find out who has an
 * account.
 *
 * Only applies to password accounts. Someone who signed up with Google has no
 * password to reset and receives nothing.
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

            const data = await res.json();

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
            <div className="min-h-screen w-full flex items-start justify-center pt-20 pb-12 px-4 sm:px-6 lg:px-8 relative z-10 bg-ground">
                <AuthCard
                    className="mt-8"
                    masthead={
                        <Image
                            src="/images/logo/imprint.png"
                            alt="Imprint Logo"
                            width={80}
                            height={80}
                            className="w-20 h-20 object-contain"
                        />
                    }
                    title="Reset your password"
                    subtitle="Enter your email address and we'll send you a link to reset your password."
                    footer={
                        <Link href="/login">
                            <span className="font-semibold text-muted hover:text-ink transition-colors duration-300 cursor-pointer inline-flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                Back to log in
                            </span>
                        </Link>
                    }
                >
                    <form onSubmit={handleSubmit} className="w-full">
                        <Input
                            type="email"
                            placeholder="Email Address"
                            aria-label="Email Address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            error={error || null}
                            className="mb-6"
                        />

                        {message && (
                            <p className="text-xs mb-4 text-success font-medium p-3 bg-success-soft rounded-control text-center border border-success-border">
                                {message}
                            </p>
                        )}

                        <Button submit fullWidth disabled={loading}>
                            {loading ? "Sending..." : "Send Reset Link"}
                        </Button>
                    </form>
                </AuthCard>
            </div>
        </Page>
    );
}
