'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAccessToken } from '@/lib/web/auth';
import type { ArtifactListItem } from '@/lib/web/dashboard';
import { editErrorMessage } from '@/lib/web/dashboard';
import { SignInGate } from './SignInGate';
import { ArtifactRow } from './ArtifactRow';
import styles from '@/app/dashboard/dashboard.module.css';

type State =
  | { phase: 'loading' }
  | { phase: 'signedOut' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; items: ArtifactListItem[] };

export function DashboardClient() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) { setState({ phase: 'signedOut' }); return; }
    try {
      const res = await fetch('/api/artifacts', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { setState({ phase: 'signedOut' }); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setState({ phase: 'error', message: editErrorMessage(data?.error) }); return; }
      setState({ phase: 'ready', items: data.artifacts as ArtifactListItem[] });
    } catch {
      setState({ phase: 'error', message: editErrorMessage(undefined) });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(slug: string) {
    const token = await getAccessToken();
    if (!token) { setState({ phase: 'signedOut' }); return; }
    // Optimistically drop the row, then resync if the delete didn't actually stick.
    setState((s) => (s.phase === 'ready' ? { phase: 'ready', items: s.items.filter((i) => i.slug !== slug) } : s));
    try {
      const res = await fetch(`/api/artifacts/${slug}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { setState({ phase: 'signedOut' }); return; }
      if (!res.ok) { await load(); } // restore the row — the server rejected the delete
    } catch {
      await load(); // network failure — restore the row
    }
  }

  if (state.phase === 'loading') return <p className={styles.status}>Loading…</p>;
  if (state.phase === 'signedOut') return <SignInGate />;
  if (state.phase === 'error') return <p className={styles.status}>{state.message}</p>;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>Your artifacts</h1>
      {state.items.length === 0 ? (
        <p className={styles.empty}>Nothing here yet. Deploy one from the <a href="/">home page</a> or your AI assistant, while signed in.</p>
      ) : (
        <div className={styles.list}>
          {state.items.map((item) => <ArtifactRow key={item.slug} item={item} onDelete={remove} />)}
        </div>
      )}
    </div>
  );
}
