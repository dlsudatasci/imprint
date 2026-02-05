import Page from '@/ui/page';
import H1 from '@/ui/heading/h1';
import HelpDirectory from 'features/contribute/help';

export default function DemoPage() {
    return (
        <Page
            title="Help - Imprint Contribute"
            description="Learn more how to use Imprint as a crowdsourcing platform."
            contribute={false}
        >
            <section className="container mx-auto px-5">
                <H1><span className="font-bold text-primary">Imprint</span> Annotation Guide</H1>
            </section>
            <HelpDirectory />
        </Page>
    );
}
