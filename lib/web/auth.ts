'use client';

import * as supa from './supabase-browser';

// Build-time provider selection. Cloud builds default to Supabase; a self-host image sets
// NEXT_PUBLIC_AUTH_PROVIDER=local-password (or oidc) when building.
const PROVIDER = process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? 'supabase';

export const isPasswordAuth = PROVIDER === 'local-password';
export const isSupabaseAuth = PROVIDER === 'supabase';

const TOKEN_KEY = 'ah_session';

/** Bearer token for API calls (Supabase access token, or our first-party session). */
export async function getAccessToken(): Promise<string | null> {
  if (isSupabaseAuth) return supa.getAccessToken();
  return localStorage.getItem(TOKEN_KEY);
}

export async function getAccountEmail(): Promise<string | null> {
  if (isSupabaseAuth) return supa.getAccountEmail();
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()).email ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  if (isSupabaseAuth) { await supa.signOut(); return; }
  localStorage.removeItem(TOKEN_KEY);
}

/** OAuth sign-in (Supabase provider only). */
export function signInWithOAuth(provider: 'google' | 'github') {
  return supa.signIn(provider);
}

/** Email/password sign-in or sign-up (local-password provider). Stores the session on success. */
export async function signInWithPassword(
  email: string, password: string, mode: 'login' | 'signup',
): Promise<string> {
  const res = await fetch(`/api/auth/${mode}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Sign-in failed');
  localStorage.setItem(TOKEN_KEY, data.token);
  return data.email;
}
