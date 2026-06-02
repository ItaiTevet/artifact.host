'use client';

import { useState, type KeyboardEvent } from 'react';
import { validateDeployInput, buildDeployPayload, type Ttl, type Visibility } from '@/lib/web/deploy';
import { deployErrorMessage } from '@/lib/web/errors';
import { ResultCard, type DeployResult } from './ResultCard';
import { PasswordField } from '@/components/ui/PasswordField';
import styles from './DeployPanel.module.css';

const TTLS: Ttl[] = ['1h', '1d', '7d', '30d'];

export function DeployPanel() {
  const [content, setContent] = useState('');
  const [ttl, setTtl] = useState<Ttl>('7d');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);

  async function deploy() {
    setError(null);
    const check = validateDeployInput({ content, visibility, password });
    if (!check.ok) { setError(check.error); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildDeployPayload({ content, ttl, visibility, password })),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(deployErrorMessage(data?.error)); return; }
      setResult(data as DeployResult);
    } catch {
      setError(deployErrorMessage(undefined));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void deploy(); }
  }

  function reset() {
    setResult(null); setContent(''); setError(null); setPassword('');
  }

  if (result) return <ResultCard result={result} onReset={reset} />;

  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        <textarea
          className={styles.textarea}
          placeholder="Paste your HTML here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className={styles.hint}>⌘↵ deploy</div>
      </div>

      <div className={styles.opts}>
        {TTLS.map((t) => (
          <button key={t} className={`${styles.pill} ${ttl === t ? styles.on : ''}`} onClick={() => setTtl(t)}>{t}</button>
        ))}
        <div className={styles.optDiv} />
        <button className={`${styles.pill} ${visibility === 'public' ? styles.on : ''}`} onClick={() => setVisibility('public')}>public</button>
        <button className={`${styles.pill} ${visibility === 'password' ? styles.on : ''}`} onClick={() => setVisibility('password')}>password</button>
      </div>

      {visibility === 'password' && (
        <PasswordField
          className={styles.password}
          placeholder="Password for viewers"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.deployRow}>
        <button className={styles.deploy} onClick={() => void deploy()} disabled={busy}>
          {busy ? 'Deploying…' : 'Deploy artifact'} <span className={styles.arr}>→</span>
        </button>
        <div className={styles.deployMeta}>
          Returns a live URL + edit token.<br />No account needed.
        </div>
      </div>
    </div>
  );
}
