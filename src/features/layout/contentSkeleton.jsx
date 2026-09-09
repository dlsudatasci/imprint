import { Skeleton, Container } from "@/ui";

/**
 * Page-shaped placeholder shown while a contributor page loads.
 *
 * Generic on purpose: it stands in for whichever signed-in page is still
 * loading, so it matches their common shape — title, lead paragraph, main
 * panel, a row of figures — rather than any one page exactly.
 */
export default function ContentSkeleton() {
  return (
    <Container className="py-16" aria-busy="true">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-10 w-64 max-w-full mb-4" />
      <Skeleton className="h-5 w-96 max-w-full mb-12" />
      <Skeleton className="h-64 w-full mb-8" />
      <div className="flex flex-col sm:flex-row gap-6">
        <Skeleton className="h-28 flex-1" />
        <Skeleton className="h-28 flex-1" />
        <Skeleton className="h-28 flex-1" />
      </div>
    </Container>
  );
}
