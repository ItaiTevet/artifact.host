/** Concurrent live (non-expired) artifacts allowed. */
export const ANON_LIVE_CAP = 5;
export const ACCOUNT_LIVE_CAP = 50;

/** Deploy rate limit per IP. */
export const RATE_LIMIT_MAX = 60;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Max comment body size (bytes). */
export const COMMENT_MAX_BYTES = 8 * 1024;
