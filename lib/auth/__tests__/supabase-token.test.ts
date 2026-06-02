import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWTVerifyGetKey } from 'jose';
import { makeSupabaseJwtVerifier, makeVerifySupabaseToken } from '@/lib/auth/supabase-token';

const ISSUER = 'https://test.supabase.co/auth/v1';
let sign: (claims: Record<string, unknown>, opts?: { exp?: string; iss?: string }) => Promise<string>;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'test-key' };
  jwks = createLocalJWKSet({ keys: [jwk] });
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(opts.iss ?? ISSUER)
      .setSubject((claims.sub as string) ?? 'user-123')
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(privateKey);
});

describe('makeVerifySupabaseToken', () => {
  it('returns the subject (user id) for a valid token', async () => {
    const verify = makeVerifySupabaseToken({ jwks, issuer: ISSUER });
    expect(await verify(await sign({ sub: 'user-abc' }))).toBe('user-abc');
  });
  it('returns undefined for missing, wrong-issuer, expired, and garbage tokens', async () => {
    const verify = makeVerifySupabaseToken({ jwks, issuer: ISSUER });
    expect(await verify(undefined)).toBeUndefined();
    expect(await verify(await sign({ sub: 'u' }, { iss: 'https://evil.example/auth/v1' }))).toBeUndefined();
    expect(await verify(await sign({ sub: 'u' }, { exp: '-1m' }))).toBeUndefined();
    expect(await verify('not-a-jwt')).toBeUndefined();
  });
});

describe('makeSupabaseJwtVerifier', () => {
  it('returns the verified payload (with client_id) for a valid token', async () => {
    const verifyClaims = makeSupabaseJwtVerifier({ jwks, issuer: ISSUER });
    const payload = await verifyClaims(await sign({ sub: 'u', client_id: 'cid-1' }));
    expect(payload?.sub).toBe('u');
    expect(payload?.client_id).toBe('cid-1');
  });
  it('returns undefined for an invalid token', async () => {
    const verifyClaims = makeSupabaseJwtVerifier({ jwks, issuer: ISSUER });
    expect(await verifyClaims('garbage')).toBeUndefined();
  });
});
