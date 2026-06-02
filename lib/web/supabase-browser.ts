'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Singleton browser Supabase client (anon/publishable key — never the service key). */
export const supabaseBrowser = createClient(supabaseUrl, supabaseKey);

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabaseBrowser.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getAccountEmail(): Promise<string | null> {
  const { data } = await supabaseBrowser.auth.getSession();
  return data.session?.user?.email ?? null;
}

export function signIn(provider: 'google' | 'github') {
  return supabaseBrowser.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.href } });
}

export function signOut() {
  return supabaseBrowser.auth.signOut();
}
