import Page from '@/ui/page';
import HelpDirectory from '@/features/contribute/help';

/**
 * The annotation guide, viewable without an account. Renders the same content
 * that /contribute/help shows to signed-in contributors.
 *
 * Linked from the footer and the About page since 16 Oct 2026, when the guide
 * was rewritten to match the tool (it had been left unlinked while it showed
 * an older version).
 */
export default function DemoPage() {
    return (
        <Page
            title="Annotation guide - Imprint"
            description="How an Imprint session goes, step by step, with the tool's own buttons and questions."
            contribute={false}
        >
            <HelpDirectory />
        </Page>
    );
}
