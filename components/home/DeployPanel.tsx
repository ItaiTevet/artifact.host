'use client';

import { useState, useEffect, useRef, type KeyboardEvent, type DragEvent } from 'react';
import { validateDeployInput, type Ttl, type Visibility } from '@/lib/web/deploy';
import { deployErrorMessage } from '@/lib/web/errors';
import { getAccessToken, getAccountEmail } from '@/lib/web/auth';
import { validateUploadFile } from '@/lib/web/upload';
import { ResultCard, type DeployResult } from './ResultCard';
import { PasswordField } from '@/components/ui/PasswordField';
import { HtmlEditor } from '@/components/ui/HtmlEditor';
import styles from './DeployPanel.module.css';

const TTLS: Ttl[] = ['1h', '1d', '7d', '30d'];

export function DeployPanel() {
  const [content, setContent] = useState('');
  const [ttl, setTtl] = useState<Ttl>('7d');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [password, setPassword] = useState('');
  const [allowlist, setAllowlist] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File | undefined) {
    if (!file) return;
    const check = validateUploadFile({ name: file.name, size: file.size, type: file.type });
    if (!check.ok) { setError(check.error); return; }
    const reader = new FileReader();
    reader.onload = () => { setError(null); setContent(String(reader.result ?? '')); };
    reader.onerror = () => setError("Couldn't read that file. Try again.");
    reader.readAsText(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    loadFile(e.dataTransfer.files?.[0]);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    // Clear only when the drag truly leaves the box — not when crossing between its children.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  }

  useEffect(() => { getAccountEmail().then((e) => setSignedIn(!!e)).catch(() => setSignedIn(false)); }, []);

  async function deploy() {
    setError(null);
    const check = validateDeployInput({ content, visibility, password });
    if (!check.ok) { setError(check.error); return; }
    setBusy(true);
    try {
      // Attach the session token when signed in, so the artifact is owned (shows in the dashboard).
      const token = signedIn ? await getAccessToken() : null;
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) headers.authorization = `Bearer ${token}`;

      // 'restricted' is applied as a follow-up PATCH (the deploy endpoint takes public/password).
      const deployVisibility = visibility === 'restricted' ? 'public' : visibility;
      const body: Record<string, unknown> = { content, ttl, visibility: deployVisibility };
      if (deployVisibility === 'password' && password) body.password = password;

      const res = await fetch('/api/deploy', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(deployErrorMessage(data?.error)); return; }

      if (visibility === 'restricted') {
        const slug = String(data.url).split('/a/')[1];
        const vres = await fetch(`/api/artifacts/${slug}`, {
          method: 'PATCH',
          headers: { ...headers, 'x-edit-token': data.edit_token },
          body: JSON.stringify({ visibility: 'restricted', allowlist }),
        });
        if (!vres.ok) {
          const vdata = await vres.json().catch(() => ({}));
          setError(deployErrorMessage(vdata?.error)); return;
        }
      }
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
    setResult(null); setContent(''); setError(null); setPassword(''); setAllowlist('');
  }

  if (result) return <ResultCard result={result} onReset={reset} />;

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.box} ${dragging ? styles.dragging : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <HtmlEditor
          variant="light"
          value={content}
          onValueChange={setContent}
          onKeyDown={onKeyDown}
          placeholder="Paste your HTML — or drop a file..."
        />
        <div className={styles.hint}>⌘↵ deploy</div>
        {dragging && <div className={styles.dropOverlay}>Drop your HTML file to load it</div>}
        <input
          ref={fileInputRef}
          data-testid="upload-input"
          type="file"
          accept=".html,.htm,text/html"
          className={styles.fileInput}
          onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
      <button type="button" className={styles.browse} aria-label="Browse for an HTML file" onClick={() => fileInputRef.current?.click()}>
        or drop a file · browse
      </button>

      <div className={styles.opts}>
        {TTLS.map((t) => (
          <button key={t} className={`${styles.pill} ${ttl === t ? styles.on : ''}`} onClick={() => setTtl(t)}>{t}</button>
        ))}
        <div className={styles.optDiv} />
        <button className={`${styles.pill} ${visibility === 'public' ? styles.on : ''}`} onClick={() => setVisibility('public')}>public</button>
        <button className={`${styles.pill} ${visibility === 'password' ? styles.on : ''}`} onClick={() => setVisibility('password')}>password</button>
        {signedIn && (
          <button className={`${styles.pill} ${visibility === 'restricted' ? styles.on : ''}`} onClick={() => setVisibility('restricted')}>restricted</button>
        )}
      </div>

      {visibility === 'password' && (
        <PasswordField
          className={styles.password}
          placeholder="Password for viewers"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}

      {visibility === 'restricted' && (
        <div className={styles.password}>
          <textarea
            aria-label="Allowed emails and domains"
            className={styles.textarea}
            style={{ minHeight: 78 }}
            placeholder={'Who can view (one per line):\nalice@example.com\n@yourcompany.com'}
            value={allowlist}
            onChange={(e) => setAllowlist(e.target.value)}
          />
          <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6, marginTop: 6 }}>
            Viewers sign in; an email grants one person, a domain grants everyone there. You always have access.
          </p>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.deployRow}>
        <button className={styles.deploy} onClick={() => void deploy()} disabled={busy}>
          {busy ? 'Deploying…' : 'Deploy artifact'} <span className={styles.arr}>→</span>
        </button>
        <div className={styles.deployMeta}>
          Returns a live URL + edit token.<br />
          {signedIn ? 'Saved to your dashboard.' : 'No account needed.'}
        </div>
      </div>
    </div>
  );
}
