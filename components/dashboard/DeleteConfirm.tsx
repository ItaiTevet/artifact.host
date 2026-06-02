'use client';

import styles from './DeleteConfirm.module.css';

export function DeleteConfirm({
  name, busy = false, onConfirm, onCancel,
}: { name: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className={styles.scrim} role="dialog" aria-modal="true">
      <div className={styles.box}>
        <p className={styles.msg}>Delete <strong>{name}</strong>? This removes it immediately and can’t be undone.</p>
        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={styles.confirm} onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}
