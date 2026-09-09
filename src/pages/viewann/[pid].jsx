import { getServerSession } from "next-auth/next";
import { ObjectId } from "mongodb";

import Page from "@/ui/page";
import AnnotateView from "@/features/annotateView/form";
import { connectToDatabase } from "@/util/mongodb";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { Container } from "@/ui";

export default function ViewAnnotation({ data }) {
  return (
    <Page
      title="View Annotation - Imprint"
      description="Review a sidewalk annotation you submitted."
      contribute={false}
    >
      <Container as="section" className="py-8">
        <h1 className="text-2xl font-bold text-ink mb-4">
          {data.city || "Unknown city"}
        </h1>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 max-w-md mb-8 text-sm">
          <dt className="font-semibold text-muted">Annotated by</dt>
          <dd className="text-ink">{data.username}</dd>
          <dt className="font-semibold text-muted">Accessibility</dt>
          <dd className="text-ink">{data.sceneLevel?.overallAccessibility ?? data.sceneRatings?.accessibility ?? data.accessibilityRating ?? "—"} / 5</dd>
          <dt className="font-semibold text-muted">Surface</dt>
          <dd className="text-ink">{data.pavementType}</dd>
          <dt className="font-semibold text-muted">Date</dt>
          <dd className="text-ink">
            {data.date ? new Date(data.date).toLocaleDateString("en-US") : "—"}
          </dd>
        </dl>

        <AnnotateView
          selectedObjects={data.selectedObjects}
          newObjects={data.newObjects}
          detectedObjects={data.detectedObjects}
          url={data.url}
          id={data.imageID}
          city={data.city}
        />
      </Container>
    </Page>
  );
}

/**
 * Displays one submitted annotation, identified by its id in the URL.
 *
 * Loads the record from the database directly on the server rather than calling
 * /api/getAnnotation. A page calling the app's own API has to know its own
 * address and forward the visitor's cookies, and getting either wrong fails
 * quietly. Querying here avoids both problems and saves a round trip.
 */
export const getServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session?.user?._id) {
    return { redirect: { destination: "/login", permanent: false } };
  }

  const { pid } = context.query;

  if (!pid || Array.isArray(pid) || !ObjectId.isValid(pid)) {
    return { notFound: true };
  }

  try {
    const { db } = await connectToDatabase();

    // Scoped to the signed-in user: annotation ids are guessable, and these
    // records carry someone's username alongside their submission.
    const annotation = await db
      .collection("annotations")
      .findOne({ _id: new ObjectId(pid), userId: session.user._id });

    if (!annotation) return { notFound: true };

    // annotations.imageID stores Image.imageID (a number), not an ObjectId
    const image = await db
      .collection("Image")
      .findOne({ imageID: annotation.imageID });

    if (!image) return { notFound: true };

    return {
      props: {
        data: {
          imageID: annotation.imageID ?? null,
          city: image.city ?? null,
          url: image.url ?? null,
          selectedObjects: annotation.selectedObjectsID ?? [],
          detectedObjects: image.annotationList ?? [],
          newObjects: annotation.newObjects ?? [],
          accessibilityRating: annotation.accessibilityRating ?? null,
          sceneRatings: annotation.sceneRatings ?? null,
          sceneLevel: annotation.sceneLevel ?? null,
          pavementType: annotation.pavementType ?? null,
          username: annotation.username ?? null,
          // Dates don't survive Next's props serialization
          date: annotation.date ? annotation.date.toISOString() : null,
        },
      },
    };
  } catch (error) {
    console.error("Failed to load annotation:", error);
    return { notFound: true };
  }
};
