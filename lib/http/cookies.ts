import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireSecret } from '@/lib/config/secret';

const TTL_MS = 30 * 60 * 1000; // 30 minutes

function secret(): string {
  // Fails closed in production: an unset COOKIE_SECRET would otherwise let anyone forge a
  // password cookie (HMAC over a public default) and bypass password-protected artifacts.
  return requireSecret('COOKIE_SECRET', { devFallback: 'dev-only-insecure-secret' });
}

export function cookieName(slug: string): string {
  return `pw_${slug}`;
}

/** value = expiryMs.signature */
export function signPasswordCookie(slug: string): string {
  const exp = Date.now() + TTL_MS;
  const sig = createHmac('sha256', secret()).update(`${slug}.${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

export function verifyPasswordCookie(slug: string, value: string | undefined): boolean {
  if (!value) return false;
  const [expStr, sig] = value.split('.');
  if (!expStr || !sig) return false;
  if (Number(expStr) < Date.now()) return false;
  const expected = createHmac('sha256', secret()).update(`${slug}.${expStr}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
