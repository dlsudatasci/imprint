/**
 * Input rules shared by the endpoints that create or rename an account.
 *
 * Password signup (/api/auth/register) and the Google username step
 * (/api/auth/choose-username) both write `users.username`, so they have to
 * agree on what counts as valid. Keep these here rather than in either
 * endpoint, or a name rejected by one route sneaks in through the other.
 */

// No '$' and no whitespace: these values reach Mongo queries, and a username
// shaped like a query operator is a problem waiting to happen. The length cap
// keeps the dashboard header from overflowing.
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

// Deliberately loose. Proving an address is real is the reset email's job, not
// a regex's — this only rejects shapes that clearly aren't addresses at all.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_EMAIL_LENGTH = 254;

// bcrypt silently truncates past 72 bytes, so anything longer is wasted work;
// the ceiling also stops a huge string from tying up a hash round.
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 200;
