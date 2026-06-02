import Link from 'next/link';
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        artifact<span>.host</span>
      </Link>
      <nav className={styles.nav}>
        <Link href="/docs">docs</Link>
        {/* dashboard + sign in are wired in Plan 3b — inert for now. */}
        <span className={styles.inert} aria-disabled="true">dashboard</span>
        <span className={styles.signin} aria-disabled="true">sign in</span>
      </nav>
    </header>
  );
}
