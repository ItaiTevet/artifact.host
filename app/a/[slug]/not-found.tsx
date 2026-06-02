import Link from 'next/link';
import styles from './gate.module.css';

export default function NotFound() {
  return (
    <div className={styles.wrap}>
      <div className={styles.logo}>artifact<b>.host</b></div>
      <h1 className={styles.h1}>This artifact isn’t here</h1>
      <p className={styles.muted}>
        It may have expired, or the link is wrong. Artifacts are removed when their timer runs out.
      </p>
      <p className={styles.muted} style={{ marginTop: 16 }}>
        <Link className={styles.link} href="/">Deploy a new one →</Link>
      </p>
    </div>
  );
}
