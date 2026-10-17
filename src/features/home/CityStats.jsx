import { useEffect, useState, useRef } from "react";
import { Container } from "@/ui";
import { cityStatsItems, obstructionLabel } from "./cityStatsItems";

/**
 * The contribution figures shown under the map on the landing page.
 *
 * `selectedCity` comes from clicking a city on the map, and null means "all
 * areas". It travels as a display name such as "Las Piñas"; the API converts it
 * to a database slug, so nothing here needs to.
 *
 * `onFirstLoad` fires once the first request finishes, whether it succeeded or
 * not. The landing page keeps its loading screen up until then, and this is the
 * only component on the page that makes a network call, so it is the only one
 * that can say when the data has arrived.
 */
export default function CityStats({ selectedCity, onFirstLoad }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const announced = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  // Slide the section in the first time it scrolls into view, then leave it
  // alone — no unsetting on the way back out
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.15 }
    );
    const el = sectionRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = selectedCity
      ? `/api/publicStats?city=${encodeURIComponent(selectedCity)}`
      : "/api/publicStats";

    // Clicking across the map fires overlapping requests, and they don't
    // necessarily come back in order. The flag drops any response that isn't
    // for the city currently selected, so a slow earlier request can't
    // overwrite the numbers with stale ones.
    let stale = false;

    fetch(url)
      .then((res) => res.json())
      .then((data) => { if (!stale) setStats(data); })
      .catch((err) => console.error("Failed to fetch public stats:", err))
      .finally(() => {
        if (stale) return;
        setLoading(false);
        // Only the first settle matters — later ones are city filter changes,
        // which swap in a skeleton rather than covering the page again.
        if (!announced.current) {
          announced.current = true;
          onFirstLoad?.();
        }
      });

    return () => { stale = true; };
  }, [selectedCity, onFirstLoad]);

  const statItems = cityStatsItems(stats);

  const skeleton = (count) =>
    Array.from({ length: count }, (_, i) => (
      <div key={i} className="animate-pulse py-5 border-t-2 border-line-card">
        <div className="h-9 w-16 bg-line rounded mb-2" />
        <div className="h-4 w-24 bg-surface-subtle rounded mb-1" />
        <div className="h-3 w-20 bg-surface-subtle rounded" />
      </div>
    ));

  return (
    <Container
      as="section"
      ref={sectionRef}
      className={`pt-8 pb-12 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
      }`}
    >
      {/* Header */}
      <div className="mb-8">
        <h2 className="font-display text-3xl lg:text-4xl font-extrabold text-ink tracking-[-0.02em]">
          {selectedCity || "All Areas"}{" "}
          <span className="font-medium text-subtle">at a glance</span>
        </h2>
        <p className="text-muted mt-1 text-sm">
          {selectedCity
            ? "Click the highlighted area again to deselect."
            : "Select a highlighted city on the map above to filter."}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 mb-10">
        {loading
          ? skeleton(5)
          : statItems.map((item) => (
              <div key={item.label} className="py-5 border-t-2 border-primary/20">
                <p className="text-4xl lg:text-5xl font-extrabold text-ink tracking-[-0.03em] tabular-nums leading-none mb-2">
                  {item.value}
                </p>
                <p className="text-sm font-bold text-body">{item.label}</p>
                <p className="text-xs text-subtle mt-0.5">{item.sub}</p>
              </div>
            ))}
      </div>

      {/* Common Obstructions */}
      {!loading && stats?.commonObstructions?.length > 0 && (
        <div>
          <h3 className="font-sans text-sm font-semibold text-ink mb-4">
            Common Obstructions
            {selectedCity && (
              <span className="font-medium text-muted">
                {" "}in {selectedCity}
              </span>
            )}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {stats.commonObstructions.map((obs, i) => (
              <div key={obs.type} className="py-4 border-t-2 border-line-card">
                <p className="text-3xl font-extrabold text-ink tracking-[-0.03em] tabular-nums leading-none mb-1.5">
                  {obs.count}
                </p>
                <p className="text-sm font-bold text-body">
                  {obstructionLabel(obs.type)}
                </p>
                <p className="text-xs text-subtle mt-0.5">#{i + 1} most common</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}
