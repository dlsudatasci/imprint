/**
 * How long a message under the photo or in the sheet's footer stays (21 Oct
 * 2026): "Please tap Keep or Not an object on every suggested box.", a save
 * that failed, and every other one. It used to stay until the next try, so
 * with many suggestions left it stayed for the whole image. Now it fades out
 * after it has been read: at least 5 s, and 2 s plus 0.3 s a word for a long
 * one, about how long it takes to read twice. Trying again shows it again.
 * It arrives and leaves on the same 0.3 s ease, never changing the layout in
 * one jump: over the photo on a phone or tablet, and opening and closing its
 * row on the desktop photo.
 * The box it is about is opened for the person (openFirstUnfinished), so the
 * message is not needed to know what is left.
 */
export const MESSAGE_MIN_MS = 5000;
export const MESSAGE_BASE_MS = 2000;
export const MESSAGE_PER_WORD_MS = 300;

export function messageVisibleMs(message) {
  const words = typeof message === "string" ? message.trim().split(/\s+/).filter(Boolean).length : 0;
  return Math.max(MESSAGE_MIN_MS, MESSAGE_BASE_MS + words * MESSAGE_PER_WORD_MS);
}
