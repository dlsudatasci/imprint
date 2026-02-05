import P from "ui/heading/p";
import HelpItem from "./helpItem";

export default function HelpDirectory() {
  return (
    <section className="container mx-auto my-12 max-w-screen-xl px-4 py-1">
      <HelpItem heading="Starting a new Annotation Session">
        <div className="flex flex-col">
          <div className="gifContainer border-black border-4 self-center">
            <img src="/images/help/how_to_annotate.gif" alt="How to annotate" />
          </div>
          <div className="mt-4 text-lg max-w-3xl mx-auto px-4">
            <P>1. Open your dashboard.</P>
            <P>2. Click on <b>&quot;Start Annotating&quot;</b>.</P>
            <P>3. Select the number of annotations you are willing to do for the session.</P>
          </div>
        </div>
      </HelpItem>

      <HelpItem heading="Classifying Obstructions">
        <div className="flex flex-col">
          <div className="gifContainer border-black border-4 self-center">
            <img src="/images/help/classify_obstruction.gif" alt="Classify obstructions" />
          </div>
          <div className="mt-4 text-lg max-w-3xl mx-auto px-4">
            <P className="mb-2">
              We classify <b>&quot;obstructions&quot;</b> as objects that <b>block the pathway</b> for a pedestrian to easily walk along the sidewalk.
            </P>
            <P>1. Click on the <b>white boxes</b> that you think are blocking the sidewalk.</P>
            <P>2. If the object blocks the pathway, select <b>&quot;Yes&quot;</b>; otherwise, select <b>&quot;No&quot;</b>.</P>
            <P>3. The object appears on the <b>&quot;Selected Obstructions&quot;</b> list if you selected "Yes".</P>
          </div>
        </div>
      </HelpItem>

      <HelpItem heading="Labeling New Obstructions">
        <div className="flex flex-col">
          <div className="gifContainer border-black border-4 self-center">
            <img src="/images/help/label_obstruction.gif" alt="Label new obstructions" />
          </div>
          <div className="mt-4 text-lg max-w-3xl mx-auto px-4">
            <P className="mb-2">
              If you see an obstruction <b>without a bounding box</b>, label it as an <b>obstruction</b>.
            </P>
            <P>1. <b>Draw a box</b> by clicking and dragging from top-left to bottom-right.</P>
            <P>2. Choose the object type; if missing, pick <b>&quot;Others&quot;</b>.</P>
            <P>3. Click the <b>&quot;check mark&quot;</b> to confirm, or <b>&quot;trash bin&quot;</b> to delete.</P>
            <P className="mb-2">4. It will appear on the <b>&quot;New Obstructions&quot;</b> list.</P>
          </div>
        </div>
      </HelpItem>

      <HelpItem heading="Rating Sidewalk Accessibility">
        <div className="flex flex-col">
          <div className="gifContainer border-black border-4 self-center">
            <img src="/images/help/Rating Accessibility.gif" alt="Rating accessibility" />
          </div>
          <div className="mt-4 text-lg max-w-3xl mx-auto px-4">
            <P>1. Drag the slider to set the sidewalk's accessibility rating.</P>
            <P>2. A rating of 1 means the sidewalk is <b>unsafe and inaccessible</b>.</P>
            <P>3. A rating of 10 means it is <b>safe and accessible</b>.</P>
          </div>
        </div>
      </HelpItem>

      <HelpItem heading="Determining Surface Type">
        <div className="flex flex-col">
          <div className="gifContainer border-black border-4 self-center">
            <img src="/images/help/Sidewalk Type.gif" alt="Surface type" />
          </div>
          <div className="mt-4 text-lg max-w-3xl mx-auto px-4">
            <P>1. Select the image that <b>best describes the surface type</b> of the sidewalk.</P>
            <P>2. If there's no sidewalk, select <b>&quot;No Sidewalk&quot;</b>.</P>
          </div>
        </div>
      </HelpItem>
    </section>
  );
}
