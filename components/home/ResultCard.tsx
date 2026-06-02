'use client';

import { CopyButton } from '@/components/ui/CopyButton';
import { QrCode } from '@/components/ui/QrCode';
import { humanizeExpiry } from '@/lib/web/format';
import styles from './ResultCard.module.css';

export interface DeployResult {
  url: string;
  slug: string;
  edit_token: string;
  expires_at: string;
}

export function ResultCard({ result, onReset }: { result: DeployResult; onReset: () => void }) {
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <a className={styles.url} href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
        <CopyButton className={styles.copy} text={result.url} />
      </div>
      <div className={styles.token}>
        <div className={styles.tokenLabel}>Save this edit token — shown once</div>
        <div className={styles.row}>
          <code className={styles.tokenValue}>{result.edit_token}</code>
          <CopyButton className={styles.copy} text={result.edit_token} />
        </div>
      </div>
      <div className={styles.meta}>{humanizeExpiry(result.expires_at)}</div>
      <div className={styles.qr}><QrCode value={result.url} /></div>
      <div className={styles.actions}>
        <a className={styles.view} href={result.url} target="_blank" rel="noreferrer">View artifact →</a>
        <button className={styles.again} onClick={onReset}>Deploy another</button>
      </div>
    </div>
  );
}
