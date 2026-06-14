import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  allowedDomains: string[];
}

/** Read + validate OIDC config from env. Throws if required vars are missing. */
export function oidcConfig(): OidcConfig {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) {
    throw new Error('OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required for AUTH_PROVIDER=oidc');
  }
  const base = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    issuer: issuer.replace(/\/$/, ''),
    clientId,
    clientSecret,
    redirectUri: process.env.OIDC_REDIRECT_URL || `${base}/api/auth/oidc/callback`,
    scopes: process.env.OIDC_SCOPES || 'openid email profile',
    allowedDomains: (process.env.ALLOWED_EMAIL_DOMAINS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
}

interface Discovery { authorization_endpoint: string; token_endpoint: string; jwks_uri: string; issuer: string; }
let cache: { issuer: string; doc: Discovery; jwks: JWTVerifyGetKey } | null = null;

async function discover(cfg: OidcConfig) {
  if (cache && cache.issuer === cfg.issuer) return cache;
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
  const doc = (await res.json()) as Discovery;
  cache = { issuer: cfg.issuer, doc, jwks: createRemoteJWKSet(new URL(doc.jwks_uri)) };
  return cache;
}

/** PKCE pair: a high-entropy verifier and its S256 challenge. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function buildAuthUrl(
  cfg: OidcConfig, p: { state: string; nonce: string; challenge: string },
): Promise<string> {
  const { doc } = await discover(cfg);
  const u = new URL(doc.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('scope', cfg.scopes);
  u.searchParams.set('state', p.state);
  u.searchParams.set('nonce', p.nonce);
  u.searchParams.set('code_challenge', p.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  // For a single allowed domain, hint the provider (Google honors `hd`). Not a security
  // boundary on its own — the domain is enforced server-side in domainAllowed().
  if (cfg.allowedDomains.length === 1) u.searchParams.set('hd', cfg.allowedDomains[0]);
  return u.toString();
}

export interface OidcIdentity { email: string; emailVerified: boolean; hd?: string; sub: string; }

/** Exchange the auth code (with PKCE verifier) and validate the returned ID token. */
export async function exchangeAndValidate(
  cfg: OidcConfig, p: { code: string; verifier: string; nonce: string },
): Promise<OidcIdentity> {
  const { doc, jwks } = await discover(cfg);
  const res = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: p.code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: p.verifier,
    }),
  });
  if (!res.ok) throw new Error(`OIDC token exchange failed (${res.status})`);
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error('OIDC response had no id_token');

  const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: doc.issuer, audience: cfg.clientId });
  if (payload.nonce !== p.nonce) throw new Error('OIDC nonce mismatch');
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  if (!email) throw new Error('OIDC id_token had no email');
  return {
    email,
    emailVerified: payload.email_verified === true,
    hd: typeof payload.hd === 'string' ? payload.hd : undefined,
    sub: String(payload.sub),
  };
}

/** True when no domain restriction is configured, or the (verified) email matches it. */
export function domainAllowed(cfg: OidcConfig, identity: OidcIdentity): boolean {
  if (cfg.allowedDomains.length === 0) return true;
  const emailDomain = identity.email.split('@')[1]?.toLowerCase();
  return !!emailDomain && cfg.allowedDomains.includes(emailDomain);
}
