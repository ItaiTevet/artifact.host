import { verifySupabaseToken, verifySupabaseClaims } from '@/lib/auth/supabase-token';
import { verifySession } from '@/lib/auth/session';

export type AuthProvider = 'supabase' | 'local-password' | 'oidc';

export function authProvider(): AuthProvider {
  return (process.env.AUTH_PROVIDER as AuthProvider) ?? 'supabase';
}

/**
 * Verify a session bearer token to an owner id, dispatched by the configured provider.
 * Supabase verifies its own JWT; local-password and oidc both use our first-party session.
 */
export async function verifyOwnerSession(bearerToken?: string): Promise<string | undefined> {
  if (authProvider() === 'supabase') return verifySupabaseToken(bearerToken);
  return (await verifySession(bearerToken))?.userId;
}

export interface SessionIdentity { userId: string; email?: string | null }

/** Like verifyOwnerSession but also returns the verified email (for 'restricted' sharing). */
export async function verifyIdentity(bearerToken?: string): Promise<SessionIdentity | undefined> {
  if (authProvider() === 'supabase') {
    const payload = await verifySupabaseClaims(bearerToken);
    if (!payload || typeof payload.sub !== 'string') return undefined;
    return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
  }
  const id = await verifySession(bearerToken);
  return id ? { userId: id.userId, email: id.email ?? null } : undefined;
}
