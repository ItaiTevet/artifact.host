'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Created lazily so this module can be imported on a Supabase-free (self-host) build
// without env vars; the client is only constructed when a Supabase auth call runs.
let client: SupabaseClient | null = null;
function browser(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars are required for AUTH_PROVIDER=supabase');
  client = createClient(url, key);
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await browser().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getAccountEmail(): Promise<string | null> {
  const { data } = await browser().auth.getSession();
  return data.session?.user?.email ?? null;
}

export function signIn(provider: 'google' | 'github') {
  return browser().auth.signInWithOAuth({ provider, options: { redirectTo: window.location.href } });
}

export function signOut() {
  return browser().auth.signOut();
}
