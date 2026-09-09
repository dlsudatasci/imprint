import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import cities from "@/data/cities.json";

import Page from "@/ui/page";
import { AuthCard, Button, tokens, Container } from "@/ui";

/**
 * The demographic questions, asked once after signing up.
 *
 * These answers matter to the research: whether someone uses a wheelchair
 * changes what "accessible" means for the same photograph. The form is
 * therefore required, and annotating stays locked until it is finished.
 *
 * The city field accepts new entries rather than offering a fixed list. The
 * dataset will grow beyond the cities currently in cities.json, and knowing
 * where people want to map is useful before imagery exists there. A city with
 * no matching images simply has no effect on which images get handed out.
 */
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
    const [educationalAttainment, setEducationalAttainment] = useState(null);
    const [occupation, setOccupation] = useState("");
    const [accessibilityFamiliarity, setAccessibilityFamiliarity] = useState(null);
    const [priorAnnotationExperience, setPriorAnnotationExperience] = useState(null);

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

    const educationOptions = [
        { value: "High school", label: "High school" },
        { value: "Some college", label: "Some college" },
        { value: "Bachelor's", label: "Bachelor's" },
        { value: "Master's", label: "Master's" },
        { value: "Doctorate", label: "Doctorate" },
        { value: "Other", label: "Other" },
        { value: "Prefer not to say", label: "Prefer not to say" },
    ];

    const accessibilityFamiliarityOptions = [
        { value: "Very familiar", label: "Very familiar" },
        { value: "Somewhat familiar", label: "Somewhat familiar" },
        { value: "Slightly familiar", label: "Slightly familiar" },
        { value: "Not at all familiar", label: "Not at all familiar" },
    ];

    const annotationExperienceOptions = [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
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

    // react-select builds styles in JS, so it can't use a Tailwind class.
    // Values come from the token module rather than being retyped as hex —
    // see AUDIT.md F5, which found this object hard-coding the brand blue.
    const customSelectStyles = {
        control: (provided, state) => ({
            ...provided,
            backgroundColor: tokens.color.surfaceSubtle,
            borderRadius: tokens.radius.control,
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: state.isFocused ? tokens.color.primary : tokens.color.line,
            boxShadow: state.isFocused ? `0 0 0 2px rgba(0, 74, 173, 0.2)` : "none",
            minHeight: "3.2rem",
            padding: "0.2rem 0.5rem",
            alignItems: "center",
            transition: `all ${tokens.duration.base}ms ease`,
            "&:hover": {
                borderColor: state.isFocused ? tokens.color.primary : tokens.color.line,
            },
        }),
        input: (provided) => ({ ...provided, color: tokens.color.ink, margin: 0, padding: 0 }),
        placeholder: (provided) => ({ ...provided, color: tokens.color.subtle, margin: 0, padding: 0 }),
        menu: (provided) => ({ ...provided, zIndex: 10 }),
        multiValue: (provided) => ({
            ...provided,
            backgroundColor: tokens.color.primary100,
            borderRadius: tokens.radius.control,
        }),
        multiValueLabel: (provided) => ({ ...provided, color: tokens.color.primary, padding: "2px 6px" }),
    };

    async function onSubmit(e) {
        e.preventDefault();
        setServerError("");
        setLoading(true);

        const walkedCities = frequentlyWalkedCities.map((c) => c.value);
        const ageValue = age?.value;
        const genderValue = gender?.value;
        const disabilityValue = disability?.value;
        const educationValue = educationalAttainment?.value;
        const accessibilityValue = accessibilityFamiliarity?.value;
        const annotationExpValue = priorAnnotationExperience?.value;

        if (!ageValue || !genderValue || !disabilityValue || !educationValue || !accessibilityValue || !annotationExpValue) {
            setServerError("Please select an option for all required dropdowns.");
            setLoading(false);
            return;
        }
        if (!occupation.trim()) {
            setServerError("Please enter your occupation.");
            setLoading(false);
            return;
        }
        const commuteFrequency = e.currentTarget.commuteFrequency.value;
        const walkingFrequency = e.currentTarget.walkingFrequency.value;

        const body = {
            frequentlyWalkedCities: walkedCities,
            age: ageValue,
            gender: genderValue,
            disability: disabilityValue,
            commuteFrequency,
            educationalAttainment: educationValue,
            occupation: occupation.trim(),
            walkingFrequency,
            accessibilityFamiliarity: accessibilityValue,
            priorAnnotationExperience: annotationExpValue,
        };

        try {
            const res = await fetch("/api/auth/complete-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (res.status === 200) {
                // Push the change into the JWT. Without this the token still
                // says isProfileIncomplete and the dashboard would send them
                // straight back here — the session isn't re-read per request.
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
            <Container as="section" className="py-4 my-12 mb-32 flex flex-col items-center justify-center">
                <AuthCard
                    title="Almost there!"
                    subtitle="We just need a few more details to set up your Imprint profile so you can start mapping with us."
                >
                    <form onSubmit={onSubmit}>
                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="frequentlyWalkedCities">
                            What cities do you want to help us assess?
                        </label>
                        <CreatableSelect
                            isMulti
                            options={cityOptions}
                            onChange={(selectedOptions) => setFrequentlyWalkedCities(selectedOptions)}
                            className="mb-4"
                            placeholder="Type and select cities (e.g., Makati, Cebu)"
                            styles={customSelectStyles}
                        />

                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="age">Age Group</label>
                        <Select
                            options={ageOptions}
                            value={age}
                            onChange={setAge}
                            styles={customSelectStyles}
                            className="mb-4"
                            placeholder="Select age group"
                        />

                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="gender">Gender</label>
                        <Select
                            options={genderOptions}
                            value={gender}
                            onChange={setGender}
                            styles={customSelectStyles}
                            className="mb-4"
                            placeholder="Select gender"
                        />

                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="disability">
                            Do you have any mobility impairments or disabilities?
                        </label>
                        <Select
                            options={disabilityOptions}
                            value={disability}
                            onChange={setDisability}
                            styles={customSelectStyles}
                            className="mb-4"
                            placeholder="Select an option"
                        />

                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="educationalAttainment">
                            Highest level of education
                        </label>
                        <Select
                            options={educationOptions}
                            value={educationalAttainment}
                            onChange={setEducationalAttainment}
                            styles={customSelectStyles}
                            className="mb-4"
                            placeholder="Select education level"
                        />

                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="occupation">
                            Occupation
                        </label>
                        <input
                            type="text"
                            id="occupation"
                            value={occupation}
                            onChange={(e) => setOccupation(e.target.value)}
                            maxLength={100}
                            placeholder="e.g. Student, Engineer, Teacher"
                            className="w-full mb-4 px-3 py-2.5 text-sm rounded-control border border-line bg-surface-subtle text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />

                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="accessibilityFamiliarity">
                            How familiar are you with accessibility issues?
                        </label>
                        <Select
                            options={accessibilityFamiliarityOptions}
                            value={accessibilityFamiliarity}
                            onChange={setAccessibilityFamiliarity}
                            styles={customSelectStyles}
                            className="mb-4"
                            placeholder="Select familiarity level"
                        />

                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="priorAnnotationExperience">
                            Do you have prior experience with image or data annotation?
                        </label>
                        <Select
                            options={annotationExperienceOptions}
                            value={priorAnnotationExperience}
                            onChange={setPriorAnnotationExperience}
                            styles={customSelectStyles}
                            className="mb-6"
                            placeholder="Select an option"
                        />

                        <fieldset className="border-0 mb-4">
                            <legend className="block text-sm font-semibold text-ink mb-2">
                                How often do you walk outdoors in a typical week?
                            </legend>
                            {["Daily", "A few times a week", "Once a week", "Rarely", "Never"].map(freq => (
                                <label key={freq} className="block text-body font-medium mb-2 cursor-pointer">
                                    <input className="mr-2 leading-tight" type="radio" name="commuteFrequency" value={freq} required />
                                    <span className="text-sm capitalize">{freq}</span>
                                </label>
                            ))}
                        </fieldset>

                        <fieldset className="border-0 mb-8">
                            <legend className="block text-sm font-semibold text-ink mb-2">
                                How often do you walk specifically for exercise or leisure?
                            </legend>
                            {["Daily", "Several times a week", "Once a week", "A few times a month", "Rarely", "Never"].map(freq => (
                                <label key={freq} className="block text-body font-medium mb-2 cursor-pointer">
                                    <input className="mr-2 leading-tight" type="radio" name="walkingFrequency" value={freq} required />
                                    <span className="text-sm capitalize">{freq}</span>
                                </label>
                            ))}
                        </fieldset>

                        <Button submit fullWidth disabled={loadingForm}>
                            {loadingForm ? "Finalizing Profile..." : "Complete Setup"}
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
