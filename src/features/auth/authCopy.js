import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/util/validation";
import { RESEARCHER_EMAIL } from "@/features/footerMain/footerCopy";

export { RESEARCHER_EMAIL };

/**
 * Every string the sign-in and onboarding screens show (16 Oct 2026), so tests
 * can check them: no em dashes and no semicolons in user-facing copy.
 *
 * Labels say what happens (apple-design, specific labels): "Log in" is the
 * verb (the button said "Login"), "Create account" says what Submit did, and
 * both pages say "Continue with Google", which Google's branding allows and
 * which is true whether or not the person already has an account.
 *
 * The consent and age lines are not here. They repeat appendix_C.tex word for
 * word and stay in the pages that ask them.
 */
export const AUTH_COPY = Object.freeze({
  // Shown on a 429 from the request limit on sign-in, sign-up and password
  // reset (S8, deploy/nginx.conf, which sends the same words)
  tooManyAttempts: "Too many attempts. Please wait a minute and try again.",
  google: "Continue with Google",
  or: "or",
  login: Object.freeze({
    title: "Welcome back",
    newHere: "New to Imprint?",
    createAccount: "Create an account",
    username: "Username",
    password: "Password",
    remember: "Remember me for 30 days",
    forgot: "Forgot password?",
    submit: "Log in",
    submitting: "Logging in...",
    invalid: "That username and password do not match. Try again.",
    trouble: "Trouble signing in? Email",
    usePassword: "That email already has a password account. Log in with your username and password.",
    failed: "Something went wrong. Try again in a moment.",
  }),
  register: Object.freeze({
    title: "Create your account",
    haveAccount: "Already have an account?",
    login: "Log in",
    username: "Username",
    usernameHint: "3 to 30 letters, numbers, dots, underscores or hyphens. It is how Imprint knows you.",
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    passwordHint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
    confirmPassword: "Confirm password",
    mismatch: "Passwords do not match",
    submit: "Create account",
    submitting: "Creating account...",
    serverError: "Something went wrong on our side. Try again in a moment.",
    unexpected: "Something unexpected happened. Try again.",
    offline: "Couldn't reach the server. Check your connection and try again.",
  }),
  forgot: Object.freeze({
    title: "Reset your password",
    subtitle: "Enter the email address you signed up with, and we will send you a link to set a new password.",
    email: "Email address",
    submit: "Send reset link",
    submitting: "Sending...",
    back: "Back to log in",
    googleNote: "Signed up with Google? There is no password to reset. Use Continue with Google.",
  }),
  reset: Object.freeze({
    title: "Set a new password",
    subtitle: `Choose a new password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    checking: "Checking your link...",
    invalid: "This link has expired or has already been used. Each link works once. Ask for a new one.",
    requestNew: "Request a new link",
    mismatch: "Passwords do not match.",
    lengthRule: `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`,
    missingLink: "This link is incomplete. Ask for a new one.",
    submit: "Save new password",
    submitting: "Saving...",
    toLogin: "Go to log in",
    // The link check refused by the request limit (S8)
    tryAgain: "Try again",
  }),
  // Email verification (S9): /check-email, where a new account lands, and
  // /verify-email, which the emailed link opens
  checkEmail: Object.freeze({
    title: "Check your inbox",
    sentTo: (email) => `We sent a link to ${email}. Open it to confirm your email address and start annotating.`,
    sentToYou: "We sent you a link. Open it to confirm your email address and start annotating.",
    notSent: "We could not send the link when you signed up. Send a new one below.",
    linkLife: "The link works for 24 hours. Not in your inbox? Look in your spam folder, or send a new link.",
    meanwhile: "While you wait, you can do the tutorial, finish your profile and read the guide.",
    resend: "Send a new link",
    resending: "Sending...",
    toDashboard: "Go to dashboard",
    guide: "Read the guide",
    offline: "Couldn't reach the server. Check your connection and try again.",
    confirmedTitle: "Email confirmed",
    confirmed: "Your email address is confirmed. You can annotate once the tutorial and your profile are done.",
  }),
  verify: Object.freeze({
    title: "Confirm your email",
    checking: "Confirming your email address...",
    confirmedTitle: "Email confirmed",
    confirmed: "Your email address is confirmed. You can annotate once the tutorial and your profile are done.",
    failedTitle: "This link did not work",
    usedTitle: "Already confirmed",
    missing: "This link is incomplete. Send a new link to try again.",
    offline: "Couldn't reach the server. Check your connection and try again.",
    resend: "Send a new link",
    resending: "Sending...",
    loginToResend: "Log in to send a new link",
    toDashboard: "Go to dashboard",
    toLogin: "Go to log in",
  }),
  // The old wording, kept (Rans, 16 Oct 2026)
  username: Object.freeze({
    title: "Welcome to Imprint!",
    subtitle: "Please choose a username to continue.",
    label: "Username",
    hint: "3 to 30 letters, numbers, dots, underscores or hyphens.",
    submit: "Continue to Dashboard",
    submitting: "Saving...",
  }),
  // The old wording, kept (Rans, 16 Oct 2026: no need to describe the research here)
  profile: Object.freeze({
    title: "Almost there!",
    subtitle: "We just need a few more details to set up your Imprint profile so you can start mapping with us.",
    submit: "Complete Setup",
    submitting: "Finalizing Profile...",
  }),
});
