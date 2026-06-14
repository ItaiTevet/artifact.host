import { describe, it, expect } from 'vitest';
import {
  generatePersonalToken, isPersonalToken, hashPersonalToken, PERSONAL_TOKEN_PREFIX,
} from '@/lib/auth/personal-token';
import { makeVerifyPersonalToken } from '@/lib/auth/personal-token-auth';
import { InMemoryTokenRepository } from './in-memory-token-repository';

describe('personal token primitives', () => {
  it('generates prefixed, high-entropy, unique tokens', () => {
    const a = generatePersonalToken();
    const b = generatePersonalToken();
    expect(a.startsWith(PERSONAL_TOKEN_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it('recognizes only prefixed values as PATs', () => {
    expect(isPersonalToken(generatePersonalToken())).toBe(true);
    expect(isPersonalToken('eyJhbGci.session.jwt')).toBe(false);
    expect(isPersonalToken(undefined)).toBe(false);
    expect(isPersonalToken(null)).toBe(false);
  });

  it('hashes deterministically', () => {
    const t = generatePersonalToken();
    expect(hashPersonalToken(t)).toBe(hashPersonalToken(t));
  });
});

describe('makeVerifyPersonalToken', () => {
  async function setup() {
    const repo = new InMemoryTokenRepository();
    const token = generatePersonalToken();
    const rec = await repo.create({
      ownerId: 'owner-1', name: 'CLI', tokenHash: hashPersonalToken(token), expiresAt: null,
    });
    return { repo, token, rec };
  }

  it('resolves a valid PAT to its owner', async () => {
    const { repo, token } = await setup();
    const verify = makeVerifyPersonalToken({ repo });
    expect(await verify(token)).toBe('owner-1');
  });

  it('returns undefined for non-PAT bearers (e.g. a session JWT)', async () => {
    const { repo } = await setup();
    const verify = makeVerifyPersonalToken({ repo });
    expect(await verify('eyJ.a.session.jwt')).toBeUndefined();
    expect(await verify(undefined)).toBeUndefined();
  });

  it('returns undefined for unknown or revoked tokens', async () => {
    const { repo, token, rec } = await setup();
    const verify = makeVerifyPersonalToken({ repo });
    expect(await verify(generatePersonalToken())).toBeUndefined(); // never created
    await repo.revoke(rec.id, 'owner-1');
    expect(await verify(token)).toBeUndefined(); // revoked
  });

  it('rejects expired tokens', async () => {
    const repo = new InMemoryTokenRepository();
    const token = generatePersonalToken();
    await repo.create({
      ownerId: 'owner-2', name: 'old', tokenHash: hashPersonalToken(token),
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    const verify = makeVerifyPersonalToken({ repo, now: () => new Date('2026-01-01T00:00:00Z') });
    expect(await verify(token)).toBeUndefined();
  });
});
