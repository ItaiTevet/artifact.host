'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Subset of Supabase's OAuthAuthorizationDetails we render. Assignable from the
// full type returned by getAuthorizationDetails (which has extra fields).
type ConsentDetails = {
  client: { name: string; uri?: string };
  scope: string;
};

export default function ConsentClient() {
  const params = useSearchParams();
  const authorizationId = params.get('authorization_id') ?? '';
  const [supabase] = useState<SupabaseClient>(() => createClient(supabaseUrl, supabaseKey));
  const [state, setState] = useState<'loading' | 'login' | 'consent' | 'working' | 'error'>('loading');
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!authorizationId) {
      setState('error');
      setMessage('Missing authorization_id.');
      return;
    }
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setState('login');
        return;
      }
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (error) {
        setState('error');
        setMessage(error.message);
        return;
      }
      if (!data) {
        setState('error');
        setMessage('No authorization details returned.');
        return;
      }
      // Already consented → Supabase returns a redirect URL; send the user back to the client.
      if ('redirect_url' in data) {
        window.location.href = data.redirect_url;
        return;
      }
      // Consent needed → data is OAuthAuthorizationDetails.
      setDetails({ client: data.client, scope: data.scope });
      setState('consent');
    })();
  }, [authorizationId, supabase]);

  async function signIn(provider: 'google' | 'github') {
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.href } });
  }

  async function approve() {
    setState('working');
    // Default behavior auto-redirects the browser back to the OAuth client on success.
    const { error } = await supabase.auth.oauth.approveAuthorization(authorizationId);
    if (error) {
      setState('error');
      setMessage(error.message);
    }
  }

  async function deny() {
    setState('working');
    const { error } = await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (error) {
      setState('error');
      setMessage(error.message);
    }
  }

  const wrap: React.CSSProperties = {
    fontFamily: 'system-ui',
    maxWidth: 420,
    margin: '15vh auto',
    padding: 24,
    lineHeight: 1.5,
  };
  const btn: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '10px 14px',
    margin: '8px 0',
    fontSize: 15,
    cursor: 'pointer',
  };

  if (state === 'loading' || state === 'working') return <main style={wrap}>Working…</main>;
  if (state === 'error')
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 18 }}>Something went wrong</h1>
        <p>{message}</p>
      </main>
    );

  if (state === 'login') {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 18 }}>Sign in to connect artifact.host</h1>
        <p>Choose an account to authorize the MCP client.</p>
        <button style={btn} onClick={() => signIn('google')}>
          Sign in with Google
        </button>
        <button style={btn} onClick={() => signIn('github')}>
          Sign in with GitHub
        </button>
      </main>
    );
  }

  const clientName = details?.client?.name ?? 'An MCP client';
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 18 }}>Authorize access</h1>
      <p>
        <strong>{clientName}</strong> wants to deploy and manage artifacts on your behalf.
      </p>
      <button
        style={{ ...btn, background: '#b36b20', color: '#fff', border: 'none' }}
        onClick={approve}
      >
        Allow
      </button>
      <button style={btn} onClick={deny}>
        Deny
      </button>
    </main>
  );
}
