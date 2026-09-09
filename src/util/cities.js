/**
 * Converts a city name into the slug the database stores.
 *
 * Imprint keeps city names in two forms. The `Image` and `annotations`
 * collections store a squashed lowercase slug ("laspinas", "quezoncity"),
 * while anything a person sees or types uses the display name ("Las Piñas",
 * "Quezon City") — profile settings, the map's GeoJSON, the `?city=` query on
 * the public stats endpoint. Any query crossing that line has to normalize
 * first, or it matches nothing and silently returns zero results.
 *
 * The ñ → n replacement has to run before the a-z filter. In the other order
 * the filter simply drops the character and "Las Piñas" becomes "laspias".
 */
export function normalizeCityName(displayName) {
  if (typeof displayName !== "string") return "";
  return displayName
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]/g, "");
}
