/**
 * How long a contributor's first session of 5 photos takes, as the campaign
 * emails say it (S29, 16 Nov 2026): the top of the session picker's 5-photo
 * range (sessionOptions.js). A plain module with no imports, so both the
 * picker and the plain Node campaign code (src/util/campaigns) read the same
 * figure.
 */
export const FIRST_SESSION = Object.freeze({ photos: 5, minutes: 5 });
