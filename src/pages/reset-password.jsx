import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import Link from "next/link";
import Page from "@/ui/page";
import { Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
    const router = useRouter();
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
            setError("Invalid reset link. Please request a new one.");
            setLoading(false);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            setLoading(false);
            return;
        }

        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters long.");
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
            title="Create New Password - Imprint"
            description="Create a new password for your Imprint account."
            contribute={false}
        >
            <div className="min-h-screen w-full flex items-start justify-center pt-20 pb-12 px-4 sm:px-6 lg:px-8 relative z-10 bg-[#f8fafc]">
                <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-2xl shadow-xl border border-gray-100 flex flex-col relative z-10 mt-8">

                    <div className="mb-8 text-center flex flex-col items-center">
                        <div className="mb-4">
                            <Image
                                src="/images/logo/3.png"
                                alt="Imprint Logo"
                                width={80}
                                height={80}
                                className="w-20 h-20 object-contain"
                            />
                        </div>
                        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Set new password</h1>
                        <p className="mt-2 text-gray-500 font-medium text-sm">
                            Please enter your new password below.
                        </p>
                    </div>

                    {pageStatus === "loading" && (
                        <div className="w-full text-center space-y-4 py-8">
                            <div className="mx-auto w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm text-gray-500 font-medium">Verifying reset link...</p>
                        </div>
                    )}

                    {pageStatus === "invalid" && (
                        <div className="w-full text-center space-y-4 py-4">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="text-sm font-medium p-4 bg-red-50 rounded-lg text-red-700 border border-red-200">
                                This password reset link is invalid or has expired. Valid tokens can only be used once. Please request a new one.
                            </div>
                            <div className="pt-2 w-full">
                                <Link href="/forgot-password">
                                    <button className="w-full transition-all duration-500 ease-in-out font-bold py-3 px-6 text-base rounded-xl bg-primary border border-primary text-white hover:bg-[#003d8f] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(0,74,173,0.3)]">
                                        Request New Link
                                    </button>
                                </Link>
                            </div>
                        </div>
                    )}

                    {pageStatus === "valid" && !success && (
                        <form onSubmit={handleSubmit} className="w-full">
                            <div className="space-y-4 mb-6">
                                <div className="relative">
                                    <input
                                        className="w-full p-3 pr-12 bg-white placeholder-gray-400 text-gray-900 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium text-base shadow-sm"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="New Password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <div className="relative">
                                    <input
                                        className="w-full p-3 bg-white placeholder-gray-400 text-gray-900 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium text-base shadow-sm"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Confirm New Password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="text-xs mb-4 text-red-500 font-medium px-1 text-center">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                <button
                                    className="w-full transition-all duration-500 ease-in-out font-bold py-3 px-6 text-base rounded-xl bg-primary border border-primary text-white hover:bg-[#003d8f] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(0,74,173,0.3)] disabled:opacity-50"
                                    type="submit"
                                    disabled={loading}
                                >
                                    {loading ? "Resetting..." : "Reset Password"}
                                </button>
                            </div>
                        </form>
                    )}
                    {pageStatus === "valid" && success && (
                        <div className="w-full text-center space-y-4 py-2">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div className="text-sm font-medium p-3 bg-green-50 rounded-lg text-green-700 border border-green-200">
                                {message}
                            </div>
                            <div className="pt-2 w-full">
                                <Link href="/login">
                                    <button className="w-full transition-all duration-500 ease-in-out font-bold py-3 px-6 text-base rounded-xl bg-primary border border-primary text-white hover:bg-[#003d8f] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(0,74,173,0.3)]">
                                        Return to Login
                                    </button>
                                </Link>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </Page>
    );
}
