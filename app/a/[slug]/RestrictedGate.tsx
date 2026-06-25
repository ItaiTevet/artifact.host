'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccessToken } from '@/lib/web/auth';
import { SignInGate } from '@/components/dashboard/SignInGate';
import styles from './gate.module.css';

type State =
  | { phase: 'loading' }
  | { phase: 'signin' }
  | { phase: 'denied' }
  | { phase: 'notfound' }
  | { phase: 'ok'; content: string };

const center: React.CSSProperties = {
  fontFamily: 'var(--mono, system-ui)', maxWidth: 460, margin: '18vh auto', padding: 24,
  textAlign: 'center', color: 'var(--ink-2)', lineHeight: 1.7,
};

export function RestrictedGate({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    const token = await getAccessToken();
    if (!token) { setState({ phase: 'signin' }); return; }
    try {
      const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/content`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { setState({ phase: 'signin' }); return; }
      if (res.status === 403) { setState({ phase: 'denied' }); return; }
      if (!res.ok) { setState({ phase: 'notfound' }); return; }
      const data = await res.json();
      setState({ phase: 'ok', content: data.content });
    } catch {
      setState({ phase: 'notfound' });
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  if (state.phase === 'loading') return <main style={center}>Loading…</main>;

  if (state.phase === 'signin') {
    return (
      <SignInGate
        title="This artifact is shared privately"
        subtitle="Sign in to check whether you have access."
        onSignedIn={load}
      />
    );
  }

  if (state.phase === 'denied') {
    return (
      <div className={styles.wrap}>
        <div className={styles.logo}>artifact<b>.host</b></div>
        <h1 className={styles.h1}>You don’t have access</h1>
        <p className={styles.muted}>
          This artifact is shared with specific people, and your account isn’t on the list.
          Ask the owner to add your email or domain.
        </p>
        <p className={styles.muted} style={{ marginTop: 16 }}>
          <Link className={styles.link} href="/">Deploy your own →</Link>
        </p>
      </div>
    );
  }

  if (state.phase === 'notfound') {
    return (
      <div className={styles.wrap}>
        <div className={styles.logo}>artifact<b>.host</b></div>
        <h1 className={styles.h1}>This artifact isn’t here</h1>
        <p className={styles.muted}>It doesn’t exist, or it may have expired.</p>
        <p className={styles.muted} style={{ marginTop: 16 }}>
          <Link className={styles.link} href="/">Deploy a new one →</Link>
        </p>
      </div>
    );
  }

  return (
    <iframe
      srcDoc={state.content}
      sandbox="allow-scripts allow-popups allow-forms"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
    />
  );
}
