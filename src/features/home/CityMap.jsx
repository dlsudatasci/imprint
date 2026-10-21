import { IconButton, tokens } from "@/ui";
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
import { useMediaQuery } from "@/hooks/useMediaQuery";

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
 * Mouse-wheel zoom, and dragging and pinching with fingers (2 Oct 2026, the
 * fingers 21 Oct 2026).
 *
 * MapContainer reads its options only once, when the map is created, so the
 * earlier `scrollWheelZoom={isFullscreen}` never turned zoom on in fullscreen.
 * The handlers are switched here instead:
 *   - fullscreen: dragging, wheel and pinch zoom always on;
 *   - inline with a mouse: the map drags, and wheel zoom turns on once the map
 *     is clicked and off again when the pointer leaves it, so scrolling down
 *     the page past the map never gets caught by the map;
 *   - inline on a phone or tablet (`touch`): one finger scrolls the page and
 *     two fingers move and zoom the map, as maps embedded in web pages do.
 *     One finger used to drag the map, so a swipe that began on it moved the
 *     map instead of the page, which is most swipes on a phone. Leaflet then
 *     marks the map `touch-action: pan-x pan-y`, so the browser scrolls.
 */
function ZoomControlByMode({ isFullscreen, touch }) {
  const map = useMap();
  useEffect(() => {
    if (isFullscreen) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.touchZoom.enable();
      return undefined;
    }
    map.scrollWheelZoom.disable();
    if (touch) {
      map.dragging.disable();
      map.touchZoom.enable();
      return undefined;
    }
    map.dragging.enable();
    map.touchZoom.disable();
    const turnOn = () => map.scrollWheelZoom.enable();
    const turnOff = () => map.scrollWheelZoom.disable();
    const el = map.getContainer();
    map.on("click", turnOn);
    el.addEventListener("mouseleave", turnOff);
    return () => {
      map.off("click", turnOn);
      el.removeEventListener("mouseleave", turnOff);
    };
  }, [map, isFullscreen, touch]);
  return null;
}

/** A finger moving this far, px, means the swipe was meant for the page (or the map) */
const ONE_FINGER_SLOP_PX = 10;
/** How long the two-finger hint stays after the finger lifts, ms */
const HINT_MS = 1200;

/**
 * Inline on a phone or tablet: a one-finger swipe on the map scrolls the page,
 * and a short note on the map says how to move it instead (21 Oct 2026). Gone
 * once two fingers are down, and soon after the finger lifts. Passive
 * listeners, so the page's scrolling is never held up.
 */
function TwoFingerHint({ active, onChange }) {
  const map = useMap();
  useEffect(() => {
    if (!active) {
      onChange(false);
      return undefined;
    }
    const el = map.getContainer();
    let start = null;
    let timer = null;
    const clear = () => { if (timer) clearTimeout(timer); timer = null; };
    const onStart = (e) => {
      clear();
      if (e.touches.length === 1) start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      else { start = null; onChange(false); }
    };
    const onMove = (e) => {
      if (!start || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > ONE_FINGER_SLOP_PX) onChange(true);
    };
    const onEnd = () => {
      start = null;
      clear();
      timer = setTimeout(() => onChange(false), HINT_MS);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      clear();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [map, active, onChange]);
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

      // With twelve cities the outline alone doesn't say which one it is, so the
      // name follows the pointer on hover (added 2 Oct 2026).
      layer.bindTooltip(name, { sticky: true, direction: "top", opacity: 0.95 });

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
 * The map's credits (16 Oct 2026). OpenStreetMap's license and CARTO's
 * basemap terms both ask for them on the map itself, and until then they were
 * switched off (`attributionControl={false}`) while the TileLayer still carried
 * them. Added here without Leaflet's own "Leaflet" prefix, small, in the
 * corner the zoom buttons do not use.
 */
function MapAttribution() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.attribution({ position: "bottomright", prefix: false });
    control.addTo(map);
    return () => { control.remove(); };
  }, [map]);
  return null;
}

export const MAP_COPY = Object.freeze({
  twoFingers: "Use two fingers to move the map",
});

/** The inline map's height on a phone, a tablet and a desktop (21 Oct 2026, see CityMap) */
export const MAP_HEIGHT_CLASS = "h-[280px] sm:h-[320px] lg:h-[380px]";

/**
 * The interactive city map on the landing page. Clicking a city filters the
 * figures underneath it.
 *
 * Must be loaded through a dynamic import with `ssr: false` — see hero.jsx.
 * Leaflet uses `window` as soon as it is imported, so pulling this into a
 * server-rendered page breaks the build.
 *
 * Inline, wheel zoom starts once the map is clicked, and on a phone or tablet
 * one finger scrolls the page while two move the map. The map sits partway
 * down the page, and one that captures scrolling traps anyone trying to scroll
 * or swipe past it. Fullscreen enables everything (ZoomControlByMode).
 *
 * Smaller from 21 Oct 2026 (apple-design): 280 px tall on a phone, 320 on a
 * tablet and 380 beside the welcome on a desktop, about the height of the text
 * it sits beside, so it supports the page instead of taking it over. At 400
 * and 480 it filled a phone's screen below the buttons and stood taller than
 * the welcome on a desktop. The skeleton in hero.jsx keeps the same heights.
 */
export default function CityMap({ selectedCity, onCitySelect }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // A finger is the main pointer: phones and tablets
  const touch = useMediaQuery("(pointer: coarse)") === true;
  const [hint, setHint] = useState(false);

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
          : `w-full ${MAP_HEIGHT_CLASS} rounded-card relative z-0`
      } overflow-hidden border border-line bg-surface-subtle`}
    >
      {/* Fullscreen toggle button */}
      <IconButton
        onClick={() => setIsFullscreen((f) => !f)}
        size="sm"
        className="absolute top-3 right-3 z-[10000]"
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
        scrollWheelZoom={false}
        zoomControl={true}
        doubleClickZoom={false}
        touchZoom={false}
        dragging={true}
        attributionControl={false}
        className="h-full w-full"
        style={{ background: tokens.color.surfaceSubtle }}
      >
        <MapAttribution />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={`https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_KEY || ""}`}
          subdomains="abcd"
          maxZoom={20}
        />
        <FitBounds />
        <InvalidateOnResize isFullscreen={isFullscreen} />
        <ZoomControlByMode isFullscreen={isFullscreen} touch={touch} />
        <TwoFingerHint active={touch && !isFullscreen} onChange={setHint} />
        <MapDeselect onCitySelect={onCitySelect} />
        <CityPolygons selectedCity={selectedCity} onCitySelect={onCitySelect} />
      </MapContainer>

      {/* The two-finger note (TwoFingerHint): a dark, frosted layer over the map
          with the words in white, never in the way of a tap */}
      <div
        aria-hidden={!hint}
        className={`pointer-events-none absolute inset-0 z-[1001] grid place-items-center bg-ink/45 backdrop-blur-[2px] motion-safe:transition-opacity motion-safe:duration-200 ${hint ? "opacity-100" : "opacity-0"}`}
      >
        <p role="status" className="px-4 text-center text-sm font-semibold tracking-[0.01em] text-white">
          {hint ? MAP_COPY.twoFingers : ""}
        </p>
      </div>
    </div>
  );
}