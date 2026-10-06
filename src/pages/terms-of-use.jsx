/**
 * Route for /terms-of-use — informed consent form for study participation.
 *
 * Shares its layout with /privacy through LegalShell, so the two read as a
 * pair. Section content is written inline here rather than fetched.
 */
import Page from '@/ui/page';
import Link from 'next/link';
import { LegalShell, LegalSection } from '@/features/legal';

export default function InformedConsent() {
    return (
        <Page
            title="Informed Consent - Imprint"
            description="The informed consent form you agree to when contributing annotations to Imprint."
            contribute={false}
        >
            <LegalShell
                title="Informed Consent Form"
                intro={
                    <p>
                        This consent form is presented electronically during registration on the
                        IMPRINT platform. A contributor must read it and select &quot;I have read
                        and understood this form and agree to participate&quot; before annotation
                        is unlocked. No data beyond the registration account is collected until
                        consent is given. For what happens to the data you provide, see the{' '}
                        <Link href="/privacy" className="font-bold text-primary hover:underline">
                            Privacy Policy
                        </Link>.
                    </p>
                }
            >
                <LegalSection title="Study Title">
                    <p>
                        Leveraging Human-in-the-Loop Crowdsourcing for Richer Perception Data
                        in Streetscape Evaluation
                    </p>
                </LegalSection>

                <LegalSection title="Invitation">
                    <p>
                        You are invited to take part in a research study. Participation is
                        entirely voluntary. Please read this form carefully and take as much
                        time as you need to decide. You may ask the researcher any question
                        before agreeing.
                    </p>
                </LegalSection>

                <LegalSection title="Purpose of the Study">
                    <p>
                        This study investigates how a crowdsourcing platform that provides
                        artificial intelligence (AI) assistance shapes the experience of
                        annotating pedestrian obstructions in street-level images, and how
                        the annotations collected can be used to improve an automated
                        obstruction model. Your contributions help build data on sidewalk
                        accessibility in Metro Manila.
                    </p>
                </LegalSection>

                <LegalSection title="Who May Participate">
                    <p>
                        You may participate if you are at least 18 years of age, have basic
                        computer literacy, and have access to a desktop or laptop web browser.
                        No prior experience in computer vision, mapping, or accessibility
                        assessment is required.
                    </p>
                </LegalSection>

                <LegalSection title="What Participation Involves">
                    <p className="mb-4">If you agree, you will:</p>
                    <ul className="list-disc pl-6 space-y-2 marker:text-subtle">
                        <li>create an account and complete a short demographic profile;</li>
                        <li>complete a brief guided tutorial on how to use the annotation interface;</li>
                        <li>
                            annotate street-level images by marking obstructions, judging whether
                            each object blocks pedestrian movement, rating severity, and answering
                            scene-level questions about the sidewalk;
                        </li>
                        <li>
                            complete a short workload questionnaire (the NASA Task Load Index)
                            after selected sessions; and
                        </li>
                        <li>
                            optionally complete a brief exit questionnaire at the end of the study.
                        </li>
                    </ul>
                    <p className="mt-4">
                        You participate remotely, at times of your own choosing, for as long
                        and as often as you wish over the study period of approximately eight
                        weeks.
                    </p>
                </LegalSection>

                <LegalSection title="Time Commitment">
                    <p>
                        Participation is self-directed and open-ended. You choose how many
                        images to annotate in each session and how often to return. There is
                        no minimum or maximum, and there is no fixed endpoint to your
                        involvement other than the close of the study period.
                    </p>
                </LegalSection>

                <LegalSection title="Voluntary Participation and Right to Withdraw">
                    <p>
                        Your participation is voluntary. You may stop at any time, without
                        notifying the researcher and without giving a reason. Stopping carries
                        no penalty or consequence of any kind. You may also request that your
                        data be deleted at any time by contacting the researcher, and your data
                        will be removed unless it has already been irreversibly aggregated for
                        analysis.
                    </p>
                </LegalSection>

                <LegalSection title="Risks and Discomforts">
                    <p>
                        The risks of participation are minimal and no greater than those of
                        ordinary computer use. Extended annotation may cause mild eye strain or
                        fatigue; you are free to rest or stop at any point. You will not be
                        shown any distressing content, and the imagery contains no identifiable
                        people, as faces and vehicle license plates are automatically blurred by
                        the image provider before publication.
                    </p>
                </LegalSection>

                <LegalSection title="Benefits">
                    <p>
                        There is no direct personal benefit to you. Your contributions support
                        research on sidewalk accessibility and may inform future planning and
                        accessibility efforts in Metro Manila.
                    </p>
                </LegalSection>

                <LegalSection title="Compensation">
                    <p>
                        This is a volunteer study. You will not receive payment or any other
                        compensation for participating.
                    </p>
                </LegalSection>

                <LegalSection title="Confidentiality and Data Handling">
                    <p className="mb-4">Your privacy is protected as follows:</p>
                    <ul className="list-disc pl-6 space-y-2 marker:text-subtle">
                        <li>
                            You are identified only by a pseudonymous identifier. No personally
                            identifying information is attached to your annotations or activity
                            logs.
                        </li>
                        <li>
                            Your demographic responses are stored separately from your annotation
                            and interaction data and are linked only through that pseudonymous
                            identifier.
                        </li>
                        <li>
                            The data collected includes your annotations, the interface actions
                            you take, the time you spend, and your questionnaire responses.
                        </li>
                        <li>
                            All data is stored on university-managed infrastructure and retained
                            only for the duration of the study and its subsequent analysis.
                        </li>
                        <li>
                            Results will be reported in aggregate in a thesis and any resulting
                            publications. No individual contributor will be identifiable in any
                            output.
                        </li>
                        <li>
                            The annotations you produce may form part of a research dataset used
                            in future accessibility research, in de-identified form.
                        </li>
                    </ul>
                </LegalSection>

                <LegalSection title="Withholding of Certain Study Details">
                    <p>
                        To keep your responses natural, some specifics of the study are not
                        described in full here. This does not affect your safety or your data
                        in any way. A complete explanation (a debriefing statement) will be
                        sent to all enrolled contributors at the end of the study.
                    </p>
                </LegalSection>

                <LegalSection title="Questions and Contacts">
                    <p>
                        If you have questions about the study, you may contact the researcher,
                        Francis Bawa, at{' '}
                        <a href="mailto:francis_bawa@dlsu.edu.ph" className="font-bold text-primary hover:underline">
                            francis_bawa@dlsu.edu.ph
                        </a>.
                    </p>
                </LegalSection>

                <LegalSection title="Consent Declaration">
                    <p className="mb-4">
                        By selecting &quot;I have read and understood this form and agree to
                        participate,&quot; you confirm that:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 marker:text-subtle">
                        <li>you are at least 18 years of age;</li>
                        <li>you have read and understood this form;</li>
                        <li>your questions, if any, have been answered; and</li>
                        <li>
                            you agree to participate voluntarily and understand that you may
                            withdraw at any time without penalty.
                        </li>
                    </ul>
                </LegalSection>
            </LegalShell>
        </Page>
    );
}
