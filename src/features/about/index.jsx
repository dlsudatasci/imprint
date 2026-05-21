import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { H2, P, H3 } from '@/ui/Typography';
import { ThumbsUp, ThumbsDown, BarChart, ShieldCheck, MapPin } from 'lucide-react';

export default function AboutSection() {
  return (
    <div className="bg-transparent">
      {/* 1. Hero Section */}
      <section className="container mx-auto px-5 py-12 lg:py-20 text-center max-w-4xl">
        <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 mb-6 text-balance mx-auto">
          Empowering communities to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400 whitespace-nowrap">map accessible cities.</span>
        </h1>
        <P className="text-xl text-gray-500 leading-relaxed mb-10 text-balance mx-auto">
          Imprint is a collaborative crowdsourcing platform designed to scale the mapping of urban walkability. 
          By combining human effort with machine learning, we are uncovering the hidden barriers of our city streets.
        </P>
      </section>

      {/* 2. The Problem: Assessing Sidewalks */}
      <section className="py-12 lg:py-20">
        <div className="container mx-auto px-5">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="w-full lg:w-1/2 relative rounded-3xl overflow-hidden shadow-2xl h-[400px]">
              <Image 
                src="/images/about/theWhy.jpg" 
                alt="The problem with sidewalks" 
                fill
                className="object-cover"
              />
            </div>
            <div className="w-full lg:w-1/2">
              <H2 className="font-bold text-4xl mb-6">The Challenge: Assessing Sidewalks</H2>
              <P className="text-gray-600 mb-6 text-lg leading-relaxed">
                Evaluating the accessibility of an entire city's sidewalk network is a monumental task. 
                Traditional municipal audits are incredibly slow, expensive, and rely on manual surveys that become outdated almost immediately.
              </P>
              <P className="text-gray-600 text-lg leading-relaxed">
                Meanwhile, millions of Filipinos navigate these unpredictable pathways daily. Our streets feature unique local challenges not always present in other countries—from sari-sari store extensions and street vendors to tricycles parked on the pavement. For individuals with mobility impairments, a single unmapped obstruction can make a route entirely impassable. We need a faster, more dynamic way to capture the true, hyper-local reality of our streets.
              </P>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Capturing the Pedestrian Experience */}
      <section className="container mx-auto px-5 py-12 lg:py-20">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <H2 className="font-bold text-4xl mb-6">Capturing the Pedestrian Experience</H2>
          <P className="text-gray-500 text-lg">
            Our objective is not just to map streets, but to capture richer data and uncover the true sentiments of the people navigating them. We want to deeply understand what makes a sidewalk truly accessible, and what barriers completely disrupt mobility.
          </P>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Value Card */}
          <div className="border-2 border-green-100 rounded-3xl p-10 shadow-sm hover:shadow-lg transition-shadow duration-300 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 bg-green-50 w-32 h-32 rounded-full z-0 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="bg-green-100 p-4 rounded-2xl text-green-600">
                  <ThumbsUp size={32} />
                </div>
                <h3 className="text-3xl font-bold text-gray-900">Identifying What People Value</h3>
              </div>
              <ul className="space-y-4">
                {[
                  "Continuous, wide, and flat pathways",
                  "Properly sloped wheelchair ramps at intersections",
                  "Tactile paving for the visually impaired",
                  "Abundant shade and tree canopies",
                  "Safe, clearly marked pedestrian crossings"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <ShieldCheck className="text-green-500 mt-1 shrink-0" size={20} />
                    <span className="text-gray-600 text-lg">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Hate Card */}
          <div className="border-2 border-red-100 rounded-3xl p-10 shadow-sm hover:shadow-lg transition-shadow duration-300 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 bg-red-50 w-32 h-32 rounded-full z-0 group-hover:scale-150 transition-transform duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="bg-red-100 p-4 rounded-2xl text-red-600">
                  <ThumbsDown size={32} />
                </div>
                <h3 className="text-3xl font-bold text-gray-900">Identifying The Barriers</h3>
              </div>
              <ul className="space-y-4">
                {[
                  "Unmapped obstructions (poles, parked cars, sari-sari stores, vendors)",
                  "Broken, uneven, or missing concrete",
                  "Steep curbs without accessible ramps",
                  "Extremely narrow pedestrian bottlenecks",
                  "Open manholes and hazardous construction zones"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <MapPin className="text-red-500 mt-1 shrink-0" size={20} />
                    <span className="text-gray-600 text-lg">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 4. The Solution: Scaling Up */}
      <section className="py-12 lg:py-20">
        <div className="container mx-auto px-5">
          <div className="flex flex-col-reverse lg:flex-row items-center gap-16">
            <div className="w-full lg:w-1/2">
              <H2 className="font-bold text-4xl mb-6">The Solution: Crowdsourcing Scale</H2>
              <P className="text-gray-600 text-lg leading-relaxed">
                By breaking the massive task of urban mapping into simple micro-tasks (identify, label, score), 
                we can process thousands of streets in a fraction of the time. This collective human effort creates 
                rich, highly accurate datasets that traditional methods simply cannot match.
              </P>
            </div>
            <div className="w-full lg:w-1/2 relative rounded-3xl overflow-hidden shadow-2xl h-[400px]">
              <Image 
                src="/images/about/theHow.jpg" 
                alt="Crowdsourcing solution" 
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 5. The Tech & The Team */}
      <section className="container mx-auto px-5 py-12 lg:py-20">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="w-full lg:w-1/2 relative rounded-3xl overflow-hidden shadow-2xl h-[400px]">
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
              <P className="text-gray-600 leading-relaxed text-lg mb-6">
                Imprint is currently being developed by Francis Bawa, a BSMS Computer Science student from De La Salle University, 
                under the Human-X Interactions Lab Research Center. His research focuses on human-computer interaction and human-centered mobility.
              </P>
              <P className="text-gray-600 text-lg">
                Interested in the research? Read our{' '}
                <Link href="/terms-of-use" className="text-primary hover:underline font-bold">
                  Terms of Use
                </Link>.
              </P>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
