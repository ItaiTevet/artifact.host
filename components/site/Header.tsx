import Link from 'next/link';
import { AccountMenu } from '@/components/dashboard/AccountMenu';
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        artifact<span>.host</span>
      </Link>
      <nav className={styles.nav}>
        <Link href="/docs">docs</Link>
        <AccountMenu />
      </nav>
    </header>
  );
}
