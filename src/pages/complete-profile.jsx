import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import cities from "./cities.json";

import Page from "@/ui/page";

export default function CompleteProfile() {
    const [loadingForm, setLoading] = useState(false);
    const { data: session, status, update } = useSession();
    const loading = status === "loading";
    const router = useRouter();

    const [serverError, setServerError] = useState("");
    const [frequentlyWalkedCities, setFrequentlyWalkedCities] = useState([]);
    const [age, setAge] = useState(null);
    const [gender, setGender] = useState(null);
    const [disability, setDisability] = useState(null);

    const ageOptions = [
        { value: "16-19", label: "16-19 years" },
        { value: "20-24", label: "20-24 years" },
        { value: "25-29", label: "25-29 years" },
        { value: "30-34", label: "30-34 years" },
        { value: "35-39", label: "35-39 years" },
        { value: "40-44", label: "40-44 years" },
        { value: "45-49", label: "45-49 years" },
        { value: "50-54", label: "50-54 years" },
        { value: "55-59", label: "55-59 years" },
        { value: "60-64", label: "60-64 years" },
        { value: "65+", label: "65 years and over" },
    ];

    const genderOptions = [
        { value: "Male", label: "Male" },
        { value: "Female", label: "Female" },
        { value: "Other", label: "Other" },
        { value: "Prefer not to say", label: "Prefer not to say" },
    ];

    const disabilityOptions = [
        { value: "No", label: "No" },
        { value: "Yes", label: "Yes" },
        { value: "Prefer not to say", label: "Prefer not to say" },
    ];

    useEffect(() => {
        if (!loading && session) {
            // If they somehow landed here but already have a full profile, kick them to contribute
            if (!session.user?.isProfileIncomplete) {
                router.replace("/contribute");
            }
        } else if (!loading && !session) {
            router.replace("/login");
        }
    }, [session, loading, router]);

    const cityOptions = cities.map((city) => ({
        value: city,
        label: city,
    }));

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
            "&:hover": { borderColor: state.isFocused ? "#004aad" : "#e5e7eb" },
        }),
        input: (provided) => ({ ...provided, color: "#111827", margin: 0, padding: 0 }),
        placeholder: (provided) => ({ ...provided, color: "#9ca3af", margin: 0, padding: 0 }),
        menu: (provided) => ({ ...provided, zIndex: 10 }),
        multiValue: (provided) => ({ ...provided, backgroundColor: "#d1d5db", borderRadius: "0.3rem" }),
        multiValueLabel: (provided) => ({ ...provided, color: "#1f2937", padding: "2px 6px" })
    };

    async function onSubmit(e) {
        e.preventDefault();
        setServerError("");
        setLoading(true);

        const walkedCities = frequentlyWalkedCities.map((c) => c.value);
        const ageValue = age?.value;
        const genderValue = gender?.value;
        const disabilityValue = disability?.value;

        if (!ageValue || !genderValue || !disabilityValue) {
            setServerError("Please select an option for all demographic dropdowns.");
            setLoading(false);
            return;
        }
        const commuteFrequency = e.currentTarget.commuteFrequency.value;

        const body = {
            frequentlyWalkedCities: walkedCities,
            age: ageValue,
            gender: genderValue,
            disability: disabilityValue,
            commuteFrequency,
        };

        try {
            const res = await fetch("/api/auth/complete-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (res.status === 200) {
                // Trigger the 'update' event inside NextAuth JWT callback to instantly assign the username securely and silently!
                if (update) {
                    await update({ profileCompleted: true });
                }
                router.replace("/contribute");
            } else {
                setServerError(data.message || "Failed to update profile");
            }
        } catch (error) {
            console.error(error);
            setServerError("An unexpected error occurred. Please try again.");
        }

        setLoading(false);
    }

    // Prevent flash while assessing session
    if (loading || !session?.user?.isProfileIncomplete) return null;

    return (
        <Page title="Complete Profile - Imprint" contribute={false}>
            <section className="container mx-auto p-4 my-12 mb-32 flex flex-col items-center justify-center">
                <div className="w-full sm:w-11/12 md:w-9/12 lg:w-7/12 xl:w-6/12 bg-white rounded-[2rem] shadow-[0_4px_40px_rgb(0,0,0,0.06)] border border-gray-100 p-8 sm:p-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                    <div className="mb-8 relative z-10 text-center">
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Almost there!</h1>
                        <p className="mt-3 text-gray-500 font-medium leading-relaxed">
                            We just need a few more details to set up your Imprint profile so you can start mapping with us.
                        </p>
                    </div>

                    <form onSubmit={onSubmit} className="relative z-10">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 mt-2">User Demographic</h2>

                        <label className="font-bold mb-2 block" htmlFor="frequentlyWalkedCities">What cities do you want to help us assess?</label>
                        <CreatableSelect
                            isMulti
                            options={cityOptions}
                            onChange={(selectedOptions) => setFrequentlyWalkedCities(selectedOptions)}
                            className="mb-4"
                            placeholder="Type and select cities (e.g., Makati, Cebu)"
                            styles={customSelectStyles}
                        />

                        <label className="font-bold" htmlFor="age">Age Group</label>
                        <Select
                            options={ageOptions}
                            value={age}
                            onChange={setAge}
                            styles={customSelectStyles}
                            className="mb-4"
                            placeholder="Select age group"
                        />

                        <label className="font-bold" htmlFor="gender">Gender</label>
                        <Select
                            options={genderOptions}
                            value={gender}
                            onChange={setGender}
                            styles={customSelectStyles}
                            className="mb-4"
                            placeholder="Select gender"
                        />

                        <label className="font-bold" htmlFor="disability">Do you have any mobility impairments or disabilities?</label>
                        <Select
                            options={disabilityOptions}
                            value={disability}
                            onChange={setDisability}
                            styles={customSelectStyles}
                            className="mb-6"
                            placeholder="Select an option"
                        />

                        <fieldset className="border-0 mb-8">
                            <legend className="block text-gray-700 mb-2 font-bold">How often do you walk outdoors in a typical week?</legend>
                            {["Daily", "A few times a week", "Once a week", "Rarely", "Never"].map(freq => (
                                <label key={freq} className="block text-gray-700 font-bold mb-2">
                                    <input className="mr-2 leading-tight" type="radio" name="commuteFrequency" value={freq} required />
                                    <span className="text-sm capitalize">{freq}</span>
                                </label>
                            ))}
                        </fieldset>

                        <div className="flex items-center mt-8">
                            <button
                                className="w-full transition-all duration-500 ease-in-out font-bold py-3.5 px-8 text-lg rounded-[2rem] bg-primary border border-primary text-white hover:bg-opacity-90 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgba(0,74,173,0.3)] disabled:opacity-50"
                                type="submit"
                                disabled={loadingForm}
                            >
                                {loadingForm ? "Finalizing Profile..." : "Complete Setup"}
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
