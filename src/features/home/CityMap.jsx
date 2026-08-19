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
import boundaries from "@/pages/cityBoundaries.json";

// Colors auto-assigned to cities by index. Add more if needed.
const CITY_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#06b6d4"];

function getCityColor(index) {
  return CITY_COLORS[index % CITY_COLORS.length];
}

function getStyle(color, mode) {
  if (mode === "active") return { fillColor: color, fillOpacity: 0.4, color, weight: 3, opacity: 0.9 };
  if (mode === "hover") return { fillColor: color, fillOpacity: 0.25, color, weight: 2, opacity: 0.7 };
  return { fillColor: color, fillOpacity: 0.12, color, weight: 1.5, opacity: 0.4 };
}

// Auto-fit map to show all polygons on load
function FitBounds() {
  const map = useMap();
  useEffect(() => {
    if (!boundaries?.features?.length) return;
    map.fitBounds(L.geoJSON(boundaries).getBounds().pad(0.02), { animate: false });
  }, [map]);
  return null;
}

// Invalidate map size when fullscreen toggles so tiles re-render
function InvalidateOnResize({ isFullscreen }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(timer);
  }, [isFullscreen, map]);
  return null;
}

// Clicking empty map area deselects
function MapDeselect({ onCitySelect }) {
  useMapEvents({
    click: (e) => {
      if (!e.originalEvent._polygonClick) onCitySelect(null);
    },
  });
  return null;
}

// Remounts via key when selectedCity changes so closures stay fresh
function CityPolygons({ selectedCity, onCitySelect }) {
  const styleFunc = useCallback(
    (feature) => {
      const i = boundaries.features.indexOf(feature);
      const color = getCityColor(i);
      return getStyle(color, feature.properties.name === selectedCity ? "active" : "default");
    },
    [selectedCity]
  );

  const onEachFeature = useCallback(
    (feature, layer) => {
      const name = feature.properties.name;
      const i = boundaries.features.indexOf(feature);
      const color = getCityColor(i);

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
          : "w-full h-full min-h-[400px] rounded-2xl relative z-0"
      } overflow-hidden shadow-lg border border-gray-200`}
    >
      {/* Fullscreen toggle button */}
      <button
        onClick={() => setIsFullscreen((f) => !f)}
        className="absolute top-3 right-3 z-[10000] bg-white hover:bg-gray-50 border border-gray-300 rounded-lg p-2 shadow-md transition-colors duration-150 cursor-pointer"
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? (
          // Collapse icon (arrows inward)
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        ) : (
          // Expand icon (arrows outward)
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )}
      </button>

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