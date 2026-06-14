import { describe, it, expect, beforeAll } from 'vitest';
import { issueSession, verifySession } from '@/lib/auth/session';

beforeAll(() => { process.env.AUTH_SECRET = 'test-secret-at-least-16-chars-long'; });

describe('SessionIssuer', () => {
  it('round-trips userId + email', async () => {
    const token = await issueSession({ userId: 'u1', email: 'a@b.com' });
    expect(await verifySession(token)).toEqual({ userId: 'u1', email: 'a@b.com' });
  });

  it('returns undefined for missing/garbage/tampered tokens', async () => {
    expect(await verifySession(undefined)).toBeUndefined();
    expect(await verifySession('not-a-jwt')).toBeUndefined();
    const token = await issueSession({ userId: 'u1' });
    expect(await verifySession(token + 'x')).toBeUndefined();
  });

  it('rejects an expired session', async () => {
    const token = await issueSession({ userId: 'u1' }, -10); // already expired
    expect(await verifySession(token)).toBeUndefined();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await issueSession({ userId: 'u1' });
    process.env.AUTH_SECRET = 'a-completely-different-secret-value';
    expect(await verifySession(token)).toBeUndefined();
    process.env.AUTH_SECRET = 'test-secret-at-least-16-chars-long'; // restore
  });
});
