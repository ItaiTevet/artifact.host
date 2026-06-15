/**
 * Return a safe same-origin redirect path (pathname + search), or '/dashboard'.
 *
 * Resolving against the request origin and comparing origins blocks open-redirect tricks
 * that naive startsWith('/') checks miss — notably backslashes (`/\evil.com`, which the URL
 * parser normalizes to `//evil.com`), protocol-relative (`//evil.com`), and absolute URLs.
 * This matters because the OIDC callback hands the session token back via the URL fragment;
 * an off-origin redirect would leak it.
 */
export function safeReturnPath(value: string | null | undefined, origin: string): string {
  if (!value) return '/dashboard';
  try {
    const u = new URL(value, origin);
    if (u.origin !== origin) return '/dashboard';
    return u.pathname + u.search;
  } catch {
    return '/dashboard';
  }
}
