import { H2, H3, P, Container } from "@/ui";
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

/**
 * The About page: Imprint's research question, why auditing sidewalks by hand
 * doesn't scale, and how contributor-checked labelling is meant to close that
 * gap.
 *
 * Entirely static — no data fetching and no session. Its job is to convince a
 * visitor the work is worth their time before they sign up.
 */
export default function AboutSection() {
  return (
    <div className="bg-transparent">
      {/* 1. Hero Section */}
      <Container as="section" width="reading" className="py-12 lg:py-20 text-center">
        <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tight text-ink mb-6 text-balance mx-auto">
          Mapping how accessible Metro Manila&apos;s sidewalks really are.
        </h1>
        <P className="text-xl text-muted leading-relaxed mb-10 text-balance mx-auto">
          Imprint is a collaborative crowdsourcing platform for mapping urban walkability.
          Volunteers label street-level images, and those labels train the models that scale
          the work across the city.
        </P>
      </Container>

      {/* 2. The Problem: Assessing Sidewalks */}
      <section className="py-12 lg:py-20">
        <Container>
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="w-full lg:w-1/2 relative rounded-card overflow-hidden border border-line h-[400px]">
              <Image
                src="/images/about/theWhy.jpg"
                alt="The problem with sidewalks"
                fill
                className="object-cover"
              />
            </div>
            <div className="w-full lg:w-1/2">
              <H2 className="font-bold text-4xl mb-6">The Challenge: Assessing Sidewalks</H2>
              <P className="text-body mb-6 text-lg leading-relaxed">
                Evaluating the accessibility of an entire city&apos;s sidewalk network is a monumental task.
                Traditional municipal audits are incredibly slow, expensive, and rely on manual surveys that become outdated almost immediately.
              </P>
              <P className="text-body text-lg leading-relaxed">
                Meanwhile, millions of Filipinos navigate these unpredictable pathways daily. Our streets
                feature unique local challenges not always present in other countries: sari-sari store
                extensions, street vendors, and tricycles parked on the pavement. For individuals with
                mobility impairments, a single unmapped obstruction can make a route entirely impassable.
                We need a faster, more dynamic way to capture the true, hyper-local reality of our streets.
              </P>
            </div>
          </div>
        </Container>
      </section>

      {/* 3. Capturing the Pedestrian Experience */}
      <Container as="section" className="py-12 lg:py-20">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <H2 className="font-bold text-4xl mb-6">Capturing the Pedestrian Experience</H2>
          <P className="text-muted text-lg">
            Beyond mapping where streets run, we record how people rate the ones they walk on. That
            means collecting both what makes a sidewalk usable and what stops it from being usable at all.
          </P>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Value Card */}
          <div className="border border-line rounded-card p-10">
            <h3 className="text-3xl font-bold text-ink mb-8">What People Value</h3>
            <ul className="space-y-3 list-disc pl-5 marker:text-primary">
              {[
                "Continuous, wide, and flat pathways",
                "Properly sloped wheelchair ramps at intersections",
                "Tactile paving for the visually impaired",
                "Abundant shade and tree canopies",
                "Safe, clearly marked pedestrian crossings"
              ].map((item, i) => (
                <li key={i} className="text-body text-lg pl-1">{item}</li>
              ))}
            </ul>
          </div>

          {/* Hate Card */}
          <div className="border border-line rounded-card p-10">
            <h3 className="text-3xl font-bold text-ink mb-8">What Gets In The Way</h3>
            <ul className="space-y-3 list-disc pl-5 marker:text-subtle">
              {[
                "Unmapped obstructions (poles, parked cars, sari-sari stores, vendors)",
                "Broken, uneven, or missing concrete",
                "Steep curbs without accessible ramps",
                "Extremely narrow pedestrian bottlenecks",
                "Open manholes and hazardous construction zones"
              ].map((item, i) => (
                <li key={i} className="text-body text-lg pl-1">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </Container>

      {/* 4. The Solution: Scaling Up */}
      <section className="py-12 lg:py-20">
        <Container>
          <div className="flex flex-col-reverse lg:flex-row items-center gap-16">
            <div className="w-full lg:w-1/2">
              <H2 className="font-bold text-4xl mb-6">The Solution: Crowdsourcing Scale</H2>
              <P className="text-body text-lg leading-relaxed">
                By breaking the massive task of urban mapping into simple micro-tasks (identify, label, score),
                we can process thousands of streets in a fraction of the time a manual survey would take. Each
                labelled image also becomes training data, so the model gets better at finding obstructions on
                its own as more volunteers contribute.
              </P>
            </div>
            <div className="w-full lg:w-1/2 relative rounded-card overflow-hidden border border-line h-[400px]">
              <Image
                src="/images/about/theHow.jpg"
                alt="Crowdsourcing solution"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </Container>
      </section>

      {/* 5. The Tech & The Team */}
      <Container as="section" className="py-12 lg:py-20">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="w-full lg:w-1/2 relative rounded-card overflow-hidden border border-line h-[400px]">
            <Image
              src="/images/about/theWho.jpg"
              alt="The team"
              fill
              className="object-cover"
            />
          </div>
          <div className="w-full lg:w-1/2">
            <div className="pt-8">
              <H3 className="font-bold text-4xl mb-6">The Team</H3>
              <P className="text-body leading-relaxed text-lg mb-6">
                Imprint is currently being developed by Francis Bawa, a BSMS Computer Science student from De La Salle University,
                under the Human-X Interactions Lab Research Center. His research focuses on human-computer interaction and human-centered mobility.
              </P>
              <P className="text-body text-lg">
                Interested in the research? Read our{' '}
                <Link href="/terms-of-use" className="text-primary hover:underline font-bold">
                  Terms of Use
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-primary hover:underline font-bold">
                  Privacy Policy
                </Link>.
              </P>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
