/**
 * Route for /terms-of-use — what taking part in Imprint involves.
 *
 * Shares its layout with /privacy through LegalShell, so the two read as a
 * pair. Section content is written inline here rather than fetched.
 */
import Page from '@/ui/page';
import Link from 'next/link';
import { LegalShell, LegalSection } from '@/features/legal';

export default function TermsOfUse() {
    return (
        <Page
            title="Terms of Use - Imprint"
            description="The terms you agree to when contributing annotations to Imprint."
            contribute={false}
        >
            <LegalShell
                title="Terms of Use"
                intro={
                    <p>
                        These terms cover what taking part in Imprint involves and what you are agreeing
                        to when you contribute. For what happens to the data you provide, see the{' '}
                        <Link href="/privacy" className="font-bold text-primary hover:underline">
                            Privacy Policy
                        </Link>.
                    </p>
                }
            >
                <LegalSection title="Overview">
                    <p className="mb-4">
                        Imprint is run by the{' '}
                        <Link href="https://dlsucomet.github.io/" target="_blank" className="font-bold text-primary hover:underline">
                            Human-X Interactions Lab
                        </Link>{' '}
                        at De La Salle University. It supports a Master&apos;s thesis by Francis Bawa titled
                        &quot;Leveraging Human-in-the-Loop Crowdsourcing to Support Richer Human Perception
                        Data Collection in Streetscape Evaluation&quot;.
                    </p>
                    {/* TODO(francis): replace the holding paragraph below with the study's
                        objectives — the research question, what the collected annotations are
                        used to test, and the expected output. Left deliberately non-specific
                        rather than paraphrased, so nothing here overstates the study. */}
                    <p>
                        A full description of the study&apos;s objectives is being finalised and will be
                        published on this page. If you have questions before then, please contact the
                        researcher at{' '}
                        <a href="mailto:francis_bawa@dlsu.edu.ph" className="font-bold text-primary hover:underline">
                            francis_bawa@dlsu.edu.ph
                        </a>.
                    </p>
                </LegalSection>

                <LegalSection title="Procedure">
                    <p className="mb-4">Register through the Contribute page, and provide the following:</p>
                    <ul className="list-disc pl-6 space-y-2 mb-6 marker:text-subtle">
                        <li>Username</li>
                        <li>Email address</li>
                        <li>Password</li>
                        <li>Frequently walked cities</li>
                        <li>Age</li>
                        <li>Frequency of walking during your usual commute</li>
                    </ul>

                    <p className="mb-4">
                        After registering, you may continue on to annotate street view images. You are to:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 marker:text-subtle">
                        <li>Select obstructions that can be found along the sidewalk</li>
                        <li>Create new bounding boxes around obstructions that have not yet been annotated</li>
                        <li>Rate the sidewalk accessibility from 1 to 10</li>
                        <li>Determine the surface type of the sidewalk, or if there is no sidewalk present in the image</li>
                    </ul>
                </LegalSection>

                <LegalSection title="Informed Consent">
                    <p className="mb-4">By participating in our study, you agree to the following:</p>
                    <ul className="list-disc pl-6 space-y-2 marker:text-subtle">
                        <li>I agree to participate in the data collection procedure of this study.</li>
                        <li>I have read and understood the background of the research and procedure for the annotation task, as indicated in the overview and procedure section.</li>
                        <li>I acknowledge that I have been provided with the opportunity to ask questions and request for clarifications regarding the research study.</li>
                        <li>I understand that my participation is completely voluntary and that I have the right to withdraw my participation at any time.</li>
                        <li>I understand that all my user data will be kept confidential and will only be used by the proponents of this research.</li>
                    </ul>
                    {/* TODO(francis): add the ethics-review reference here — the reviewing body
                        and approval/protocol number. Participants consenting to a university
                        study should be able to see which committee cleared it. */}
                </LegalSection>

                <LegalSection title="Withdrawing your participation">
                    {/* TODO(francis): describe what withdrawal actually does — whether already
                        submitted annotations are deleted or retained in anonymised form, and how
                        long the request takes to process. */}
                    <p>
                        Your participation is voluntary and you may withdraw at any time. To withdraw,
                        email{' '}
                        <a href="mailto:francis_bawa@dlsu.edu.ph" className="font-bold text-primary hover:underline">
                            francis_bawa@dlsu.edu.ph
                        </a>{' '}
                        from the address associated with your account.
                    </p>
                </LegalSection>
            </LegalShell>
        </Page>
    );
}
