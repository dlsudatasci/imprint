import { useState, useEffect } from "react";
import { getSession, signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";

import Page from "@/ui/page";
import InteractiveObstructions from "@/ui/InteractiveObstructions";

export default function Login() {
  const [loadingForm, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const router = useRouter();

  const { error } = router.query;

  useEffect(() => {
    if (!loading && session) {
      router.push("/contribute");
    }
  }, [session, loading, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const username = e.currentTarget.username.value;
    const password = e.currentTarget.password.value;
    const rememberMe = e.currentTarget.rememberMe.checked;
    signIn("credentials", {
      username,
      password,
      rememberMe,
      callbackUrl: `${window.location.origin}/contribute`,
    });
    setLoading(false);
  }
  return (
    <Page
      title="Login - Imprint"
      description="Login to Imprint! Login to Imprint in order to contribute to our platform."
      contribute={false}
    >
      <div className="min-h-screen w-full flex flex-col lg:flex-row">

        {/* Left Side: Interactive 3D Canvas (Hidden on small screens) */}
        <div className="hidden lg:block lg:w-1/2 relative">
          <InteractiveObstructions showPassword={showPassword} />
        </div>

        {/* Right Side: Auth Form */}
        <div className="w-full lg:w-1/2 p-8 sm:p-12 lg:p-12 lg:pt-12 relative flex flex-col items-center justify-start min-h-screen lg:min-h-0 z-10">

          <div className="w-full max-w-md flex flex-col relative z-10 lg:-mt-4">
            <div className="mb-12 text-center flex flex-col items-center">
              <div className="mb-4">
                <Image
                  src="/images/logo/imprint.png"
                  alt="Imprint Logo"
                  width={80}
                  height={80}
                  className="w-20 h-20 object-contain"
                />
              </div>
              <h1 className="text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight lg:tracking-tighter">Welcome back!</h1>
              <p className="mt-4 text-gray-500 font-medium text-sm lg:text-base">
                Don&apos;t have an account?
                <Link href="/register">
                  <span className="text-primary hover:text-[#004aad] ml-2 font-bold transition-colors cursor-pointer hover:underline">
                    Register Here
                  </span>
                </Link>
              </p>
            </div>

            <form onSubmit={onSubmit} className="w-full">
              <div className="space-y-6 mb-8">
                <input
                  className="w-full p-3 bg-white placeholder-gray-400 text-gray-900 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium text-base shadow-sm"
                  type="text"
                  placeholder="Username"
                  name="username"
                  required
                />
                <div className="relative">
                  <input
                    className="w-full p-3 pr-12 bg-white placeholder-gray-400 text-gray-900 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium text-base shadow-sm"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    name="password"
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

                <div className="flex justify-between items-center mt-6">
                  <label className="flex items-center space-x-2 text-sm text-gray-500 font-medium cursor-pointer">
                    <input name="rememberMe" type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary/20 h-4 w-4 bg-white checked:[border-color:transparent]" />
                    <span>Remember me for 30 days</span>
                  </label>
                  <Link href="/forgot-password">
                    <span className="text-xs font-semibold text-primary hover:text-[#004aad] transition-colors cursor-pointer hover:underline">
                      Forgot Password?
                    </span>
                  </Link>
                </div>
              </div>

              {error && (
                <div className="text-xs mt-[-12px] mb-4 text-red-500 font-medium px-1">
                  Invalid Credentials. Please try again.
                </div>
              )}

              <div className="space-y-5">
                <button
                  className="w-full transition-all duration-500 ease-in-out font-bold py-3 px-6 text-base rounded-xl bg-primary border border-primary text-white hover:bg-[#003d8f] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(0,74,173,0.3)] disabled:opacity-50"
                  type="submit"
                  disabled={loadingForm}
                >
                  {loadingForm ? "Logging in..." : "Login"}
                </button>

                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: `${window.location.origin}/contribute` })}
                  className="w-full flex items-center justify-center gap-2 transition-all duration-300 ease-in-out font-bold py-3 px-6 text-base rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:-translate-y-0.5 hover:shadow-sm focus:ring-2 focus:ring-gray-200 focus:outline-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                  Log in with Google
                </button>
              </div>
            </form>

            <div className="mt-6 border-t border-gray-200 pt-6 max-w-md w-full text-center">
              <p className="font-medium text-gray-400 text-xs sm:text-sm">
                If you&apos;re experiencing problems logging in to your account, please contact me at:{' '}
                <a href="mailto:francis_bawa@dlsu.edu.ph" className="text-gray-500 font-semibold hover:text-primary transition-colors inline-block mt-1">francis_bawa@dlsu.edu.ph</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

Login.getInitialProps = async (context) => {
  const session = await getSession(context);
  return {
    props: { session },
  };
};
