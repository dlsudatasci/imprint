import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import cities from "@/data/cities.json";

import Page from "@/ui/page";
import { AuthCard, Button, Radio, tokens, Container } from "@/ui";
import { PROFILE_QUESTIONS, optionsFor, buildProfileBody } from "@/features/profile/profileFields";

/**
 * The demographic questions, asked once after signing up.
 *
 * These answers matter to the research: whether someone uses a wheelchair
 * changes what "accessible" means for the same photograph. The form is
 * therefore required, and annotating stays locked until it is finished.
 *
 * Question wording and answer options live in src/features/profile/profileFields.js,
 * built from the same allowlists the server checks, and buildProfileBody sends every
 * field the server requires (a test fails otherwise).
 *
 * The city field records the cities a person often walks in, which drives the
 * city-first image draw for contributors. It accepts new entries rather than
 * offering a fixed list; a city with no matching images simply has no effect on
 * which images get handed out.
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
    const [temporaryMobility, setTemporaryMobility] = useState(null);
    const [educationalAttainment, setEducationalAttainment] = useState(null);
    const [occupation, setOccupation] = useState("");
    const [accessibilityFamiliarity, setAccessibilityFamiliarity] = useState(null);
    const [priorAnnotationExperience, setPriorAnnotationExperience] = useState(null);

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

        const { body, missing } = buildProfileBody({
            frequentlyWalkedCities: frequentlyWalkedCities.map((c) => c.value),
            occupation,
            age: age?.value,
            gender: gender?.value,
            disability: disability?.value,
            temporaryMobility: temporaryMobility?.value,
            educationalAttainment: educationalAttainment?.value,
            accessibilityFamiliarity: accessibilityFamiliarity?.value,
            priorAnnotationExperience: priorAnnotationExperience?.value,
            commuteFrequency: e.currentTarget.commuteFrequency.value,
            walkingFrequency: e.currentTarget.walkingFrequency.value,
        });

        if (missing.length > 0) {
            setServerError(
                missing.every((f) => f === "occupation")
                    ? "Please enter your occupation."
                    : "Please answer every question."
            );
            setLoading(false);
            return;
        }

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

    const selectField = (field, value, onChange, className = "mb-4") => {
        const q = PROFILE_QUESTIONS[field];
        return (
            <>
                <label className="font-semibold text-sm text-ink mb-2 block" htmlFor={field}>
                    {q.label}
                </label>
                {q.hint && <p className="text-xs text-muted -mt-1 mb-2">{q.hint}</p>}
                <Select
                    inputId={field}
                    options={optionsFor(field)}
                    value={value}
                    onChange={onChange}
                    styles={customSelectStyles}
                    className={className}
                    placeholder={q.placeholder}
                />
            </>
        );
    };

    const radioField = (field, className) => (
        <fieldset className={`border-0 ${className}`}>
            <legend className="block text-sm font-semibold text-ink mb-2">
                {PROFILE_QUESTIONS[field].label}
            </legend>
            <div className="space-y-2">
                {optionsFor(field).map((o) => (
                    <Radio key={o.value} name={field} value={o.value} label={o.label} required />
                ))}
            </div>
        </fieldset>
    );

    return (
        <Page title="Complete Profile - Imprint" contribute={false}>
            <Container as="section" className="py-4 my-12 mb-32 flex flex-col items-center justify-center">
                <AuthCard
                    title="Almost there!"
                    subtitle="We just need a few more details to set up your Imprint profile so you can start mapping with us."
                >
                    <form onSubmit={onSubmit}>
                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="frequentlyWalkedCities">
                            {PROFILE_QUESTIONS.frequentlyWalkedCities.label}
                        </label>
                        <p className="text-xs text-muted -mt-1 mb-2">{PROFILE_QUESTIONS.frequentlyWalkedCities.hint}</p>
                        <CreatableSelect
                            inputId="frequentlyWalkedCities"
                            isMulti
                            options={cityOptions}
                            onChange={(selectedOptions) => setFrequentlyWalkedCities(selectedOptions)}
                            className="mb-4"
                            placeholder={PROFILE_QUESTIONS.frequentlyWalkedCities.placeholder}
                            styles={customSelectStyles}
                        />

                        {selectField("age", age, setAge)}
                        {selectField("gender", gender, setGender)}
                        {selectField("disability", disability, setDisability)}
                        {selectField("temporaryMobility", temporaryMobility, setTemporaryMobility)}
                        {selectField("educationalAttainment", educationalAttainment, setEducationalAttainment)}

                        <label className="font-semibold text-sm text-ink mb-2 block" htmlFor="occupation">
                            {PROFILE_QUESTIONS.occupation.label}
                        </label>
                        <input
                            type="text"
                            id="occupation"
                            value={occupation}
                            onChange={(e) => setOccupation(e.target.value)}
                            maxLength={100}
                            placeholder={PROFILE_QUESTIONS.occupation.placeholder}
                            className="w-full mb-4 px-3 py-2.5 text-sm rounded-control border border-line bg-surface-subtle text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />

                        {selectField("accessibilityFamiliarity", accessibilityFamiliarity, setAccessibilityFamiliarity)}
                        {selectField("priorAnnotationExperience", priorAnnotationExperience, setPriorAnnotationExperience, "mb-6")}

                        {radioField("commuteFrequency", "mb-4")}
                        {radioField("walkingFrequency", "mb-8")}

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
