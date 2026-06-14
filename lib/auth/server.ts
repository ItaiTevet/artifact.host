import { verifySupabaseToken } from '@/lib/auth/supabase-token';
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
