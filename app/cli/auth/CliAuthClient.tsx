'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getAccessToken, getAccountEmail } from '@/lib/web/auth';
import { SignInGate } from '@/components/dashboard/SignInGate';
import card from '@/components/dashboard/SignInGate.module.css';

export default function CliAuthClient() {
  const params = useSearchParams();
  const port = params.get('port');
  const state = params.get('state');

  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadEmail() { return getAccountEmail().then((e) => { setEmail(e); setReady(true); }); }
  useEffect(() => { void loadEmail(); }, []);

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

  // Opened directly (not by the CLI) — nothing to authorize.
  if (!validTarget) {
    return (
      <div className={card.wrap}>
        <div className={card.card}>
          <span className={card.eyebrow}>artifact.host</span>
          <h1 className={card.title}>Connect the CLI</h1>
          <p className={card.subtitle}>
            This page is opened by the <code>artifact</code> CLI. Run{' '}
            <code>artifact auth login</code> in your terminal to start.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) return <p style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '18vh 20px' }}>Loading…</p>;

  // Signed in → confirm authorization with the same branded card.
  if (email) {
    return (
      <div className={card.wrap}>
        <div className={card.card}>
          <span className={card.eyebrow}>artifact.host</span>
          <h1 className={card.title}>Connect the CLI</h1>
          <p className={card.subtitle}>
            Authorize the <strong>artifact</strong> CLI on this device as <strong>{email}</strong>?
            A Personal API Token will be created and sent only to the CLI running on your machine.
          </p>
          <div className={card.buttons}>
            <button className={`${card.btn} ${card.github}`} onClick={authorize} disabled={busy}>
              <span className={card.label}>{busy ? 'Authorizing…' : 'Authorize CLI'}</span>
            </button>
          </div>
          {error && <p className={card.foot} style={{ color: '#b00020' }}>{error}</p>}
        </div>
      </div>
    );
  }

  // Signed out → reuse the standard sign-in gate (Google/GitHub, SSO, or email+password,
  // depending on the instance's auth provider), then re-check the session.
  return (
    <SignInGate
      title="Connect the CLI"
      subtitle="Sign in to authorize the CLI on this device."
      onSignedIn={() => { void loadEmail(); }}
    />
  );
}
