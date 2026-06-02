import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { makeSupabaseJwtVerifier } from '@/lib/auth/supabase-token';

export interface VerifyDeps {
  jwks: JWTVerifyGetKey;
  issuer: string;
}

/**
 * Build a verifyToken function for mcp-handler's withMcpAuth. Validates a Supabase
 * access-token JWT and returns AuthInfo on success, or undefined for
 * missing/invalid/expired/wrong-issuer tokens (the caller treats undefined as
 * anonymous — this endpoint is intentionally dual-mode).
 */
export function makeVerifyMcpToken({ jwks, issuer }: VerifyDeps) {
  const verifyClaims = makeSupabaseJwtVerifier({ jwks, issuer });
  return async function verifyMcpToken(
    _req: Request,
    bearerToken?: string,
  ): Promise<AuthInfo | undefined> {
    const payload = await verifyClaims(bearerToken);
    const userId = typeof payload?.sub === 'string' ? payload.sub : undefined;
    if (!payload || !userId || !bearerToken) return undefined;
    return {
      token: bearerToken,
      clientId: typeof payload.client_id === 'string' ? payload.client_id : 'unknown',
      scopes: [],
      expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
      extra: { userId },
    };
  };
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const remoteJwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export const verifyMcpToken = makeVerifyMcpToken({ jwks: remoteJwks, issuer: ISSUER });
