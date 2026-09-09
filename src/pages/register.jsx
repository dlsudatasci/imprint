import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";

import Page from "@/ui/page";
import { AuthCard, Button, Input, Container } from "@/ui";

/**
 * Sign-up for a password account.
 *
 * Registering signs the new contributor in and sends them to the dashboard.
 * Demographic questions come later at /complete-profile, so this screen asks
 * for as little as possible.
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
          setServerError("There seems to be something wrong with our servers");
        } else {
          setServerError("An unexpected error occurred");
        }
      } catch (err) {
        // A thrown fetch (offline, DNS, connection reset) used to skip both the
        // error message and setLoading(false) below, leaving the button stuck
        // on "Registering..." with nothing said.
        console.error("Registration request failed:", err);
        setServerError("Couldn't reach the server. Check your connection and try again.");
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
      <Container as="section" className="py-4 my-12 mb-32 flex flex-col items-center justify-center">
        <AuthCard
          title="Register to Imprint"
          subtitle={
            <>
              Already have an account?
              <Link href="/login">
                <span className="text-primary ml-2 font-bold transition-colors duration-300 cursor-pointer hover:underline">
                  Login Here
                </span>
              </Link>
            </>
          }
        >
          <form onSubmit={onSubmit}>
            <Button
              variant="neutral"
              fullWidth
              className="mb-6"
              onClick={() => signIn("google", { callbackUrl: `${window.location.origin}/contribute` })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.svgrepo.com/show/475656/google-color.svg"
                alt=""
                className="w-5 h-5"
              />
              Sign up with Google
            </Button>

            <div className="flex items-center gap-3 mb-6">
              <hr className="flex-1 border-line" />
              <span className="text-xs font-semibold text-subtle uppercase tracking-widest">or</span>
              <hr className="flex-1 border-line" />
            </div>

            <div className="space-y-4">
              <Input
                label="Username"
                type="text"
                placeholder="Username"
                name="username"
                required
                onInput={(e) => e.target.setCustomValidity("")}
              />
              <Input
                label="Email"
                type="email"
                placeholder="hello@website.com"
                name="email"
                required
                onInput={(e) => e.target.setCustomValidity("")}
              />
              <Input
                label="Password"
                type="password"
                placeholder="Password"
                name="password"
                required
                onInput={(e) => e.target.setCustomValidity("")}
              />
              <Input
                label="Confirm Password"
                type="password"
                placeholder="Confirm Password"
                name="confirmPassword"
                required
                onInput={(e) => e.target.setCustomValidity("")}
              />
            </div>

            <div className="flex items-center mt-8">
              <input
                id="remember-me"
                type="checkbox"
                className="mr-3 w-5 h-5 text-primary bg-surface-subtle border-line rounded focus:ring-primary focus:ring-2"
                required
              />
              <label htmlFor="remember-me" className="text-body font-medium text-sm">
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

            <Button submit fullWidth className="mt-6" disabled={loadingForm}>
              {loadingForm ? "Loading..." : "Submit"}
            </Button>

            {serverError && (
              <p className="text-sm mt-6 text-danger font-medium text-center bg-danger-soft p-3 rounded-control border border-danger-border">
                {serverError}
              </p>
            )}
          </form>
        </AuthCard>
      </Container>
    </Page>
  );
}

