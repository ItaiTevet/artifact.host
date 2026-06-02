import Link from 'next/link';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <span>artifact.host</span>
      <Link href="/docs">docs</Link>
    </footer>
  );
}
