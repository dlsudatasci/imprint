import { H1, Container } from "@/ui";
import Page from '@/ui/page';
import HelpDirectory from '@/features/contribute/help';

/**
 * The annotation guide, viewable without an account. Renders the same content
 * that /contribute/help shows to signed-in contributors.
 *
 * Not linked from the navbar at present, so it is reachable only by its URL.
 */
export default function DemoPage() {
    return (
        <Page
            title="Help - Imprint Contribute"
            description="Learn more how to use Imprint as a crowdsourcing platform."
            contribute={false}
        >
            <Container as="section">
                <H1><span className="font-bold text-primary">Imprint</span> Annotation Guide</H1>
            </Container>
            <HelpDirectory />
        </Page>
    );
}
