import { useState, useEffect, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { EyeIcon, EyeOffIcon } from "@/ui";
import Image from "next/image";

import Page from "@/ui/page";
import InteractiveObstructions from "@/ui/InteractiveObstructions";
import { AuthCard, Button, Input, Badge, Checkbox, Container } from "@/ui";
import GoogleMark from "@/features/auth/GoogleMark";
import { AUTH_COPY, RESEARCHER_EMAIL } from "@/features/auth/authCopy";

const COPY = AUTH_COPY.login;

/**
 * Sign-in page, offering both a password account and Google.
 *
 * The two identify people differently: password login asks for a username,
 * while Google works from an email address. Username is what annotations are
 * credited to, so that is what contributors are asked to remember.
 *
 * The animated scene alongside the form shows boxes being drawn around
 * obstructions, so a visitor can see what contributing involves before signing
 * up.
 *
 * 16 Oct 2026 (IMPRINT_public_redesign.md): wording from authCopy.js ("Log
 * in", "Continue with Google", a specific error), the inline Google mark in
 * place of an image from svgrepo.com, autocomplete on both fields so password
 * managers fill them, the card without a shadow (AuthCard), and the row under
 * the fields wraps instead of breaking "Forgot password?" over two lines on a
 * phone.
 */
export default function Login() {
  const [loadingForm, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(false);

  /*
   * Drives the scene's reactions. The id increments on every fire so the same
   * reaction can repeat — two failed logins in a row, or tabbing between the
   * fields — where comparing the type alone would swallow the second one.
   */
  const [reaction, setReaction] = useState({ id: 0, type: null });
  const fireReaction = useCallback(
    (type) => setReaction((r) => ({ id: r.id + 1, type })),
    [],
  );
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const router = useRouter();

  // Set by the signIn callback when someone tries Google on an email that
  // already belongs to a password account. We refuse to link the two (an
  // unverified email can't prove ownership), so point them at the right door.
  const providerNotice =
    router.query.error === "UsePassword"
      ? COPY.usePassword
      : null;

  useEffect(() => {
    if (!loading && session) {
      router.push("/contribute");
    }
  }, [session, loading, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setLoginError(false);
    const username = e.currentTarget.username.value;
    const password = e.currentTarget.password.value;
    const rememberMe = e.currentTarget.rememberMe.checked;
    const result = await signIn("credentials", {
      username,
      password,
      rememberMe,
      redirect: false,
    });

    if (result?.error) {
      setLoginError(true);
      fireReaction("shake");
      setLoading(false);
    } else {
      router.push("/contribute");
    }
  }
  return (
    <Page
      title="Log in - Imprint"
      description="Log in to Imprint to keep annotating sidewalks."
      contribute={false}
    >
      {/* On the page shell, not full-bleed: that is what puts the 3D panel's
          left edge under the logo and the auth card's right edge under the nav
          links. Bleeding to the viewport edge put this page on its own grid,
          so nothing here lined up with the navbar above it. */}
      <Container className="flex flex-col lg:flex-row lg:min-h-[calc(100vh_-_var(--nav-h))]">

        {/* Left Side: Interactive 3D Canvas (Hidden on small screens).
            55/45 rather than the 58/50 this used to be — those totalled 108%,
            so flex silently shrank both and the panel never got the width it
            asked for. 55/45 is what was actually rendering, minus the overflow.

            The explicit height is what keeps the scene on screen. The row is
            min-h-screen, but it starts *below* the navbar, so a stretched panel
            ran 100vh + navbar tall and its bottom fell past the fold on short
            viewports. --nav-h is declared in globals.scss next to a note about
            where it comes from. */}
        <div className="hidden lg:block lg:w-[55%] lg:h-[calc(100vh_-_var(--nav-h))] relative">
          <InteractiveObstructions showPassword={showPassword} reaction={reaction} />
        </div>

        {/* Right Side: Auth Form */}
        {/* Vertical padding only: the shell owns the side gutter now, and adding
            the column's own on top of it squeezed the card by 40px on a phone.
            lg:pl-12 is the gap from the 3D panel. Right-aligned at lg so the
            card's edge is the shell's edge — the line the nav links end on —
            and centred below lg, where the panel is hidden and there is nothing
            to align to. */}
        <div className="w-full lg:w-[45%] pt-8 pb-20 sm:pt-12 lg:pl-12 relative flex flex-col items-center lg:items-end justify-start z-10">

          <AuthCard
            className="relative z-10"
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
            subtitle={
              <>
                {COPY.newHere}{" "}
                <Link href="/register" className="font-semibold text-primary hover:underline">
                  {COPY.createAccount}
                </Link>
              </>
            }
            footer={
              <>
                {COPY.trouble}{" "}
                <a
                  href={`mailto:${RESEARCHER_EMAIL}`}
                  className="text-body font-semibold hover:text-primary transition-colors duration-300"
                >
                  {RESEARCHER_EMAIL}
                </a>
              </>
            }
          >
            {providerNotice && (
              <div className="mb-6">
                <Badge tone="warning">{providerNotice}</Badge>
              </div>
            )}

            <form onSubmit={onSubmit} className="w-full">
              <div className="space-y-5 mb-6">
                <Input
                  type="text"
                  placeholder={COPY.username}
                  name="username"
                  aria-label={COPY.username}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  onFocus={() => fireReaction("nod")}
                />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={COPY.password}
                  name="password"
                  aria-label={COPY.password}
                  autoComplete="current-password"
                  required
                  onFocus={() => fireReaction("nod")}
                  error={loginError ? COPY.invalid : null}
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

                <div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-2">
                  <Checkbox
                    name="rememberMe"
                    label={COPY.remember}
                    labelClassName="text-muted"
                  />
                  <Link href="/forgot-password" className="text-sm font-semibold text-primary whitespace-nowrap hover:underline">
                    {COPY.forgot}
                  </Link>
                </div>
              </div>

              <div className="space-y-4">
                <Button submit fullWidth disabled={loadingForm}>
                  {loadingForm ? COPY.submitting : COPY.submit}
                </Button>

                <Button
                  variant="neutral"
                  fullWidth
                  onClick={() => signIn("google", { callbackUrl: `${window.location.origin}/contribute` })}
                >
                  <GoogleMark />
                  {AUTH_COPY.google}
                </Button>
              </div>
            </form>
          </AuthCard>
        </div>
      </Container>
    </Page>
  );
}

