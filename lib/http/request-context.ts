import { createHash } from 'node:crypto';

/**
 * Number of trusted reverse-proxy hops in front of the app.
 *
 * Unset/0 (the Vercel default): Vercel overwrites `x-forwarded-for` with the real client IP
 * and blocks client spoofing, so the leftmost value is authoritative. Set this to the number
 * of proxies you run in front of a self-hosted instance (e.g. 1 for a single nginx/Caddy) so
 * a client-supplied (spoofed) leftmost XFF can't forge the IP used for rate limiting.
 */
function trustedHops(): number {
  const n = Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Resolve the client IP from an x-forwarded-for chain, honoring TRUSTED_PROXY_HOPS. */
function clientIp(xff: string | null | undefined): string {
  const parts = (xff ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return 'unknown';
  const hops = trustedHops();
  // hops=0: trust the platform-set leftmost value (Vercel).
  // hops>0: the real client is the entry the outermost trusted proxy appended, i.e. `hops`
  // positions from the right end. Clamped so a forged short chain can't underflow.
  if (hops === 0) return parts[0];
  const idx = parts.length - hops;
  return parts[Math.min(Math.max(idx, 0), parts.length - 1)];
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip || 'unknown').digest('hex');
}

/** Resolve the client IP in plain text (not hashed), honoring TRUSTED_PROXY_HOPS. */
export function getClientIp(req: Request): string {
  return clientIp(req.headers.get('x-forwarded-for'));
}

export function getIpHash(req: Request): string {
  return hashIp(clientIp(req.headers.get('x-forwarded-for')));
}

/** Same hashing as getIpHash, but from a plain headers object. */
export function getIpHashFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string {
  const v = headers['x-forwarded-for'];
  const xff = Array.isArray(v) ? v.join(',') : v ?? null;
  return hashIp(clientIp(xff));
}
