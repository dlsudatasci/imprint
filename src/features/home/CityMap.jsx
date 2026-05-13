import { useEffect, useCallback } from "react";
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
  return (
    <div className="w-full h-full min-h-[400px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 relative z-0">
      <MapContainer
        center={[14.5, 121.01]}
        zoom={12}
        scrollWheelZoom={false}
        zoomControl={true}
        doubleClickZoom={false}
        touchZoom={false}
        dragging={true}
        attributionControl={false}
        className="h-full w-full"
        style={{ minHeight: "400px", background: "#f8f9fa" }}
      >
        <TileLayer
          attribution=""
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds />
        <MapDeselect onCitySelect={onCitySelect} />
        <CityPolygons selectedCity={selectedCity} onCitySelect={onCitySelect} />
      </MapContainer>
    </div>
  );
}