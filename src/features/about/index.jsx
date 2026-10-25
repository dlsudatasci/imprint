import Image from "next/image";
import Link from "next/link";
import { Display, Headline, H2, P, Container, cn } from "@/ui";
import ClosingSection from "@/features/home/ClosingSection";
import { CATEGORY_GROUPS, SCENE_QUESTIONS } from "@/features/contribute/help/taskFacts";
import { RESEARCHER_EMAIL } from "@/features/footerMain/footerCopy";
import { ABOUT_COPY as COPY } from "./aboutCopy";

/**
 * The About page: what Imprint is, why a person's own view of a sidewalk
 * matters, how the task goes, what a volunteer records, and who runs it.
 *
 * Rewritten 16 Oct 2026 (IMPRINT_public_redesign.md) in general terms, like
 * the page before it. aboutCopy.js names what was wrong on the old page and
 * where each replacement comes from.
 *
 * Laid out as long-form reading (apple-design): a display heading, one idea
 * per section, generous space, border-led surfaces (design system D6), and
 * the landing page's join card at the end. Entirely static, no data and no
 * session, apart from the join card's button.
 */

const sectionY = "py-16 lg:py-24";
const eyebrow = "text-sm font-semibold text-primary";
const link = "font-semibold text-primary hover:underline rounded-control focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function Photo({ src, alt, className }) {
  return (
    <div className={cn("relative w-full overflow-hidden rounded-modal border border-line bg-surface-subtle aspect-[4/3]", className)}>
      <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
    </div>
  );
}

export default function AboutSection() {
  return (
    <>
      {/* Hero */}
      <Container as="section" aria-labelledby="about-title" className="pt-16 pb-8 text-center lg:pt-24">
        <div className="mx-auto max-w-4xl">
          <p className={eyebrow}>{COPY.eyebrow}</p>
          <Display id="about-title" className="mt-4">{COPY.title}</Display>
          <P className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed md:text-xl">{COPY.lead}</P>
        </div>
      </Container>

      {/* Why obstructions */}
      <Container as="section" aria-labelledby="about-problem" className={sectionY}>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Photo src="/images/about/theWhy.jpg" alt={COPY.problem.imageAlt} />
          <div>
            <Headline id="about-problem">{COPY.problem.title}</Headline>
            {COPY.problem.paragraphs.map((p) => (
              <P key={p} className="mt-5 text-base leading-relaxed md:text-lg">{p}</P>
            ))}
          </div>
        </div>
      </Container>

      {/* Person-dependent */}
      <section aria-labelledby="about-person">
        <Container width="reading" className={cn(sectionY, "text-center")}>
          <Headline id="about-person">{COPY.person.title}</Headline>
          <P className="mx-auto mt-6 max-w-2xl text-base leading-relaxed md:text-lg">{COPY.person.text}</P>
          <figure className="mx-auto mt-10 max-w-xl">
            <div className="grid grid-cols-2 gap-3 text-left">
              {COPY.person.examples.map((e) => (
                <div key={e.who} className="rounded-card border border-line bg-surface p-4">
                  <p className="text-xs font-semibold text-muted">{e.who}</p>
                  <p className="mt-1 font-display text-lg font-bold text-ink">{e.answer}</p>
                </div>
              ))}
            </div>
            <figcaption className="mt-3 text-xs text-muted">{COPY.person.exampleCaption}</figcaption>
          </figure>
        </Container>
      </section>

      {/* How it works */}
      <Container as="section" aria-labelledby="about-steps" className={sectionY}>
        <Headline id="about-steps" className="text-center">{COPY.steps.title}</Headline>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COPY.steps.items.map((s, i) => (
            <li key={s.title} className="rounded-card border border-line bg-surface p-6">
              <p className="text-3xl font-extrabold tracking-[-0.03em] text-primary tabular-nums" aria-hidden="true">{i + 1}</p>
              <h3 className="mt-4 font-display text-xl font-bold text-ink">{s.title}</h3>
              <P className="mt-2 leading-relaxed">{s.text}</P>
            </li>
          ))}
        </ol>
        <p className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <Link href="/#how-it-works" className={link}>{COPY.steps.previewLink}</Link>
          <Link href="/demo" className={link}>{COPY.steps.guideLink}</Link>
        </p>
      </Container>

      {/* What you record */}
      <section aria-labelledby="about-record">
        <Container className={sectionY}>
          <div className="mx-auto max-w-3xl text-center">
            <Headline id="about-record">{COPY.record.title}</Headline>
            <P className="mt-6 text-base leading-relaxed md:text-lg">{COPY.record.intro}</P>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {CATEGORY_GROUPS.map((g) => (
              <div key={g.key} className="rounded-card border border-line bg-surface p-6">
                <h3 className="font-display text-xl font-bold text-ink">{g.title}</h3>
                <p className="mt-1 text-sm text-muted">{g.text}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {g.labels.map((label) => (
                    <li key={label} className="rounded-full border border-line bg-ground px-3 py-1 text-sm font-medium text-ink">{label}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">{COPY.record.other} {COPY.record.surface}</p>

          <h3 className="mt-16 text-center font-display text-2xl font-bold text-ink">{COPY.record.questionsTitle}</h3>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SCENE_QUESTIONS.map((q) => (
              <div key={q.name} className="rounded-card border border-line bg-surface p-5">
                <dt className="text-sm font-semibold text-ink">{q.name}</dt>
                <dd className="mt-1 text-sm text-muted">{q.prompt}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* Photos and taking part */}
      <Container as="section" aria-label={`${COPY.photos.title}, ${COPY.join.title}`} className={sectionY}>
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <H2>{COPY.photos.title}</H2>
            <P className="mt-4 text-base leading-relaxed md:text-lg">{COPY.photos.text}</P>
          </div>
          <div>
            <H2>{COPY.join.title}</H2>
            <P className="mt-4 text-base leading-relaxed md:text-lg">{COPY.join.text}</P>
          </div>
        </div>
      </Container>

      {/* Team */}
      <Container as="section" aria-labelledby="about-team" className="pb-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Photo src="/images/about/theWho.jpg" alt={COPY.team.imageAlt} />
          <div>
            <Headline id="about-team">{COPY.team.title}</Headline>
            <P className="mt-5 text-base leading-relaxed md:text-lg">{COPY.team.text}</P>
            <P className="mt-4 text-base leading-relaxed md:text-lg">
              {COPY.team.contact}{" "}
              <a href={`mailto:${RESEARCHER_EMAIL}`} className={link}>{RESEARCHER_EMAIL}</a>
            </P>
          </div>
        </div>
      </Container>

      <ClosingSection />
    </>
  );
}
