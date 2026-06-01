import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWTVerifyGetKey } from 'jose';
import { makeVerifyMcpToken } from '@/lib/mcp/auth';

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

const req = new Request('https://artifact.host/mcp');

describe('makeVerifyMcpToken', () => {
  it('returns undefined when no token is present', async () => {
    const verify = makeVerifyMcpToken({ jwks, issuer: ISSUER });
    expect(await verify(req, undefined)).toBeUndefined();
  });

  it('returns AuthInfo with the user id for a valid token', async () => {
    const verify = makeVerifyMcpToken({ jwks, issuer: ISSUER });
    const token = await sign({ sub: 'user-abc', client_id: 'cid-1' });
    const info = await verify(req, token);
    expect(info?.extra?.userId).toBe('user-abc');
    expect(info?.clientId).toBe('cid-1');
    expect(info?.token).toBe(token);
  });

  it('returns undefined for a wrong-issuer token', async () => {
    const verify = makeVerifyMcpToken({ jwks, issuer: ISSUER });
    const token = await sign({ sub: 'u' }, { iss: 'https://evil.example/auth/v1' });
    expect(await verify(req, token)).toBeUndefined();
  });

  it('returns undefined for an expired token', async () => {
    const verify = makeVerifyMcpToken({ jwks, issuer: ISSUER });
    const token = await sign({ sub: 'u' }, { exp: '-1m' });
    expect(await verify(req, token)).toBeUndefined();
  });

  it('returns undefined for a garbage token', async () => {
    const verify = makeVerifyMcpToken({ jwks, issuer: ISSUER });
    expect(await verify(req, 'not-a-jwt')).toBeUndefined();
  });
});
