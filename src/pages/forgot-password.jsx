import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Page from "@/ui/page";

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
            <div className="min-h-screen w-full flex items-start justify-center pt-20 pb-12 px-4 sm:px-6 lg:px-8 relative z-10 bg-[#f8fafc]">
                {/* We use a unified centered card similar to the right-side of Login */}
                <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-2xl shadow-xl border border-gray-100 flex flex-col relative z-10 mt-8">

                    <div className="mb-8 text-center flex flex-col items-center">
                        <div className="mb-4">
                            <Image
                                src="/images/logo/imprint.png"
                                alt="Imprint Logo"
                                width={80}
                                height={80}
                                className="w-20 h-20 object-contain"
                            />
                        </div>
                        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Reset your password</h1>
                        <p className="mt-2 text-gray-500 font-medium text-sm">
                            Enter your email address and we&apos;ll send you a link to reset your password.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="w-full">
                        <div className="space-y-4 mb-6">
                            <input
                                className="w-full p-3 bg-white placeholder-gray-400 text-gray-900 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium text-base shadow-sm"
                                type="email"
                                placeholder="Email Address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <div className="text-xs mb-4 text-red-500 font-medium px-1 text-center">
                                {error}
                            </div>
                        )}

                        {message && (
                            <div className="text-xs mb-4 text-green-600 font-medium p-3 bg-green-50 rounded-lg text-center border border-green-200">
                                {message}
                            </div>
                        )}

                        <div className="space-y-4">
                            <button
                                className="w-full transition-all duration-500 ease-in-out font-bold py-3 px-6 text-base rounded-xl bg-primary border border-primary text-white hover:bg-[#003d8f] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(0,74,173,0.3)] disabled:opacity-50"
                                type="submit"
                                disabled={loading}
                            >
                                {loading ? "Sending..." : "Send Reset Link"}
                            </button>

                            <div className="text-center pt-2">
                                <Link href="/login">
                                    <span className="text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer flex items-center justify-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                        Back to log in
                                    </span>
                                </Link>
                            </div>
                        </div>
                    </form>

                </div>
            </div>
        </Page>
    );
}
