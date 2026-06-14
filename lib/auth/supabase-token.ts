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

// Verifiers are built lazily on first use, so importing this module never touches the
// (Supabase-specific) env. A Supabase-free self-host can import the shared auth code
// without configuring NEXT_PUBLIC_SUPABASE_URL; these are only invoked when
// AUTH_PROVIDER=supabase.
let cached: {
  verifyClaims: ReturnType<typeof makeSupabaseJwtVerifier>;
  verifyToken: ReturnType<typeof makeVerifySupabaseToken>;
} | null = null;

function verifiers() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for AUTH_PROVIDER=supabase');
  const issuer = `${url}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  cached = {
    verifyClaims: makeSupabaseJwtVerifier({ jwks, issuer }),
    verifyToken: makeVerifySupabaseToken({ jwks, issuer }),
  };
  return cached;
}

export function verifySupabaseClaims(bearerToken?: string) {
  return verifiers().verifyClaims(bearerToken);
}
export function verifySupabaseToken(bearerToken?: string) {
  return verifiers().verifyToken(bearerToken);
}
