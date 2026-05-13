import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";

import Page from "@/ui/page";

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


  async function onSubmit(e) {
    e.preventDefault();
    setServerError("");
    setLoading(true);

    const username = e.currentTarget.username.value;
    const email = e.currentTarget.email.value;
    const password = e.currentTarget.password.value;
    const confirmPassword = e.currentTarget.confirmPassword.value;

    const body = {
      username,
      email,
      password,
      confirmPassword,
    };

    const confirmInput = e.currentTarget.confirmPassword;
    const emailInput = e.currentTarget.email;
    const usernameInput = e.currentTarget.username;
    const passwordInput = e.currentTarget.password;

    if (password !== confirmPassword) {
      confirmInput.setCustomValidity("Passwords do not match");
      confirmInput.reportValidity();
      setLoading(false);
      return;
    } else {
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
        setServerError("There seems to be something wrong with our servers");
      } else {
        setServerError("An unexpected error occurred");
      }
    }

    setLoading(false);
  }

  return (
    <Page
      title="Register - Imprint"
      description="Register to Imprint! Register to Imprint in order to contribute to our platform."
      contribute={false}
    >
      <section className="container mx-auto p-4 my-12 mb-32 flex flex-col items-center justify-center">
        <div className="w-full sm:w-11/12 md:w-9/12 lg:w-7/12 xl:w-6/12 bg-white rounded-[2rem] shadow-[0_4px_40px_rgb(0,0,0,0.06)] border border-gray-100 p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/3 pointer-events-none" />

          <div className="mb-8 relative z-10 text-center">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Register to Imprint</h1>
            <p className="mt-3 text-gray-500 font-medium">
              Already have an account?
              <Link href="/login">
                <span className="text-primary hover:text-[#004aad] ml-2 font-bold transition-colors cursor-pointer hover:underline">
                  Login Here
                </span>
              </Link>
            </p>
          </div>
          <form
            onSubmit={onSubmit}
            className="relative z-10"
          >
            {/* Google Sign-Up */}
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: `${window.location.origin}/contribute` })}
              className="w-full flex items-center justify-center gap-2 transition-all duration-300 ease-in-out font-bold py-3 px-6 text-base rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:-translate-y-0.5 hover:shadow-sm focus:ring-2 focus:ring-gray-200 focus:outline-none mb-6"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
              Sign up with Google
            </button>

            <div className="flex items-center gap-3 mb-6">
              <hr className="flex-1 border-gray-200" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">or</span>
              <hr className="flex-1 border-gray-200" />
            </div>

            <h2 className="text-xl font-bold text-gray-800 mb-6 mt-2">User Credentials</h2>
            <label className="font-bold" htmlFor="username">
              Username
            </label>
            <input
              className="mb-4 p-3.5 block w-full bg-gray-50 placeholder-gray-400 text-gray-900 rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
              type="text"
              placeholder="Username"
              name="username"
              required
              onInput={(e) => e.target.setCustomValidity("")}
            />
            <label className="font-bold" htmlFor="email">
              Email
            </label>
            <input
              className="mb-4 p-3.5 block w-full bg-gray-50 placeholder-gray-400 text-gray-900 rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
              type="email"
              placeholder="hello@website.com"
              name="email"
              required
              onInput={(e) => e.target.setCustomValidity("")}
            />
            <label className="font-bold" htmlFor="password">
              Password
            </label>
            <input
              className="mb-4 p-3.5 block w-full bg-gray-50 placeholder-gray-400 text-gray-900 rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
              type="password"
              placeholder="Password"
              name="password"
              required
              onInput={(e) => e.target.setCustomValidity("")}
            />
            <label className="font-bold" htmlFor="confirm-password">
              Confirm Password
            </label>

            <input
              className="mb-4 p-3.5 block w-full bg-gray-50 placeholder-gray-400 text-gray-900 rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
              type="password"
              placeholder="Confirm Password"
              name="confirmPassword"
              required
              onInput={(e) => e.target.setCustomValidity("")}
            />
            <div className="flex items-center mt-8">
              <div className="w-full sm:w-2/3 flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  className="mr-3 w-5 h-5 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
                  required
                />
                <label htmlFor="remember-me" className="text-gray-600 font-medium text-sm">
                  I have read the{" "}
                  <Link
                    href="/terms-of-use"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer text-primary font-bold hover:underline"
                  >
                    Terms of Use
                  </Link>
                </label>
              </div>
              <button
                className="ml-auto transition-all duration-500 ease-in-out font-bold py-3.5 px-8 text-lg rounded-[2rem] bg-primary border border-primary text-white hover:bg-opacity-90 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(0,74,173,0.3)] disabled:opacity-50"
                type="submit"
                disabled={loadingForm}
              >
                {loadingForm ? "Loading..." : "Submit"}
              </button>
            </div>

            {serverError && (
              <div className="text-sm mt-6 text-red-500 font-medium text-center bg-red-50 p-3 rounded-xl border border-red-100">
                {serverError}
              </div>
            )}
          </form>
        </div>
      </section>
    </Page>
  );
}

