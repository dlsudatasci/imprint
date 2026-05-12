import { useEffect, useState, useRef } from "react";

export default function CityStats({ selectedCity }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  // Fade-in on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.15 }
    );
    const el = sectionRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, []);

  // Fetch stats when city changes
  useEffect(() => {
    setLoading(true);
    const url = selectedCity
      ? `/api/publicStats?city=${encodeURIComponent(selectedCity)}`
      : "/api/publicStats";

    fetch(url)
      .then((res) => res.json())
      .then(setStats)
      .catch((err) => console.error("Failed to fetch public stats:", err))
      .finally(() => setLoading(false));
  }, [selectedCity]);

  const statItems = stats
    ? [
        { label: "Sidewalk Images", value: stats.totalImages?.toLocaleString() || "0", sub: "collected for annotation" },
        { label: "Annotations",     value: stats.totalAnnotations?.toLocaleString() || "0", sub: "bounding boxes submitted" },
        { label: "Accessibility",   value: stats.avgAccessibilityRating > 0 ? `${stats.avgAccessibilityRating}/10` : "—", sub: "average sidewalk rating" },
        { label: "Contributors",    value: stats.totalContributors?.toLocaleString() || "0", sub: "unique volunteers" },
        { label: "Avg. Obstructions", value: stats.avgObstructionsPerImage > 0 ? stats.avgObstructionsPerImage : "—", sub: "per image" },
      ]
    : [];

  const skeleton = (count) =>
    Array.from({ length: count }, (_, i) => (
      <div key={i} className="animate-pulse py-5 border-t-2 border-gray-100">
        <div className="h-9 w-16 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-24 bg-gray-100 rounded mb-1" />
        <div className="h-3 w-20 bg-gray-50 rounded" />
      </div>
    ));

  return (
    <section
      ref={sectionRef}
      className={`container mx-auto px-5 pt-8 pb-12 transition-all duration-700 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
          {selectedCity || "All Areas"}{" "}
          <span className="font-medium text-gray-400">at a glance</span>
        </h2>
        <p className="text-gray-500 mt-1 text-sm">
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
                <p className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight leading-none mb-1.5">
                  {item.value}
                </p>
                <p className="text-sm font-bold text-gray-700">{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
              </div>
            ))}
      </div>

      {/* Common Obstructions */}
      {!loading && stats?.commonObstructions?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">
            Common Obstructions
            {selectedCity && (
              <span className="normal-case tracking-normal font-medium text-gray-400">
                {" "}in {selectedCity}
              </span>
            )}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {stats.commonObstructions.map((obs, i) => (
              <div key={obs.type} className="py-4 border-t-2 border-gray-100">
                <p className="text-2xl font-black text-gray-900 tracking-tight leading-none mb-1">
                  {obs.count}
                </p>
                <p className="text-sm font-bold text-gray-700 capitalize">
                  {obs.type.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">#{i + 1} most common</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
