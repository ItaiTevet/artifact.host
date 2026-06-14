'use client';

import * as supa from './supabase-browser';

// Build-time provider selection. Cloud builds default to Supabase; a self-host image sets
// NEXT_PUBLIC_AUTH_PROVIDER=local-password (or oidc) when building.
const PROVIDER = process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? 'supabase';

export const isPasswordAuth = PROVIDER === 'local-password';
export const isSupabaseAuth = PROVIDER === 'supabase';
export const isOidcAuth = PROVIDER === 'oidc';

const TOKEN_KEY = 'ah_session';

// OIDC (and any redirect flow) hands the session back in the URL fragment. Consume it once
// on first import in the browser, before any component reads the token.
function consumeSessionFragment() {
  if (typeof window === 'undefined' || !window.location.hash) return;
  const m = window.location.hash.match(/[#&]token=([^&]+)/);
  if (!m) return;
  localStorage.setItem(TOKEN_KEY, decodeURIComponent(m[1]));
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
if (typeof window !== 'undefined') consumeSessionFragment();

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

/** Redirect into the OIDC flow, returning to the current page afterward. */
export function signInWithOidc() {
  const returnTo = window.location.pathname + window.location.search;
  window.location.href = `/api/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Optional label for the SSO button, e.g. "Google". */
export const OIDC_LABEL = process.env.NEXT_PUBLIC_OIDC_LABEL ?? 'single sign-on';

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
