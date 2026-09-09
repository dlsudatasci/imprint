import { IconButton } from "@/ui";
import { useEffect, useCallback, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import boundaries from "@/data/cityBoundaries.json";

// Fallback palette, cycled by feature order. A city can override this by
// setting `properties.color` in cityBoundaries.json — prefer doing that, since
// index-based colors shift as soon as someone reorders the GeoJSON.
// Muted and deliberately one family: these are drawn from the illustration
// palette in SidewalkLoader (sage, clay, ochre) plus a desaturated brand blue,
// rather than the fully-saturated 500-weights they replaced. Seven bright
// unrelated hues on one map read as decoration; these read as categories.
const CITY_COLORS = ["#2f5d8f", "#8f9b6f", "#c1703f", "#6f7f96", "#a8894f", "#7a6a8c", "#4f8878"];

function getCityColor(feature, index) {
  return feature?.properties?.color || CITY_COLORS[index % CITY_COLORS.length];
}

function getStyle(color, mode) {
  if (mode === "active") return { fillColor: color, fillOpacity: 0.4, color, weight: 3, opacity: 0.9 };
  if (mode === "hover") return { fillColor: color, fillOpacity: 0.25, color, weight: 2, opacity: 0.7 };
  return { fillColor: color, fillOpacity: 0.12, color, weight: 1.5, opacity: 0.4 };
}

// Frames the covered cities on load, so the hardcoded center/zoom on
// MapContainer only ever shows for the instant before this runs. Adding a city
// to the GeoJSON adjusts the view automatically.
function FitBounds() {
  const map = useMap();
  useEffect(() => {
    if (!boundaries?.features?.length) return;
    map.fitBounds(L.geoJSON(boundaries).getBounds().pad(0.02), { animate: false });
  }, [map]);
  return null;
}

// Leaflet caches the container size and only reloads tiles when told the size
// changed. Toggling fullscreen resizes via CSS, which it can't detect, so the
// map would keep painting at the old dimensions — grey gaps around the edges.
// The delay lets the CSS transition land before we measure.
function InvalidateOnResize({ isFullscreen }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(timer);
  }, [isFullscreen, map]);
  return null;
}

/**
 * Clicking empty map clears the selected city.
 *
 * Leaflet also fires the map's click handler when a city is clicked, so the
 * city handler marks the event and this checks for that mark. Marking the event
 * is better than stopping propagation, which would also block Leaflet's own
 * handling of the click.
 */
function MapDeselect({ onCitySelect }) {
  useMapEvents({
    click: (e) => {
      if (!e.originalEvent._polygonClick) onCitySelect(null);
    },
  });
  return null;
}

/**
 * The city outlines drawn on the map.
 *
 * react-leaflet attaches these handlers once when the layer is built, so they
 * keep whatever `selectedCity` was at that moment and never see a later value.
 * Changing the `key` rebuilds the layer on each selection, which is blunt but
 * reliable.
 */
function CityPolygons({ selectedCity, onCitySelect }) {
  const styleFunc = useCallback(
    (feature) => {
      const color = getCityColor(feature, boundaries.features.indexOf(feature));
      return getStyle(color, feature.properties.name === selectedCity ? "active" : "default");
    },
    [selectedCity]
  );

  const onEachFeature = useCallback(
    (feature, layer) => {
      const name = feature.properties.name;
      const color = getCityColor(feature, boundaries.features.indexOf(feature));

      layer.on({
        mouseover: () => { if (name !== selectedCity) layer.setStyle(getStyle(color, "hover")); },
        mouseout:  () => { if (name !== selectedCity) layer.setStyle(getStyle(color, "default")); },
        click: (e) => {
          e.originalEvent._polygonClick = true;
          onCitySelect(selectedCity === name ? null : name);
        },
      });
    },
    [selectedCity, onCitySelect]
  );

  return (
    <GeoJSON
      key={`polygons-${selectedCity || "none"}`}
      data={boundaries}
      style={styleFunc}
      onEachFeature={onEachFeature}
    />
  );
}

/**
 * The interactive city map on the landing page. Clicking a city filters the
 * figures underneath it.
 *
 * Must be loaded through a dynamic import with `ssr: false` — see hero.jsx.
 * Leaflet uses `window` as soon as it is imported, so pulling this into a
 * server-rendered page breaks the build.
 *
 * Scroll and pinch zoom are disabled inline and enabled in fullscreen. The map
 * sits partway down the page, and one that captures scrolling traps anyone
 * trying to swipe past it on a phone.
 */
export default function CityMap({ selectedCity, onCitySelect }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ESC key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  return (
    <div
      className={`${
        isFullscreen
          ? "fixed inset-0 z-[9999] rounded-none"
          : "w-full h-full min-h-[400px] rounded-card relative z-0"
      } overflow-hidden shadow-md border border-line`}
    >
      {/* Fullscreen toggle button */}
      <IconButton
        onClick={() => setIsFullscreen((f) => !f)}
        className="absolute top-3 right-3 z-[10000] shadow-md"
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? (
          // Collapse icon (arrows inward)
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        ) : (
          // Expand icon (arrows outward)
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )}
      </IconButton>

      <MapContainer
        center={[14.5, 121.01]}
        zoom={12}
        scrollWheelZoom={isFullscreen}
        zoomControl={true}
        doubleClickZoom={false}
        touchZoom={isFullscreen}
        dragging={true}
        attributionControl={false}
        className="h-full w-full"
        style={{ minHeight: isFullscreen ? "100vh" : "400px", background: "#f8f9fa" }}
      >
        <TileLayer
          attribution=""
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds />
        <InvalidateOnResize isFullscreen={isFullscreen} />
        <MapDeselect onCitySelect={onCitySelect} />
        <CityPolygons selectedCity={selectedCity} onCitySelect={onCitySelect} />
      </MapContainer>
    </div>
  );
}