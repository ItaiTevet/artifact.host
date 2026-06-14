'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getAccessToken, getAccountEmail, signInWithOAuth, signInWithOidc, isPasswordAuth, isOidcAuth, OIDC_LABEL } from '@/lib/web/auth';
import { PasswordSignIn } from '@/components/dashboard/PasswordSignIn';

const wrap: React.CSSProperties = { fontFamily: 'system-ui', maxWidth: 460, margin: '15vh auto', padding: 24 };
const btn: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 14px', marginTop: 10,
  borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 15,
};

export default function CliAuthClient() {
  const params = useSearchParams();
  const port = params.get('port');
  const state = params.get('state');

  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccountEmail().then((e) => { setEmail(e); setReady(true); });
  }, []);

  const validTarget = !!port && /^\d+$/.test(port) && !!state;

  async function authorize() {
    setBusy(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Not signed in.');
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: 'CLI' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `Failed to mint token (HTTP ${res.status}).`);
      }
      const { token } = await res.json();
      // Hand the token back to the locally-running CLI over loopback only.
      window.location.href = `http://127.0.0.1:${port}/callback?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state!)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  if (!validTarget) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 20 }}>Connect the CLI</h1>
        <p>This page is opened by the <code>artifact</code> CLI. Run <code>artifact auth login</code> in your terminal to start.</p>
      </main>
    );
  }

  if (!ready) return <main style={wrap}>Loading…</main>;

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 20 }}>Connect the CLI</h1>
      {email ? (
        <>
          <p>Authorize the <strong>artifact</strong> CLI on this device as <strong>{email}</strong>?</p>
          <p style={{ color: '#666', fontSize: 13 }}>
            A Personal API Token will be created and sent only to the CLI running on your machine.
          </p>
          <button style={{ ...btn, background: '#0e0c09', color: '#fff' }} onClick={authorize} disabled={busy}>
            {busy ? 'Authorizing…' : 'Authorize CLI'}
          </button>
          {error && <p style={{ color: '#b00', fontSize: 13 }}>{error}</p>}
        </>
      ) : (
        <>
          <p>Sign in to authorize the CLI on this device.</p>
          {isPasswordAuth ? (
            <PasswordSignIn onSignedIn={() => getAccountEmail().then(setEmail)} />
          ) : isOidcAuth ? (
            <button style={btn} onClick={() => signInWithOidc()}>Continue with {OIDC_LABEL}</button>
          ) : (
            <>
              <button style={btn} onClick={() => signInWithOAuth('google')}>Continue with Google</button>
              <button style={btn} onClick={() => signInWithOAuth('github')}>Continue with GitHub</button>
            </>
          )}
        </>
      )}
    </main>
  );
}
