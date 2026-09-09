/**
 * Route for /privacy — how Imprint collects and handles contributor data.
 *
 * Shares its layout with /terms-of-use through LegalShell, so the two read as
 * a pair. Section content is written inline here rather than fetched.
 */
import Page from '@/ui/page';
import Link from 'next/link';
import { LegalShell, LegalSection } from '@/features/legal';

export default function PrivacyPolicy() {
    return (
        <Page
            title="Privacy Policy - Imprint"
            description="How Imprint collects, uses, and protects the data you provide."
            contribute={false}
        >
            <LegalShell
                title="Privacy Policy"
                intro={
                    <p>
                        This policy explains how the{' '}
                        <Link href="https://dlsucomet.github.io/" target="_blank" className="font-bold text-primary hover:underline">
                            Human-X Interactions Lab
                        </Link>{' '}
                        and its student researchers use and protect the data you provide when you visit and
                        use Imprint. For what participation involves, see the{' '}
                        <Link href="/terms-of-use" className="font-bold text-primary hover:underline">
                            Terms of Use
                        </Link>.
                    </p>
                }
            >
                <LegalSection title="What data Imprint collects">
                    <p className="mb-4">When you visit the website, Imprint may collect the following:</p>
                    <ul className="list-disc pl-6 space-y-2 marker:text-subtle">
                        <li>Your email address and the password you set for this website.</li>
                        <li>Other information such as city of residence, frequently walked cities, age, usage of mobility aids, and frequency of commuting in a public utility vehicle.</li>
                        <li>Your activity on the site, such as the images you annotate and the ratings you give them.</li>
                    </ul>
                </LegalSection>

                <LegalSection title="Why Imprint collects it">
                    <ul className="list-disc pl-6 space-y-2 marker:text-subtle">
                        <li>To better understand the background of our contributors.</li>
                        <li>To support our research on the accessibility of sidewalks in the Philippines.</li>
                    </ul>
                </LegalSection>

                <LegalSection title="How long it is kept">
                    {/* TODO(francis): state the retention period and what happens at the end of it —
                        how long identifiable data is held after the thesis is submitted, whether
                        annotations are retained in anonymised form, and where the dataset is
                        deposited if it is published. This section is required and currently has
                        no answer in it. */}
                    <p>
                        Retention periods for this study are being confirmed and will be published here.
                        In the meantime, you can request deletion of your data at any time using the
                        contact address below.
                    </p>
                </LegalSection>

                <LegalSection title="Safeguarding and securing the data">
                    <p>
                        The student researchers are committed to securing your data and keeping it
                        confidential. They have done all in their power to prevent data theft,
                        unauthorized access, and disclosure by implementing technologies and software
                        that help safeguard the information Imprint collects. The student researchers
                        will not lease, sell, or distribute your personal information to any third
                        party; all of it is used solely for the purpose of this research.
                    </p>
                </LegalSection>

                <LegalSection title="Restricting the collection of your personal data">
                    <p>
                        You may wish to restrict the use and collection of your personal data at any
                        point. If you have already agreed to share your information with us, email{' '}
                        <a href="mailto:francis_bawa@dlsu.edu.ph" className="font-bold text-primary hover:underline">
                            francis_bawa@dlsu.edu.ph
                        </a>{' '}
                        and we will change this for you.
                    </p>
                </LegalSection>
            </LegalShell>
        </Page>
    );
}
