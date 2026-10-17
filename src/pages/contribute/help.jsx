/**
 * Route for /contribute/help — the annotation guide for signed-in
 * contributors. The same guide is available publicly at /demo.
 */
import Page from '@/ui/page';
import HelpDirectory from '@/features/contribute/help';

export default function ContributePage() {
  return (
    <Page
      title="Annotation guide - Imprint"
      description="How an Imprint session goes, step by step, with the tool's own buttons and questions."
      contribute
    >
      <HelpDirectory />
    </Page>
  );
}
