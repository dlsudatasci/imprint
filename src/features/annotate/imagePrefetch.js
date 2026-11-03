/**
 * Photos fetched ahead of when they are shown (S16, 3 Nov 2026). The first
 * pilot participants found the photos slow to load, at the start of a session
 * most of all. The session's first photo is now fetched as soon as the batch
 * arrives, and the next ones while the current one is on screen. nginx serves
 * the photos with a 30-day immutable cache, so a photo fetched here comes from
 * the disk after Next Image's reload.
 */

// The urls already asked for on this page, so each is fetched once, with
// their Image, kept so nothing collects it before it has loaded
const requested = new Map();

/**
 * The urls of the `count` images after the 1-based `current`, in order,
 * leaving out missing urls and any url already in the list.
 */
export function upcomingImageUrls(images, current, count = 2) {
  if (!Array.isArray(images) || !Number.isInteger(current) || current < 0) return [];
  const urls = [];
  for (const img of images.slice(current, current + count)) {
    const url = img?.url;
    if (typeof url === "string" && url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Starts fetching each url, low priority by default, once per page. Nothing is
 * fetched when the browser asks to save data.
 */
export function prefetchImages(urls, { priority = "low" } = {}) {
  if (typeof window === "undefined" || typeof Image === "undefined") return;
  if (navigator.connection?.saveData === true) return;
  for (const url of urls || []) {
    if (typeof url !== "string" || !url || requested.has(url)) continue;
    const img = new Image();
    requested.set(url, img);
    img.decoding = "async";
    img.fetchPriority = priority;
    img.src = url;
  }
}

/** For tests: forget the urls already fetched */
export function resetPrefetched() {
  requested.clear();
}
