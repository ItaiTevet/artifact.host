import type { UserRepository } from '@/lib/auth/user-repository';
import { AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS } from '@/lib/auth/constants';

/**
 * Record an auth attempt and report whether this IP is now over the limit.
 *
 * DB-backed (works across serverless instances and self-host alike) and checked BEFORE the
 * expensive scrypt verify, so it throttles both credential stuffing and scrypt CPU-exhaustion.
 * Returns true when the caller should reject with 429.
 */
export async function checkAuthRateLimit(
  repo: UserRepository,
  ipHash: string,
  now: Date = new Date(),
): Promise<boolean> {
  await repo.recordAuthAttempt(ipHash, now);
  const since = new Date(now.getTime() - AUTH_RATE_LIMIT_WINDOW_MS);
  const count = await repo.countRecentAuthAttempts(ipHash, since);
  return count > AUTH_RATE_LIMIT_MAX;
}
