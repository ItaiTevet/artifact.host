import { describe, it, expect } from 'vitest';
import { checkAuthRateLimit } from '@/lib/auth/rate-limit';
import { AUTH_RATE_LIMIT_MAX } from '@/lib/auth/constants';
import type { UserRepository } from '@/lib/auth/user-repository';

/** Minimal in-memory UserRepository exercising only the attempt-tracking methods. */
function fakeRepo(): UserRepository {
  const attempts: { ip: string; at: Date }[] = [];
  return {
    findByEmail: async () => null,
    create: async () => { throw new Error('unused'); },
    count: async () => 0,
    recordAuthAttempt: async (ip, at) => { attempts.push({ ip, at }); },
    countRecentAuthAttempts: async (ip, since) =>
      attempts.filter((a) => a.ip === ip && a.at >= since).length,
  };
}

describe('checkAuthRateLimit', () => {
  it('allows up to the limit, then blocks further attempts from the same ip', async () => {
    const repo = fakeRepo();
    const now = new Date();
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i++) {
      expect(await checkAuthRateLimit(repo, 'ip1', now)).toBe(false);
    }
    // The next attempt pushes the count over the limit.
    expect(await checkAuthRateLimit(repo, 'ip1', now)).toBe(true);
  });

  it('tracks each ip independently', async () => {
    const repo = fakeRepo();
    const now = new Date();
    for (let i = 0; i <= AUTH_RATE_LIMIT_MAX; i++) await checkAuthRateLimit(repo, 'ip1', now);
    expect(await checkAuthRateLimit(repo, 'ip2', now)).toBe(false);
  });
});
