import { useState, useEffect } from "react";
import { getSession, signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";

import Page from "@/ui/page";

export default function login() {
  const [loadingForm, setLoading] = useState(false);
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
    signIn("credentials", {
      username,
      password,
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
      <section className="container mx-auto p-4 my-12 mb-32 flex flex-col items-center justify-center">
        <div className="w-full sm:w-10/12 md:w-8/12 lg:w-6/12 xl:w-4/12 bg-white rounded-[2rem] shadow-[0_4px_40px_rgb(0,0,0,0.06)] border border-gray-100 p-8 sm:p-12 relative overflow-hidden">
          {/* Subtle gradient accent for the card */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/3 pointer-events-none" />

          <div className="mb-8 relative z-10 text-center">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Welcome Back</h1>
            <p className="mt-3 text-gray-500 font-medium">
              Don&apos;t have an account?
              <Link href="/register">
                <span className="text-primary hover:text-[#004aad] ml-2 font-bold transition-colors cursor-pointer hover:underline">
                  Register Here
                </span>
              </Link>
            </p>
          </div>

          <form onSubmit={onSubmit} className="relative z-10">
            <div className="space-y-4 mb-6">
              <input
                className="w-full p-3.5 bg-gray-50 placeholder-gray-400 text-gray-900 rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
                type="text"
                placeholder="Username"
                name="username"
              />
              <input
                className="w-full p-3.5 bg-gray-50 placeholder-gray-400 text-gray-900 rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
                type="password"
                placeholder="Password"
                name="password"
              />
            </div>

            {error && (
              <div className="text-sm mt-[-10px] mb-4 text-red-500 font-medium px-1 text-center">
                Invalid Credentials
              </div>
            )}

            <button
              className="w-full transition-all duration-500 ease-in-out font-bold py-3.5 px-6 text-lg rounded-[2rem] bg-primary border border-primary text-white hover:bg-opacity-90 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(0,74,173,0.3)] disabled:opacity-50 mt-2"
              type="submit"
              disabled={loadingForm}
            >
              {loadingForm ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>

        <div className="mt-8 flex justify-center w-full max-w-lg text-center">
          <p className="font-medium text-gray-400 text-sm px-4">
            If you&apos;re experiencing problems logging in to your account,
            please contact me at: <a href="mailto:francis_bawa@dlsu.edu.ph" className="text-gray-500 font-semibold hover:text-primary transition-colors">francis_bawa@dlsu.edu.ph</a>
          </p>
        </div>
      </section>
    </Page>
  );
}

login.getInitialProps = async (context) => {
  const session = await getSession(context);
  return {
    props: { session },
  };
};
