/**
 * Route for /privacy — how Imprint collects and handles contributor data.
 *
 * Shares its layout with /terms-of-use (informed consent) through LegalShell,
 * so the two read as a pair. The text is in features/legal/privacyCopy.js,
 * which says where each line comes from (rewritten 16 Oct 2026 to match what
 * Imprint collects and the consent form's commitments).
 */
import Page from '@/ui/page';
import Link from 'next/link';
import { LegalShell, LegalSection } from '@/features/legal';
import { PRIVACY_COPY as COPY } from '@/features/legal/privacyCopy';
import { RESEARCHER_EMAIL } from '@/features/footerMain/footerCopy';

const link = "font-semibold text-primary hover:underline";

export default function PrivacyPolicy() {
    return (
        <Page
            title="Privacy Policy - Imprint"
            description="What Imprint collects, why, how it is protected, and how to have it deleted."
            contribute={false}
        >
            <LegalShell
                title={COPY.title}
                intro={
                    <p>
                        {COPY.intro} {COPY.introConsentLead}{' '}
                        <Link href="/terms-of-use" className={link}>{COPY.introConsentLink}</Link>.
                    </p>
                }
            >
                {COPY.sections.map((section) => (
                    <LegalSection key={section.title} title={section.title}>
                        {section.items && (
                            <ul className="list-disc pl-6 space-y-2 marker:text-subtle">
                                {section.items.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        )}
                        {section.paragraphs?.map((p) => <p key={p}>{p}</p>)}
                        {section.contact && (
                            <p className="mt-4">
                                {section.contact}{' '}
                                <a href={`mailto:${RESEARCHER_EMAIL}`} className={link}>{RESEARCHER_EMAIL}</a>.
                            </p>
                        )}
                    </LegalSection>
                ))}
            </LegalShell>
        </Page>
    );
}
