import Page from '@/ui/page';
import { H1 } from '@/ui/Typography';
import { H2 } from '@/ui/Typography';
// import { H3 } from '@/ui/Typography';
import { P } from '@/ui/Typography';
// CAN DELETE THIS PAGE
export default function Index() {
    return (
        <Page
            title="Terms of Service - Imprint"
            description="This is our Terms of Service for using Imprint."
            contribute={false}
        >
            <section className='container mx-auto px-5'>
                <H1> Terms of Service </H1>
                <br />
                <H2> heading </H2>
                <P> this our Terms of Service etc etc.</P>
                <br />
            </section>
        </Page>
    );
}
