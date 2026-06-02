import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export interface VerifyTokenDeps {
  jwks: JWTVerifyGetKey;
  issuer: string;
}

/**
 * Build a verifier that validates a Supabase access-token JWT against the given
 * JWKS + issuer and returns the verified payload, or undefined for
 * missing/invalid/expired/wrong-issuer tokens. Single audited verification path
 * shared by the MCP endpoint and the web dashboard API.
 */
export function makeSupabaseJwtVerifier({ jwks, issuer }: VerifyTokenDeps) {
  return async function verifyClaims(bearerToken?: string): Promise<JWTPayload | undefined> {
    if (!bearerToken) return undefined;
    try {
      const { payload } = await jwtVerify(bearerToken, jwks, { issuer });
      return payload;
    } catch {
      return undefined; // fail closed: never resolve to a trusted identity on error
    }
  };
}

/** Convenience verifier that returns just the user id (`sub`). */
export function makeVerifySupabaseToken(deps: VerifyTokenDeps) {
  const verifyClaims = makeSupabaseJwtVerifier(deps);
  return async function verifySupabaseToken(bearerToken?: string): Promise<string | undefined> {
    const payload = await verifyClaims(bearerToken);
    return typeof payload?.sub === 'string' ? payload.sub : undefined;
  };
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
// Lazy remote JWKS (fetched on first verification, then cached by jose).
const remoteJwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export const verifySupabaseClaims = makeSupabaseJwtVerifier({ jwks: remoteJwks, issuer: ISSUER });
export const verifySupabaseToken = makeVerifySupabaseToken({ jwks: remoteJwks, issuer: ISSUER });
