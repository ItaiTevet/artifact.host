'use client';

import * as supa from './supabase-browser';
import { withTimeout } from './with-timeout';

// Cap how long we'll wait for an auth lookup. A provider call that hangs (a Supabase
// session refresh that never resolves, an unreachable /api/auth/me) must degrade to
// "signed out" rather than leaving callers stuck on an infinite loading state.
const AUTH_TIMEOUT_MS = 6000;

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
  if (isSupabaseAuth) return withTimeout(supa.getAccessToken(), AUTH_TIMEOUT_MS, null);
  return localStorage.getItem(TOKEN_KEY);
}

export async function getAccountEmail(): Promise<string | null> {
  if (isSupabaseAuth) return withTimeout(supa.getAccountEmail(), AUTH_TIMEOUT_MS, null);
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const res = await withTimeout(
      fetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` } }),
      AUTH_TIMEOUT_MS,
      null,
    );
    if (!res || !res.ok) return null;
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
