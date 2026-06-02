'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getAccessToken } from '@/lib/web/supabase-browser';
import { validateEditInput, editErrorMessage } from '@/lib/web/dashboard';
import type { Visibility } from '@/lib/web/deploy';
import { SignInGate } from './SignInGate';
import styles from '@/app/dashboard/[slug]/edit.module.css';

type Phase = 'loading' | 'signedOut' | 'notFound' | 'ready';

export function EditClient({ slug }: { slug: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) { setPhase('signedOut'); return; }
    const res = await fetch(`/api/artifacts/${slug}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { setPhase('signedOut'); return; }
    if (!res.ok) { setPhase('notFound'); return; }
    const data = await res.json();
    setContent(data.content as string);
    setVisibility(data.visibility as Visibility);
    setPhase('ready');
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setError(null); setSaved(false);
    const check = validateEditInput({ content, visibility, password });
    if (!check.ok) { setError(check.error); return; }
    const token = await getAccessToken();
    if (!token) { setPhase('signedOut'); return; }
    setBusy(true);
    try {
      // Save content, then visibility (only when password-protected or changed).
      const res = await fetch(`/api/artifacts/${slug}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(editErrorMessage(data?.error)); return; }
      if (visibility === 'password') {
        await fetch(`/api/artifacts/${slug}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ visibility, password }),
        });
      }
      setSaved(true);
    } catch {
      setError(editErrorMessage(undefined));
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'loading') return <p className={styles.status}>Loading…</p>;
  if (phase === 'signedOut') return <SignInGate />;
  if (phase === 'notFound') {
    return <p className={styles.status}>This artifact is gone or has expired. <Link href="/dashboard">Back to dashboard</Link></p>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <h1 className={styles.h1}>Edit <span className={styles.slug}>/{slug}</span></h1>
        <Link href="/dashboard" className={styles.back}>‹ back to dashboard</Link>
      </div>

      <label className={styles.label} htmlFor="html">HTML</label>
      <textarea id="html" aria-label="HTML" className={styles.textarea}
        value={content} onChange={(e) => { setContent(e.target.value); setSaved(false); }} />

      <div className={styles.controls}>
        <span className={styles.label}>Visibility</span>
        <div className={styles.seg}>
          <button className={visibility === 'public' ? styles.on : ''} onClick={() => setVisibility('public')}>public</button>
          <button className={visibility === 'password' ? styles.on : ''} onClick={() => setVisibility('password')}>password</button>
        </div>
        {visibility === 'password' && (
          <input className={styles.password} type="password" placeholder="Password for viewers"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {saved && <p className={styles.saved}>Saved.</p>}

      <div className={styles.actions}>
        <Link href="/dashboard" className={styles.cancel}>Cancel</Link>
        <button className={styles.save} onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
