import { useState, useEffect } from "react";
import { getSession, signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import CreatableSelect from "react-select/creatable";
import cities from "./cities.json";

import Page from "@/ui/page";

export default function register() {
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

  const cityOptions = cities.map((city) => ({
    value: city,
    label: city,
  }));

  const [frequentlyWalkedCities, setFrequentlyWalkedCities] = useState([]);

  const customSelectStyles = {
    control: (provided, state) => ({
      ...provided,
      backgroundColor: "#f9fafb",
      borderRadius: "1rem",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: state.isFocused ? "#004aad" : "#e5e7eb",
      boxShadow: state.isFocused ? "0 0 0 2px rgba(0, 74, 173, 0.2)" : "none",
      minHeight: "3.2rem",
      padding: "0.2rem 0.5rem",
      alignItems: "center",
      transition: "all 0.3s ease",
      "&:hover": {
        borderColor: state.isFocused ? "#004aad" : "#e5e7eb",
      },
    }),
    input: (provided) => ({
      ...provided,
      color: "#111827",
      margin: 0,
      padding: 0,
    }),
    placeholder: (provided) => ({
      ...provided,
      color: "#9ca3af",
      margin: 0,
      padding: 0,
    }),
    menu: (provided) => ({
      ...provided,
      zIndex: 10,
    }),
    multiValue: (provided) => ({
      ...provided,
      backgroundColor: "#d1d5db",
      borderRadius: "0.3rem",
    }),
    multiValueLabel: (provided) => ({
      ...provided,
      color: "#1f2937",
      padding: "2px 6px",
    })
  };

  async function onSubmit(e) {
    e.preventDefault();
    setServerError("");
    setLoading(true);

    const username = e.currentTarget.username.value;
    const email = e.currentTarget.email.value;
    const password = e.currentTarget.password.value;
    const confirmPassword = e.currentTarget.confirmPassword.value;

    const city = e.currentTarget.city.value;
    const walkedCities = frequentlyWalkedCities.map((city) => city.value);
    const age = e.currentTarget.age.value;
    const commuteFrequency = e.currentTarget.commuteFrequency.value;
    const referred = e.currentTarget.referred.value;

    const body = {
      username,
      email,
      password,
      confirmPassword,
      city,
      frequentlyWalkedCities: walkedCities,
      age,
      commuteFrequency,
      referred,
    };

    const confirmInput = e.currentTarget.confirmPassword;
    const emailInput = e.currentTarget.email;
    const usernameInput = e.currentTarget.username;
    const passwordInput = e.currentTarget.password;
    const ageInput = e.currentTarget.age;

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
          callbackUrl: `${window.location.origin}/contribute/help`,
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
        } else if (data.message.toLowerCase().includes("age") || data.message.toLowerCase().includes("years old")) {
          ageInput.setCustomValidity(data.message);
          ageInput.reportValidity();
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
            <hr className="my-1 mb-5" />
            <h2 className="text-xl font-bold text-gray-800 mb-6 mt-2">User Demographic</h2>
            <label className="font-bold" htmlFor="city">
              City of Residence
            </label>
            <input
              className="mb-4 p-3.5 block w-full bg-gray-50 placeholder-gray-400 text-gray-900 rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
              type="text"
              placeholder="City of Residence"
              name="city"
              required
            />
            <label className="font-bold mb-2 block" htmlFor="frequentlyWalkedCities">
              Frequently Walked Cities
            </label>
            <CreatableSelect
              isMulti
              options={cityOptions}
              onChange={(selectedOptions) => setFrequentlyWalkedCities(selectedOptions)}
              className="mb-4"
              placeholder="Type and select cities (e.g., Makati, Cebu)"
              styles={customSelectStyles}
            />
            <label className="font-bold" htmlFor="age">
              Age
            </label>
            <input
              className="mb-4 p-3.5 block w-full bg-gray-50 placeholder-gray-400 text-gray-900 rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
              type="number"
              placeholder="Age"
              name="age"
              required
              onInput={(e) => e.target.setCustomValidity("")}
            />
            <fieldset className="border-0 mb-4">
              <legend className="block text-gray-700 mb-2 font-bold">
                How often do you walk in your usual commute?
              </legend>
              <label className="block text-gray-700 font-bold mb-2">
                <input
                  className="mr-2 leading-tight"
                  type="radio"
                  name="commuteFrequency"
                  value="never"
                  required
                />
                <span className="text-sm">Never</span>
              </label>
              <label className="block text-gray-700 font-bold mb-2">
                <input
                  className="mr-2 leading-tight"
                  type="radio"
                  name="commuteFrequency"
                  value="rarely"
                  required
                />
                <span className="text-sm">Rarely</span>
              </label>
              <label className="block text-gray-700 font-bold mb-2">
                <input
                  className="mr-2 leading-tight"
                  type="radio"
                  name="commuteFrequency"
                  value="occasionally"
                />
                <span className="text-sm">Occasionally</span>
              </label>
              <label className="block text-gray-700 font-bold mb-2">
                <input
                  className="mr-2 leading-tight"
                  type="radio"
                  name="commuteFrequency"
                  value="frequently"
                  required
                />
                <span className="text-sm">Frequently</span>
              </label>
              <label className="block text-gray-700 font-bold mb-2">
                <input
                  className="mr-2 leading-tight"
                  type="radio"
                  name="commuteFrequency"
                  value="always"
                  required
                />
                <span className="text-sm">Always</span>
              </label>
            </fieldset>
            <label className="font-bold" htmlFor="city">
              Referred by
            </label>
            <input
              className="mb-4 p-3.5 block w-full bg-gray-50 placeholder-gray-400 text-gray-900 rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
              type="text"
              placeholder="Referred by"
              name="referred"
            />
            <div className="text-xs -mb-2 pb-4 text-gray-600">
              *This is optional. If there is a person or a group who invited you
              to use this platform, indicate his/her username or the name of the
              entity.
            </div>

            <div className="flex items-center mt-8">
              <div className="w-full sm:w-2/3 flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  className="mt-1 mr-3 w-5 h-5 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
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

register.getInitialProps = async (context) => {
  const session = await getSession(context);
  return {
    props: { session },
  };
};
