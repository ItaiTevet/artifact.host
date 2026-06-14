'use client';

import { useState } from 'react';
import { signInWithPassword } from '@/lib/web/auth';

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', marginTop: 8, fontSize: 15,
  borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box',
};
const button: React.CSSProperties = {
  width: '100%', padding: '10px 14px', marginTop: 12, fontSize: 15, fontWeight: 600,
  borderRadius: 8, border: 'none', background: '#0e0c09', color: '#fff', cursor: 'pointer',
};

/** Email/password sign-in + sign-up for the self-host local-password provider. */
export function PasswordSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email.trim(), password, mode);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <input style={input} type="email" placeholder="you@example.com" autoComplete="email"
        value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input style={input} type="password" placeholder="Password"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      <button style={button} type="submit" disabled={busy}>
        {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      {error && <p style={{ color: '#b00', fontSize: 13, marginTop: 8 }}>{error}</p>}
      <p style={{ fontSize: 13, marginTop: 10, color: '#666' }}>
        {mode === 'login' ? 'No account yet? ' : 'Already have an account? '}
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
          style={{ background: 'none', border: 'none', color: '#b36b20', cursor: 'pointer', padding: 0, fontSize: 13 }}>
          {mode === 'login' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </form>
  );
}
