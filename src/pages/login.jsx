import { useState, useEffect } from "react";
import { getSession, signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";

import Page from "@/ui/page";
import H1 from "@/ui/heading/h1";

export default function login({ providers, csrfToken }) {
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
      <section className="container mx-auto p-4 my-12 mb-32 bg-offwhite flex flex-col items-center justify-center">
        <div className="w-10/12 sm:w-8/12 md:w-6/12 lg:w-5/12 xl:w-4/12 mb-4">
          <H1>Login to Imprint!</H1>
          <p className="mt-5">
            Don&apos;t have an account?
            <Link href="/register">
              <span className="text-sm ml-2 font-bold text-primary hover:underline cursor-pointer">
                Register Here
              </span>
            </Link>
          </p>
        </div>
        <div className="w-10/12 sm:w-8/12 md:w-6/12 lg:w-5/12 xl:w-4/12 mb-6">
          <form onSubmit={onSubmit}>
            <input
              className="mb-4 p-2 appearance-none block w-full bg-gray-100 placeholder-gray-900 rounded border focus:border-primary"
              type="text"
              placeholder="Username"
              name="username"
            />
            <input
              className="mb-4 p-2 appearance-none block w-full bg-gray-100 placeholder-gray-900 rounded border focus:border-primary"
              type="password"
              placeholder="Password"
              name="password"
            />
            {error && (
              <div className="text-xs -mb-2 pb-4 text-red-600">
                Invalid Credentials
              </div>
            )}
            <div className="flex items-center">
              <div className="w-2/3 flex items-center"></div>
              <button
                className="ml-auto w-1/3 bg-accent text-white p-2 rounded font-semibold hover:bg-gray-900"
                type="submit"
              >
                {loadingForm ? "Loading..." : "Login"}
              </button>
            </div>
          </form>
        </div>
        <div className="flex justify-center w-10/12 sm:w-8/12 md:w-6/12 lg:w-5/12 xl:w-4/12">
          <p className="font-semibold text-gray-600 text-sm">
            If you&apos;re experiencing problems logging in to your account
            please contact me at: francis_bawa@dlsu.edu.ph
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
