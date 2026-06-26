import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { pkce, domainAllowed, oidcConfig, type OidcConfig, type OidcIdentity } from '@/lib/auth/oidc';

describe('pkce', () => {
  it('derives an S256 challenge from the verifier', () => {
    const { verifier, challenge } = pkce();
    expect(verifier.length).toBeGreaterThan(20);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
  it('is unique per call', () => {
    expect(pkce().verifier).not.toBe(pkce().verifier);
  });
});

describe('domainAllowed', () => {
  const id = (email: string): OidcIdentity => ({ email, emailVerified: true, sub: 's' });
  const cfg = (allowedDomains: string[]): OidcConfig => ({
    issuer: 'i', clientId: 'c', clientSecret: 's', redirectUri: 'r', scopes: 'openid', allowedDomains,
  });

  it('allows any email when no domains are configured', () => {
    expect(domainAllowed(cfg([]), id('anyone@gmail.com'))).toBe(true);
  });
  it('restricts to the configured domain(s)', () => {
    expect(domainAllowed(cfg(['example.com']), id('alice@example.com'))).toBe(true);
    expect(domainAllowed(cfg(['example.com']), id('bob@evil.com'))).toBe(false);
    expect(domainAllowed(cfg(['example.com']), id('carol@sub.example.com'))).toBe(false);
  });
});

describe('oidcConfig', () => {
  it('throws when required env is missing', () => {
    const saved = { ...process.env };
    delete process.env.OIDC_ISSUER; delete process.env.OIDC_CLIENT_ID; delete process.env.OIDC_CLIENT_SECRET;
    expect(() => oidcConfig()).toThrow(/OIDC_ISSUER/);
    Object.assign(process.env, saved);
  });

  it('parses domains and derives the redirect URI from APP_BASE_URL', () => {
    const saved = { ...process.env };
    process.env.OIDC_ISSUER = 'https://accounts.google.com/';
    process.env.OIDC_CLIENT_ID = 'cid';
    process.env.OIDC_CLIENT_SECRET = 'secret';
    process.env.APP_BASE_URL = 'https://artifacts.example.com';
    process.env.ALLOWED_EMAIL_DOMAINS = 'Example.com, partner.com';
    delete process.env.OIDC_REDIRECT_URL;

    const cfg = oidcConfig();
    expect(cfg.issuer).toBe('https://accounts.google.com'); // trailing slash trimmed
    expect(cfg.redirectUri).toBe('https://artifacts.example.com/api/auth/oidc/callback');
    expect(cfg.allowedDomains).toEqual(['example.com', 'partner.com']); // lowercased + trimmed

    Object.assign(process.env, saved);
  });
});
