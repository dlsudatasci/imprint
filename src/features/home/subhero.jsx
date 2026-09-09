import { H2, P, Container } from "@/ui";
import { useScroll } from "@/hooks/useScroll";

/**
 * The "why this matters" block below the map, explaining why Metro Manila's
 * sidewalk conditions are worth mapping collectively.
 *
 * Fades in after 300px of scrolling. Only the opacity changes — the text is in
 * the page from the start, so screen readers and search engines see it whether
 * or not anyone scrolls.
 */
export default function SubHero() {
  const scrollState = useScroll();

  return (
    <Container as="section" className="flex flex-col content-center justify-center py-5 gap-10 mt-20 lg:mt-15">
      <div className="flex flex-col justify-center max-w-4xl mx-auto text-center">
        <div className={`duration-300 ease-in ${scrollState < 300 ? "opacity-0" : "opacity-100"}`}>
          <H2 className="text-center font-bold tracking-tight text-3xl">
            Sidewalk conditions in Metro Manila
          </H2>
        </div>
        <div className={`mt-4 duration-300 ease-in ${scrollState < 300 ? "opacity-0" : "opacity-100"}`}>
          <P className="text-center py-5 lg:mx-auto max-w-4xl text-muted leading-relaxed">
            Many Filipinos living in urban areas rely heavily on roads and
            sidewalks to carry out their daily routines. Public mass
            transportation systems such as jeepneys, buses, and trains can be
            considered as the backbone of daily commuting for millions of
            Filipinos. The walkability of sidewalks leading to key transit areas
            and other public spaces is vital, and quality public infrastructure
            must be made available and accessible to all people.
          </P>
        </div>
      </div>
    </Container>
  );
}