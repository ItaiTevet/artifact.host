'use client';

import { useMemo, useState } from 'react';
import { buildConnectSnippets, type PlatformId } from '@/lib/web/connect';
import { PlatformIcon } from './PlatformIcon';
import styles from './ConnectPicker.module.css';

export function ConnectPicker({ mcpUrl }: { mcpUrl: string }) {
  const snippets = useMemo(() => buildConnectSnippets(mcpUrl), [mcpUrl]);
  const [active, setActive] = useState<PlatformId | null>(null);
  const [copied, setCopied] = useState(false);
  const current = snippets.find((s) => s.id === active) ?? null;

  function toggle(id: PlatformId) {
    setCopied(false);
    setActive((prev) => (prev === id ? null : id));
  }
  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — ignore */ }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>Connect your AI assistant</div>
      <div className={styles.tabs}>
        {snippets.map((s) => (
          <button
            key={s.id}
            className={`${styles.tab} ${active === s.id ? styles.activeTab : ''}`}
            onClick={() => toggle(s.id)}
          >
            <PlatformIcon id={s.id} />
            <span className={styles.tabName}>{s.name}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className={styles.snippet}>
          <div className={styles.step}>{current.step}</div>
          <pre className={styles.code}>{current.code}</pre>
          <button className={styles.copy} onClick={copy}>{copied ? 'copied ✓' : 'copy'}</button>
        </div>
      )}
    </div>
  );
}
