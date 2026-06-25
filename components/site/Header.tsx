import Link from 'next/link';
import { AccountMenu } from '@/components/dashboard/AccountMenu';
import { GitHubMark } from '@/components/ui/icons';
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        artifact<span>.host</span>
      </Link>
      <nav className={styles.nav}>
        <Link href="/docs">docs</Link>
        <a
          className={styles.iconLink}
          href="https://github.com/ItaiTevet/artifact.host"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          title="GitHub repository"
        >
          <GitHubMark size={18} />
        </a>
        <AccountMenu />
      </nav>
    </header>
  );
}
