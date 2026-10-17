import { Container, H1, H2, P } from "@/ui";
import GuideStill from "./GuideStill";
import SessionPickerStill from "./SessionPickerStill";
import { GUIDE_COPY as COPY } from "./guideCopy";
import { CATEGORY_GROUPS, SCENE_QUESTIONS, SEVERITY_SCALE } from "./taskFacts";

/**
 * The annotation guide, at /demo for anyone and /contribute/help for
 * contributors.
 *
 * Rewritten 16 Oct 2026 (IMPRINT_public_redesign.md). The old guide was five
 * screen recordings of a tool that has since changed (a 1 to 10 slider, a
 * surface-type step, white boxes, "Others"), each in an accordion. Now it
 * reads like a support article (apple-design): the page's title, a short
 * contents list, then one section per step with the tool's own wording
 * (guideCopy.js) beside a still from the landing page's preview of the task
 * (GuideStill), and a quick reference at the end built from taskFacts.js,
 * which tests check against the tool.
 *
 * Sections are open, not folded: a reader looking something up scrolls or
 * jumps from the contents, and nothing is hidden behind a click.
 */
export default function HelpDirectory() {
  const { reference } = COPY;
  return (
    <Container as="article" className="pt-10 pb-24 lg:pt-14">
      <header className="max-w-3xl">
        <H1>{COPY.title}</H1>
        <P className="mt-4 text-base leading-relaxed md:text-lg">{COPY.lead}</P>
        <nav aria-label={COPY.contentsLabel} className="mt-8">
          <p className="text-xs font-semibold text-muted">{COPY.contentsLabel}</p>
          <ol className="mt-3 flex flex-wrap gap-2">
            {[...COPY.steps, reference].map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors duration-300 hover:border-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <div className="mt-14 space-y-16 lg:space-y-20">
        {COPY.steps.map((step, i) => (
          <section key={step.id} id={step.id} aria-labelledby={`${step.id}-title`} className="scroll-mt-24 grid items-start gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="text-sm font-semibold text-primary tabular-nums">{i + 1}</p>
              <H2 className="mt-1"><span id={`${step.id}-title`}>{step.title}</span></H2>
              {step.paragraphs.map((p) => (
                <P key={p} className="mt-4 text-base leading-relaxed">{p}</P>
              ))}
              {step.listsQuestions && (
                <dl className="mt-6 space-y-3">
                  {SCENE_QUESTIONS.map((q) => (
                    <div key={q.name} className="rounded-card border border-line bg-surface p-4">
                      <dt className="text-sm font-semibold text-ink">{q.name}</dt>
                      <dd className="mt-0.5 text-sm text-muted">{q.prompt}</dd>
                      <dd className="mt-2 text-sm text-body">{q.answers.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {step.still !== undefined && (
              <figure>
                <GuideStill index={step.still} />
                <figcaption className="mt-2 text-xs text-muted">{COPY.stillCaption}</figcaption>
              </figure>
            )}
            {step.picker && (
              <figure>
                <SessionPickerStill />
                <figcaption className="mt-2 text-xs text-muted">{COPY.pickerCaption}</figcaption>
              </figure>
            )}
          </section>
        ))}

        <section id={reference.id} aria-labelledby="reference-title" className="scroll-mt-24 border-t border-line pt-14">
          <H2><span id="reference-title">{reference.title}</span></H2>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="rounded-card border border-line bg-surface p-6">
              <h3 className="font-display text-xl font-bold text-ink">{reference.severityTitle}</h3>
              <ol className="mt-4 space-y-2">
                {SEVERITY_SCALE.map((s) => (
                  <li key={s.value} className="flex items-baseline gap-3 text-sm">
                    <span className="w-5 shrink-0 text-lg font-extrabold text-primary tabular-nums">{s.value}</span>
                    <span className="text-body">{s.label}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-card border border-line bg-surface p-6 lg:col-span-2">
              <h3 className="font-display text-xl font-bold text-ink">{reference.categoriesTitle}</h3>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {CATEGORY_GROUPS.map((g) => (
                  <div key={g.key}>
                    <p className="text-sm font-semibold text-ink">{g.title}</p>
                    <p className="text-xs text-muted">{g.text}</p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {g.labels.map((label) => (
                        <li key={label} className="rounded-full border border-line bg-ground px-2.5 py-1 text-xs font-medium text-ink">{label}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted">{reference.categoriesNote}</p>
            </div>
          </div>
        </section>
      </div>
    </Container>
  );
}
