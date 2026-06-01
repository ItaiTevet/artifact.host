import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export interface VerifyDeps {
  jwks: JWTVerifyGetKey;
  issuer: string;
}

/**
 * Build a verifyToken function for mcp-handler's withMcpAuth. Validates a Supabase
 * access-token JWT against the given JWKS + issuer. Returns AuthInfo on success, or
 * undefined for missing/invalid/expired/wrong-issuer tokens (the caller treats
 * undefined as anonymous — this endpoint is intentionally dual-mode).
 */
export function makeVerifyMcpToken({ jwks, issuer }: VerifyDeps) {
  return async function verifyMcpToken(
    _req: Request,
    bearerToken?: string,
  ): Promise<AuthInfo | undefined> {
    if (!bearerToken) return undefined;
    try {
      const { payload } = await jwtVerify(bearerToken, jwks, { issuer });
      const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
      if (!userId) return undefined;
      return {
        token: bearerToken,
        clientId: typeof payload.client_id === 'string' ? payload.client_id : 'unknown',
        scopes: [],
        expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
        extra: { userId },
      };
    } catch {
      return undefined; // fail closed to anonymous, never to a trusted identity
    }
  };
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
// Lazy remote JWKS (fetched on first verification, then cached by jose).
const remoteJwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export const verifyMcpToken = makeVerifyMcpToken({ jwks: remoteJwks, issuer: ISSUER });
