import { ReactPictureAnnotation } from "./react-picture-annotation/index";
import H1 from "ui/heading/h1";
import Button from "@/ui/buttons/Button";
import Link from "next/link";
import { getSession, useSession } from "next-auth/react";

export default function AnnotateForm({ data, current, total }) {
  const onSelect = (selectedId) => { };
  const onChange = (data) => { };
  const { data: session, status } = useSession();
  const loading = status === "loading";

  if (typeof window !== "undefined" && loading) return null;

  return (
    <div className="px-5">
      <div className="flex flex-row mb-12 justify-between">
        <H1>
          <span className="text-2xl uppercase font-thin">
            Currently Annotating:
          </span>
          <br /> Image #{current} / {total}
        </H1>
      </div>

      <ReactPictureAnnotation
        image={data.url}
        onSelect={onSelect}
        onChange={onChange}
        width={640 * 1.5}
        height={400 * 1.5}
        annotationData={data.annotationList}
        imageID={data.imageID}
        city={data.city}
        currentAnnotationCount={current}
        username={session.user.username}
      />
    </div>
  );
}

AnnotateForm.getInitialProps = async (context) => {
  const session = await getSession(context);
  return {
    session,
  };
};
