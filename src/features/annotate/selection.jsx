import { useRouter } from "next/router";

import H2 from "ui/heading/h2";
import Button from "@/ui/buttons/Button";

export default function AnnotationSessionSelection({ username }) {
  const router = useRouter();

  const setAnnotationSession = async (annotationTotalCount) => {
    const requestBody = {
      annotationTotalCount,
      username,
    };

    const annotationResponse = await fetch("/api/annotationGet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const annotationJson = await annotationResponse.json();

    window.localStorage.setItem(
      "annotationTotalCount",
      JSON.stringify(annotationTotalCount)
    );
    window.localStorage.setItem("annotationCurrentCount", JSON.stringify(1));
    window.localStorage.setItem(
      "annotationSetData",
      JSON.stringify(annotationJson)
    );

    router.reload(window.location.pathname);
  };

  return (
    <section className="container px-5 mx-auto">
      <section className="pb-12 mt-12">
        <div className="flex flex-col border px-12 py-12 my-5 rounded-md shadow-xl mb-64">
          <H2>How many annotations do you want to do for this session?</H2>
          <p className="mt-4 text-[#1d1d1d] pr-20">
            Each image takes, on average, around 1 minute to accomplish. In each
            image you want to annotate, you will be required to identify
            obstructions, rate sidewalk accessibility, and identify the surface
            type. Click on the buttons below on how many images you are willing
            to annotate for the session.{" "}
          </p>
          <hr className="mt-4" />
          <div className="mt-5 flex flex-wrap justify-center">
            <div className="mr-5 mt-4">
              <Button onClick={() => setAnnotationSession(5)}>
                <span className="block px-3 py-3 text-5xl">05</span>
              </Button>
            </div>
            <div className="mr-5 mt-4">
              <Button onClick={() => setAnnotationSession(10)}>
                <span className="block px-3 py-3 text-5xl">10</span>
              </Button>
            </div>
            <div className="mr-5 mt-4">
              <Button onClick={() => setAnnotationSession(20)}>
                <span className="block px-3 py-3 text-5xl">20</span>
              </Button>
            </div>
            <div className="mt-4">
              <Button onClick={() => setAnnotationSession(40)}>
                <span className="block px-3 py-3 text-5xl">40</span>
              </Button>
            </div>
          </div>

        </div>
      </section>
    </section>
  );
}
