'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ArtifactListItem } from '@/lib/web/dashboard';
import { humanizeExpiry } from '@/lib/web/format';
import { DeleteConfirm } from './DeleteConfirm';
import styles from './ArtifactRow.module.css';

export function ArtifactRow({ item, onDelete }: { item: ArtifactListItem; onDelete: (slug: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const name = item.title || `/${item.slug}`;

  return (
    <div className={styles.row}>
      <div className={styles.main}>
        <div className={styles.title}>
          {item.title || 'Untitled'} <span className={styles.slug}>/{item.slug}</span>
        </div>
        <div className={styles.meta}>
          <span className={`${styles.badge} ${item.visibility === 'public' ? styles.pub : styles.pw}`}>{item.visibility}</span>
          <span>{humanizeExpiry(item.expires_at)}</span>
          <span>{item.view_count} {item.view_count === 1 ? 'view' : 'views'}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <Link className={styles.act} href={`/a/${item.slug}`} target="_blank" rel="noreferrer">Open</Link>
        <Link className={`${styles.act} ${styles.amber}`} href={`/dashboard/${item.slug}`}>Edit</Link>
        <button className={styles.act} onClick={() => setConfirming(true)}>Delete…</button>
      </div>
      {confirming && (
        <DeleteConfirm
          name={name}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onDelete(item.slug); }}
        />
      )}
    </div>
  );
}
