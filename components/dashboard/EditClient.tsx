'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getAccessToken } from '@/lib/web/auth';
import { validateEditInput, editErrorMessage } from '@/lib/web/dashboard';
import type { Visibility } from '@/lib/web/deploy';
import { SignInGate } from './SignInGate';
import { PasswordField } from '@/components/ui/PasswordField';
import styles from '@/app/dashboard/[slug]/edit.module.css';

type Phase = 'loading' | 'signedOut' | 'notFound' | 'ready';

export function EditClient({ slug }: { slug: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [loadedVisibility, setLoadedVisibility] = useState<Visibility>('public');
  const [password, setPassword] = useState('');
  const [allowlist, setAllowlist] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) { setPhase('signedOut'); return; }
    try {
      const res = await fetch(`/api/artifacts/${slug}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { setPhase('signedOut'); return; }
      if (!res.ok) { setPhase('notFound'); return; }
      const data = await res.json();
      setContent(data.content as string);
      setVisibility(data.visibility as Visibility);
      setLoadedVisibility(data.visibility as Visibility);
      setAllowlist((data.allowlist as string) ?? '');
      setPhase('ready');
    } catch {
      setPhase('notFound');
    }
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
      // Persist a visibility change whenever it differs from what we loaded, when a new
      // password is set, or whenever it's restricted (the allowlist may have changed).
      if (visibility !== loadedVisibility || (visibility === 'password' && password) || visibility === 'restricted') {
        const body = visibility === 'password' ? { visibility, password }
          : visibility === 'restricted' ? { visibility, allowlist }
          : { visibility };
        const vres = await fetch(`/api/artifacts/${slug}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const vdata = await vres.json().catch(() => ({}));
        if (!vres.ok) { setError(editErrorMessage(vdata?.error)); return; }
        setLoadedVisibility(visibility);
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
          <button type="button" className={visibility === 'public' ? styles.on : ''} onClick={() => setVisibility('public')}>public</button>
          <button type="button" className={visibility === 'password' ? styles.on : ''} onClick={() => setVisibility('password')}>password</button>
          <button type="button" className={visibility === 'restricted' ? styles.on : ''} onClick={() => setVisibility('restricted')}>restricted</button>
        </div>
        {visibility === 'password' && (
          <PasswordField className={styles.password} placeholder="Password for viewers"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
        {visibility === 'restricted' && (
          <div style={{ width: '100%', marginTop: 10 }}>
            <textarea
              aria-label="Allowed emails and domains"
              className={styles.textarea}
              style={{ minHeight: 90 }}
              placeholder={'Who can view (one per line):\nalice@intezer.com\n@intezer.com'}
              value={allowlist}
              onChange={(e) => { setAllowlist(e.target.value); setSaved(false); }}
            />
            <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6, marginTop: 6 }}>
              Viewers must sign in; an email grants one person, a domain (e.g. <code>@intezer.com</code>)
              grants everyone there. You always have access.
            </p>
          </div>
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
