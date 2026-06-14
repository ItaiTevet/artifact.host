'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAccessToken } from '@/lib/web/auth';
import { SignInGate } from './SignInGate';
import styles from '@/app/dashboard/dashboard.module.css';

interface TokenSummary {
  id: string; name: string; created_at: string; last_used_at: string | null;
}

type State =
  | { phase: 'loading' }
  | { phase: 'signedOut' }
  | { phase: 'ready'; tokens: TokenSummary[] };

const box: React.CSSProperties = {
  border: '1px solid #d8cfc4', borderRadius: 10, padding: 14, marginBottom: 16,
  display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
};
const code: React.CSSProperties = {
  fontFamily: 'var(--mono, monospace)', fontSize: 13, background: '#f4efe8',
  padding: '8px 10px', borderRadius: 6, wordBreak: 'break-all', flex: 1, minWidth: 220,
};

export function TokensClient() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // plaintext shown once

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) { setState({ phase: 'signedOut' }); return; }
    const res = await fetch('/api/tokens', { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 401) { setState({ phase: 'signedOut' }); return; }
    const data = await res.json().catch(() => ({ tokens: [] }));
    setState({ phase: 'ready', tokens: data.tokens ?? [] });
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFresh(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() || 'API token' }),
      });
      const data = await res.json();
      if (res.ok) { setFresh(data.token); setName(''); await load(); }
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    const token = await getAccessToken();
    await fetch(`/api/tokens/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    await load();
  }

  if (state.phase === 'loading') return <p className={styles.status}>Loading…</p>;
  if (state.phase === 'signedOut') return <SignInGate title="Sign in to manage API tokens" />;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>API tokens</h1>
      <p style={{ color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.6, marginTop: -8 }}>
        Personal tokens authenticate the CLI and REST API. Use one with{' '}
        <code style={{ fontFamily: 'var(--mono, monospace)' }}>ARTIFACT_HOST_TOKEN</code> or{' '}
        <code style={{ fontFamily: 'var(--mono, monospace)' }}>artifact auth login --with-token</code>.
      </p>

      {fresh && (
        <div style={{ ...box, borderColor: '#b36b20', background: '#fbf6ee', flexDirection: 'column', alignItems: 'stretch' }}>
          <strong style={{ fontSize: 14 }}>Copy your new token now — it won’t be shown again:</strong>
          <span style={code}>{fresh}</span>
        </div>
      )}

      <form onSubmit={create} style={box}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name (e.g. laptop)"
          style={{ flex: 1, minWidth: 200, padding: '9px 11px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }} />
        <button type="submit" disabled={creating}
          style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0e0c09', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          {creating ? '…' : 'Create token'}
        </button>
      </form>

      {state.tokens.length === 0 ? (
        <p className={styles.empty}>No tokens yet.</p>
      ) : (
        <div className={styles.list}>
          {state.tokens.map((t) => (
            <div key={t.id} style={{ ...box, marginBottom: 8 }}>
              <span style={{ flex: 1, minWidth: 160 }}>
                <strong>{t.name}</strong>
                <span style={{ color: 'var(--ink-3)', fontSize: 13, display: 'block' }}>
                  created {new Date(t.created_at).toLocaleDateString()} ·{' '}
                  {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleDateString()}` : 'never used'}
                </span>
              </span>
              <button onClick={() => revoke(t.id)}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 24 }}><a href="/dashboard" style={{ color: 'var(--amber)' }}>← Back to artifacts</a></p>
    </div>
  );
}
