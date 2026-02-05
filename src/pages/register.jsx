import { useState, useEffect } from "react";
import { getSession, signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import CreatableSelect from "react-select/creatable";
import cities from "./cities.json";

import Page from "@/ui/page";
import { H1 } from "@/ui/Typography";
import { H2 } from "@/ui/Typography";

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
      backgroundColor: "#f3f4f6",
      borderRadius: "0.25rem",
      borderWidth: "2px",
      borderStyle: "solid",
      borderColor: state.isFocused ? "#015fcc" : "transparent",
      boxShadow: "none",
      minHeight: "2.5rem",
      alignItems: "center",
      "&:hover": {
        borderColor: state.isFocused ? undefined : "transparent",
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
        console.log("success");
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
      <section className="container mx-auto p-4 my-12 mb-32 bg-offwhite flex flex-col items-center justify-center">
        <div className="w-10/12 sm:w-8/12 md:w-6/12 lg:w-5/12 xl:w-5/12 mb-4">
          <H1>Register to Imprint!</H1>
          <p className="mt-5">
            Already have an account?
            <Link href="/login">
              <span className="text-sm ml-2 font-bold text-primary hover:underline cursor-pointer">
                Login Here
              </span>
            </Link>
          </p>
        </div>
        <form
          onSubmit={onSubmit}
          className="w-10/12 sm:w-8/12 md:w-6/12 lg:w-5/12 xl:w-5/12 mb-6"
        >
          <H2 className="mb-4">User Credentials</H2>
          <label className="font-bold" htmlFor="username">
            Username
          </label>
          <input
            className="mb-4 p-2 appearance-none block w-full bg-gray-100 placeholder-gray-400 rounded border focus:border-primary"
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
            className="mb-4 p-2 appearance-none block w-full bg-gray-100 placeholder-gray-400 rounded border focus:border-primary"
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
            className="mb-4 p-2 appearance-none block w-full bg-gray-100 placeholder-gray-400 rounded border focus:border-primary"
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
            className="mb-4 p-2 appearance-none block w-full bg-gray-100 placeholder-gray-400 rounded border focus:border-primary"
            type="password"
            placeholder="Confirm Password"
            name="confirmPassword"
            required
            onInput={(e) => e.target.setCustomValidity("")}
          />
          <hr className="my-1 mb-5" />
          <H2 className="mb-4">User Demographic</H2>
          <label className="font-bold" htmlFor="city">
            City of Residence
          </label>
          <input
            className="mb-4 p-2 appearance-none block w-full bg-gray-100 placeholder-gray-400 rounded border focus:border-primary"
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
            className="mb-4 p-2 appearance-none block w-full bg-gray-100 placeholder-gray-400 rounded border focus:border-primary"
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
            className="mb-4 p-2 appearance-none block w-full bg-gray-100 placeholder-gray-400 rounded border focus:border-primary"
            type="text"
            placeholder="Referred by"
            name="referred"
          />
          <div className="text-xs -mb-2 pb-4 text-gray-600">
            *This is optional. If there is a person or a group who invited you
            to use this platform, indicate his/her username or the name of the
            entity.
          </div>

          <div className="flex items-center mt-6 ">
            <div className="w-2/3 flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                className="mt-1 mr-2"
                required
              />
              <label htmlFor="remember-me">
                I have read the{" "}
                <Link
                  href="/terms-of-use"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer py-2 px-0 text-black inline-block underline"
                >
                  Terms of Use
                </Link>
              </label>
            </div>
            <button
              className="ml-auto w-1/3 bg-accent text-white p-2 rounded font-semibold hover:bg-gray-900"
              type="submit"
              disabled={loadingForm}
            >
              {loadingForm ? "Loading..." : "Submit"}
            </button>
          </div>

          {serverError ? (
            <div className="text-xs -mb-2 pb-4 text-red-600">
              {serverError}
            </div>
          ) : (
            <div />
          )}
        </form>
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
