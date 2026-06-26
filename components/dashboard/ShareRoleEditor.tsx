'use client';

import { useState, type KeyboardEvent } from 'react';
import { parsePrincipals } from '@/lib/artifacts/sharing';
import type { SharePrincipal } from '@/lib/artifacts/types';
import styles from './ShareRoleEditor.module.css';

const keyOf = (p: SharePrincipal) => `${p.type}:${p.value}`;

export function ShareRoleEditor({
  principals,
  onChange,
}: {
  principals: SharePrincipal[];
  onChange: (next: SharePrincipal[]) => void;
}) {
  const [input, setInput] = useState('');

  function add() {
    const parsed = parsePrincipals(input); // emails/domains, role defaults to 'view'
    if (!parsed.length) { setInput(''); return; }
    const seen = new Set(principals.map(keyOf));
    const additions = parsed.filter((p) => !seen.has(keyOf(p)));
    if (additions.length) onChange([...principals, ...additions]);
    setInput('');
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }

  function setRole(target: SharePrincipal, role: SharePrincipal['role']) {
    onChange(principals.map((p) => (keyOf(p) === keyOf(target) ? { ...p, role } : p)));
  }

  function remove(target: SharePrincipal) {
    onChange(principals.filter((p) => keyOf(p) !== keyOf(target)));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.addRow}>
        <input
          className={styles.input}
          placeholder="Add email or @domain…"
          aria-label="Add email or domain"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <button type="button" className={styles.add} onClick={add}>Add</button>
      </div>

      <ul className={styles.list}>
        {principals.map((p) => (
          <li key={keyOf(p)} className={styles.row}>
            <span className={styles.who}>{p.type === 'domain' ? `@${p.value}` : p.value}</span>
            <span className={styles.seg}>
              <button
                type="button"
                className={p.role === 'view' ? styles.on : ''}
                aria-pressed={p.role === 'view'}
                onClick={() => setRole(p, 'view')}
              >View</button>
              <button
                type="button"
                className={p.role === 'comment' ? styles.on : ''}
                aria-pressed={p.role === 'comment'}
                onClick={() => setRole(p, 'comment')}
              >Comment</button>
            </span>
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${p.value}`}
              onClick={() => remove(p)}
            >×</button>
          </li>
        ))}
      </ul>

      {principals.length > 0 && <div className={styles.divider} />}

      <p className={styles.hint}>
        An email grants one person; a domain (e.g. <code>@yourcompany.com</code>) grants everyone there.
        Viewers must sign in. You always have comment access.
      </p>
    </div>
  );
}
