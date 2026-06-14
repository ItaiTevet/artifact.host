import { randomBytes } from 'node:crypto';
import { hashToken } from '@/lib/artifacts/tokens';

/** Recognizable prefix (like `ghp_`/`vercel_`), so leaked tokens are easy to spot/scan. */
export const PERSONAL_TOKEN_PREFIX = 'ah_';

/** Generate a personal access token: prefix + 32 random bytes (base64url). */
export function generatePersonalToken(): string {
  return PERSONAL_TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

/** A bearer value is a PAT iff it carries our prefix (cheap pre-check before any DB lookup). */
export function isPersonalToken(token: string | undefined | null): token is string {
  return typeof token === 'string' && token.startsWith(PERSONAL_TOKEN_PREFIX);
}

/** Deterministic SHA-256 hash used for storage + lookup (PATs are high-entropy, so no salt). */
export function hashPersonalToken(token: string): string {
  return hashToken(token);
}
