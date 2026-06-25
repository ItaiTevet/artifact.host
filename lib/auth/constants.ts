/** Per-IP cap on auth attempts (login + signup combined) within the window below. */
export const AUTH_RATE_LIMIT_MAX = 10;
export const AUTH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
