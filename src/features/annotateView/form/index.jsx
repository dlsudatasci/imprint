import { useSession } from "next-auth/react";
import { ReactPictureAnnotation } from "@/ui/annotation-tool/index";

/**
 * Read-only view of an annotation that has already been submitted.
 *
 * Rebuilds what the contributor saw: the boxes they drew themselves, plus the
 * model's suggestions they confirmed. Rejected suggestions are left out.
 */
export default function AnnotateView({
  selectedObjects = [],
  newObjects = [],
  detectedObjects = [],
  url,
  id,
  city,
}) {
  const { data: session } = useSession();

  const onSelect = () => { };
  const onChange = () => { };

  // annotationSubmit stores selectedObjectsID as whole annotation objects, not
  // bare ids — the old `selectedObjects[x] === detectedObjects[i].id` compared
  // an object to a string and so never matched, silently dropping every
  // confirmed suggestion. Pull the ids out and match on those.
  const confirmedIds = new Set(
    selectedObjects.map((entry) =>
      entry && typeof entry === "object" ? entry.id : entry
    )
  );

  // Build a fresh array; pushing into `newObjects` would mutate the caller's prop
  const annotObjects = [
    ...newObjects,
    ...detectedObjects.filter((box) => confirmedIds.has(box.id)),
  ];

  return (
    <div className="px-5">
      <ReactPictureAnnotation
        image={url}
        onSelect={onSelect}
        onChange={onChange}
        width={640 * 1.5}
        height={400 * 1.5}
        annotationData={annotObjects}
        imageID={id}
        city={city}
        currentAnnotationCount={0}
        username={session?.user?.username ?? ""}
      />
    </div>
  );
}
